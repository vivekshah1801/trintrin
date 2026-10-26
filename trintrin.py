#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""trintrin - a single-file Trino console: CLI queries, CSV dumps, and a local browser UI.

Trino hands back a `nextUri` built from the coordinator's own hostname. When you reach Trino through a
port-forward, an SSH tunnel or a bastion, that hostname does not resolve on your machine and the stock `trino`
CLI hangs. Every response here is re-pointed at the server you actually gave it before it is polled.

Usage
    python trintrin.py                                  serve the UI on http://localhost:8375
    python trintrin.py -p 9000 --no-browser             serve elsewhere, do not open a browser
    python trintrin.py -q 'SHOW CATALOGS'               run one query and print it
    python trintrin.py -q 'SELECT ...' -o out.csv       run one query and write a CSV
    echo 'SELECT 1' | python trintrin.py -q -           read the query from stdin
    python trintrin.py --upgrade                        update to the latest GitHub release
"""

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer

VERSION = '1.4.0'
REPO = 'vivekshah1801/trintrin'
APP_FILES = ('trintrin.py', 'trintrin.html')

# Single-user tool; track cancellation state for the one in-flight query.
_query_state = {'cancel': False, 'next_uri': None, 'lock': threading.Lock()}

DEFAULT_SERVER = 'http://localhost:28080'
DEFAULT_USER = 'trintrin'
DEFAULT_PORT = 8375
POLL_INTERVAL_SECONDS = 0.1
REQUEST_TIMEOUT_SECONDS = 30
MAX_BODY_BYTES = 1 << 20
UI_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trintrin.html')


class TrinoClient:
    """Talks to Trino over its REST API, rewriting every `nextUri` back to the server we can actually reach."""

    def __init__(self, server, user):
        self.server = (server or DEFAULT_SERVER).rstrip('/')
        self.user = user or DEFAULT_USER

    def _rewrite(self, uri):
        parsed = urllib.parse.urlparse(uri)
        return urllib.parse.urlunparse(parsed._replace(netloc=urllib.parse.urlparse(self.server).netloc))

    def _get_json(self, uri):
        request = urllib.request.Request(uri, headers={'X-Trino-User': self.user})
        return json.load(urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS))

    def _delete(self, uri):
        """Send DELETE to uri to cancel a Trino query (best-effort)."""
        req = urllib.request.Request(uri, method='DELETE', headers={'X-Trino-User': self.user})
        try:
            urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS)
        except Exception:
            pass

    def info(self):
        """Returns the coordinator's /v1/info payload, used by the UI's connection test."""
        return self._get_json('{}/v1/info'.format(self.server))

    def run(self, sql):
        """Runs `sql` to completion and returns (columns, rows)."""
        with _query_state['lock']:
            _query_state['cancel'] = False
            _query_state['next_uri'] = None

        request = urllib.request.Request(
            '{}/v1/statement'.format(self.server),
            data=sql.encode('utf-8'),
            headers={'X-Trino-User': self.user, 'Content-Type': 'text/plain'},
        )
        response = json.load(urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS))

        columns = None
        rows = []
        while True:
            if 'error' in response:
                raise RuntimeError(response['error'].get('message', 'unknown Trino error'))
            if columns is None and response.get('columns'):
                columns = [column['name'] for column in response['columns']]
            rows.extend(response.get('data') or [])
            next_uri = response.get('nextUri')
            if not next_uri:
                with _query_state['lock']:
                    _query_state['next_uri'] = None
                return columns or [], rows
            rewritten = self._rewrite(next_uri)
            with _query_state['lock']:
                if _query_state['cancel']:
                    self._delete(rewritten)
                    raise RuntimeError('Query cancelled')
                _query_state['next_uri'] = rewritten
            time.sleep(POLL_INTERVAL_SECONDS)
            response = self._get_json(rewritten)


class TrintrinHandler(BaseHTTPRequestHandler):
    """Serves the single-page UI and proxies its queries, so the browser only ever talks to this origin."""

    def log_message(self, fmt, *args):
        sys.stderr.write("{} {}\n".format(self.address_string(), fmt % args))

    def _respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _respond_json(self, status, payload):
        self._respond(status, json.dumps(payload).encode('utf-8'), 'application/json')

    def _read_request(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY_BYTES:
            raise ValueError('request body too large')
        return json.loads(self.rfile.read(length) or b'{}')

    def do_GET(self):
        if self.path.split('?')[0] not in ('/', '/index.html'):
            self._respond_json(404, {'error': 'not found'})
            return
        try:
            with open(UI_FILE, 'rb') as handle:
                page = handle.read().replace(b'{{version}}', VERSION.encode('ascii'))
            self._respond(200, page, 'text/html; charset=utf-8')
        except IOError as error:
            self._respond_json(500, {'error': 'cannot read {}: {}'.format(UI_FILE, error)})

    def do_POST(self):
        if self.path not in ('/api/query', '/api/ping', '/api/cancel'):
            self._respond_json(404, {'error': 'not found'})
            return

        try:
            request = self._read_request()
        except ValueError as error:
            self._respond_json(400, {'error': 'bad request: {}'.format(error)})
            return

        client = TrinoClient(request.get('server'), request.get('user'))

        if self.path == '/api/cancel':
            with _query_state['lock']:
                _query_state['cancel'] = True
                uri = _query_state['next_uri']
            if uri:
                client._delete(uri)
            self._respond_json(200, {'ok': True})
            return

        if self.path == '/api/ping':
            started = time.time()
            try:
                info = client.info()
            except Exception as error:
                self._respond_json(200, {'error': describe(error)})
                return
            self._respond_json(200, {
                'server': client.server,
                'version': (info.get('nodeVersion') or {}).get('version'),
                'environment': info.get('environment'),
                'state': info.get('state'),
                'uptime': info.get('uptime'),
                'elapsed_ms': int((time.time() - started) * 1000),
            })
            return

        sql = (request.get('sql') or '').strip().rstrip(';')
        if not sql:
            self._respond_json(400, {'error': 'no SQL provided'})
            return
        try:
            columns, rows = client.run(sql)
        except Exception as error:
            self._respond_json(200, {'error': describe(error)})
            return
        self._respond_json(200, {'columns': columns, 'rows': rows})


def describe(error):
    return '{}: {}'.format(type(error).__name__, error)


def write_csv(columns, rows, path):
    with open(path, 'w', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for row in rows:
            writer.writerow(['' if value is None else value for value in row])
    print("Wrote {} rows x {} columns to {}".format(len(rows), len(columns), path))


def print_table(columns, rows):
    print('\t'.join(columns))
    print('\t'.join('-' * len(column) for column in columns))
    for row in rows:
        print('\t'.join('NULL' if value is None else str(value) for value in row))
    print("({} rows)".format(len(rows)), file=sys.stderr)


def version_tuple(tag):
    return tuple(int(part) for part in re.findall(r'\d+', tag)[:3])


def fetch(url):
    """GETs url. Prefers curl (as install.sh does): python.org's macOS builds often lack CA certs."""
    if shutil.which('curl'):
        return subprocess.run(['curl', '-fsSL', '--max-time', str(REQUEST_TIMEOUT_SECONDS), url],
                              check=True, stdout=subprocess.PIPE).stdout
    return urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS).read()


def upgrade():
    """Replaces this install's trintrin.py and trintrin.html with the latest GitHub release's copies."""
    app_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.exists(os.path.join(app_dir, '.git')):
        sys.exit('{} is a git checkout; update it with `git pull` instead.'.format(app_dir))

    tag = json.loads(fetch('https://api.github.com/repos/{}/releases/latest'.format(REPO)))['tag_name']
    if version_tuple(tag) <= version_tuple(VERSION):
        print('trintrin v{} is up to date (latest release: {}).'.format(VERSION, tag))
        return

    # Download everything before touching the install, so a failed download leaves it intact.
    staged = []
    try:
        for name in APP_FILES:
            url = 'https://raw.githubusercontent.com/{}/{}/{}'.format(REPO, tag, name)
            body = fetch(url)
            handle, temp_path = tempfile.mkstemp(dir=app_dir, prefix='.' + name + '.')
            with os.fdopen(handle, 'wb') as out:
                out.write(body)
            staged.append((temp_path, os.path.join(app_dir, name)))
        for temp_path, final_path in staged:
            os.chmod(temp_path, 0o755 if final_path.endswith('.py') else 0o644)
            os.replace(temp_path, final_path)
    finally:
        for temp_path, _ in staged:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    print('Upgraded trintrin v{} -> {} in {}'.format(VERSION, tag, app_dir))


def serve(port, open_browser):
    url = 'http://localhost:{}'.format(port)
    print("trintrin serving {} (default Trino target {})".format(url, DEFAULT_SERVER))
    if open_browser:
        webbrowser.open(url)
    try:
        ThreadingHTTPServer(('127.0.0.1', port), TrintrinHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('-q', '--query', help="SQL to run instead of serving the UI ('-' reads stdin)")
    parser.add_argument('-o', '--output', help='Write query results to this CSV file instead of stdout')
    parser.add_argument('-s', '--server', default=DEFAULT_SERVER, help='Trino coordinator URL')
    parser.add_argument('-u', '--user', default=DEFAULT_USER, help='Value for the X-Trino-User header')
    parser.add_argument('-p', '--port', type=int, default=DEFAULT_PORT, help='Port to serve the UI on')
    parser.add_argument('--no-browser', action='store_true', help='Do not open a browser window on startup')
    parser.add_argument('--upgrade', action='store_true', help='Update trintrin to the latest GitHub release')
    parser.add_argument('--version', action='version', version='trintrin v' + VERSION)
    args = parser.parse_args()

    if args.upgrade:
        try:
            upgrade()
        except Exception as error:
            sys.exit('Upgrade failed: {}'.format(describe(error)))
    elif args.query is None:
        serve(args.port, not args.no_browser)
    else:
        sql = sys.stdin.read() if args.query == '-' else args.query
        result_columns, result_rows = TrinoClient(args.server, args.user).run(sql)
        if args.output:
            write_csv(result_columns, result_rows, args.output)
        else:
            print_table(result_columns, result_rows)
