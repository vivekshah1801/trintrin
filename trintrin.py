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
    python trintrin.py --upgrade                        update to the latest GitHub release now

Installs also update themselves: at most every 3 hours, a run checks GitHub for a newer release, installs it and
restarts into it; if that takes over 5 seconds it gives up and runs the installed version. Set TRINTRIN_NO_AUTO_UPGRADE=1 to turn that off.
"""

import argparse
import csv
import json
import os
import queue
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

VERSION = '1.5.0'
REPO = 'vivekshah1801/trintrin'
APP_FILES = ('trintrin.py', 'trintrin.html')
AUTO_UPGRADE_INTERVAL_SECONDS = 3 * 60 * 60
AUTO_UPGRADE_TIMEOUT_SECONDS = 5   # whole check + download; keeps startup snappy when GitHub is slow
AUTO_UPGRADE_STAMP = '.last-upgrade-check'   # in the install dir; its mtime is the last check

# Anonymous usage events from the UI are posted to /api/events and forwarded here, so browser ad blockers
# (which block posthog.com) don't drop them. Only this project key and endpoint are ever used.
POSTHOG_KEY = 'phc_mHJ6A5FevUvyUaqgU2YUrbHMysFE7pwtep8RGYkHMcpa'
POSTHOG_BATCH_URL = 'https://us.i.posthog.com/batch/'
EVENT_FIELDS = ('event', 'distinct_id', 'timestamp', 'properties')
EVENT_BATCH_SIZE = 50
_events = queue.Queue(maxsize=500)   # bounded: if PostHog is slow or unreachable, extra events are dropped

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
        if self.path == '/api/events':
            return
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

    def _queue_event(self):
        """Accepts one usage event and returns at once; a background thread sends it to PostHog."""
        try:
            event = self._read_request()
        except ValueError:
            self._respond_json(400, {'error': 'bad event'})
            return
        if not isinstance(event, dict) or not isinstance(event.get('event'), str):
            self._respond_json(400, {'error': 'bad event'})
            return
        try:
            _events.put_nowait({key: event[key] for key in EVENT_FIELDS if key in event})
        except queue.Full:
            pass
        self._respond_json(202, {})

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
        if self.path == '/api/events':
            self._queue_event()
            return
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


def fetch(url, deadline=None):
    """GETs url, giving up at `deadline` (a time.time() value) if given.

    Prefers curl (as install.sh does): python.org's macOS builds often lack CA certs.
    """
    timeout = REQUEST_TIMEOUT_SECONDS
    if deadline is not None:
        timeout = deadline - time.time()
        if timeout <= 0:
            raise TimeoutError('gave up fetching {}'.format(url))
    if shutil.which('curl'):
        return subprocess.run(['curl', '-fsSL', '--max-time', '{:.1f}'.format(max(timeout, 0.1)), url],
                              check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
    return urllib.request.urlopen(url, timeout=timeout).read()


def post_json(url, payload):
    """POSTs JSON to url, preferring curl for the same CA-certificate reason as fetch()."""
    body = json.dumps(payload).encode('utf-8')
    if shutil.which('curl'):
        subprocess.run(['curl', '-fsS', '--max-time', str(REQUEST_TIMEOUT_SECONDS), '-X', 'POST',
                        '-H', 'Content-Type: application/json', '--data-binary', '@-', url],
                       input=body, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    request = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS).read()


def forward_events():
    """Background loop: waits for an event, gathers whatever else is queued, sends them as one batch."""
    while True:
        batch = [_events.get()]
        while len(batch) < EVENT_BATCH_SIZE:
            try:
                batch.append(_events.get_nowait())
            except queue.Empty:
                break
        try:
            post_json(POSTHOG_BATCH_URL, {'api_key': POSTHOG_KEY, 'batch': batch})
        except Exception:
            pass   # usage stats are best-effort; never surface their failures


def app_dir():
    return os.path.dirname(os.path.abspath(__file__))


def latest_tag(deadline=None):
    url = 'https://api.github.com/repos/{}/releases/latest'.format(REPO)
    return json.loads(fetch(url, deadline))['tag_name']


def install_release(tag, deadline=None):
    """Replaces this install's trintrin.py and trintrin.html with the copies from release `tag`."""
    # Download everything before touching the install, so a failed download leaves it intact.
    staged = []
    try:
        for name in APP_FILES:
            url = 'https://raw.githubusercontent.com/{}/{}/{}'.format(REPO, tag, name)
            body = fetch(url, deadline)
            handle, temp_path = tempfile.mkstemp(dir=app_dir(), prefix='.' + name + '.')
            with os.fdopen(handle, 'wb') as out:
                out.write(body)
            staged.append((temp_path, os.path.join(app_dir(), name)))
        for temp_path, final_path in staged:
            os.chmod(temp_path, 0o755 if final_path.endswith('.py') else 0o644)
            os.replace(temp_path, final_path)
    finally:
        for temp_path, _ in staged:
            if os.path.exists(temp_path):
                os.remove(temp_path)


def upgrade():
    """`--upgrade`: installs the latest GitHub release now, if it is newer than this one."""
    if os.path.exists(os.path.join(app_dir(), '.git')):
        sys.exit('{} is a git checkout; update it with `git pull` instead.'.format(app_dir()))
    tag = latest_tag()
    if version_tuple(tag) <= version_tuple(VERSION):
        print('trintrin v{} is up to date (latest release: {}).'.format(VERSION, tag))
        return
    install_release(tag)
    print('Upgraded trintrin v{} -> {} in {}'.format(VERSION, tag, app_dir()))


def auto_upgrade():
    """On startup, at most every 3 hours: installs a newer release if there is one, then restarts into it.

    Best-effort and quiet: if the check and download together take over AUTO_UPGRADE_TIMEOUT_SECONDS, or anything
    fails (offline, GitHub rate limit, read-only install), it just runs this version.
    Messages go to stderr so `-q` output on stdout stays clean.
    """
    if os.environ.get('TRINTRIN_NO_AUTO_UPGRADE') or os.path.exists(os.path.join(app_dir(), '.git')):
        return
    stamp = os.path.join(app_dir(), AUTO_UPGRADE_STAMP)
    try:
        if time.time() - os.path.getmtime(stamp) < AUTO_UPGRADE_INTERVAL_SECONDS:
            return
    except OSError:
        pass   # never checked yet
    try:
        # Stamp before checking, so a failing check is retried 3 hours later rather than on every run.
        with open(stamp, 'w'):
            pass
        deadline = time.time() + AUTO_UPGRADE_TIMEOUT_SECONDS
        tag = latest_tag(deadline)
        if version_tuple(tag) <= version_tuple(VERSION):
            return
        install_release(tag, deadline)
    except Exception:
        return
    print('trintrin auto-upgraded v{} -> {}; see https://github.com/{}/releases'.format(VERSION, tag, REPO),
          file=sys.stderr)
    script = os.path.join(app_dir(), 'trintrin.py')
    os.execv(sys.executable, [sys.executable, script] + sys.argv[1:])


def serve(port, open_browser):
    url = 'http://localhost:{}'.format(port)
    print("trintrin serving {} (default Trino target {})".format(url, DEFAULT_SERVER))
    threading.Thread(target=forward_events, daemon=True).start()
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
    parser.add_argument('--upgrade', action='store_true', help='Update trintrin to the latest GitHub release now')
    parser.add_argument('--version', action='version', version='trintrin v' + VERSION)
    args = parser.parse_args()

    if args.upgrade:
        try:
            upgrade()
        except Exception as error:
            sys.exit('Upgrade failed: {}'.format(describe(error)))
        sys.exit()

    auto_upgrade()
    if args.query is None:
        serve(args.port, not args.no_browser)
    else:
        sql = sys.stdin.read() if args.query == '-' else args.query
        result_columns, result_rows = TrinoClient(args.server, args.user).run(sql)
        if args.output:
            write_csv(result_columns, result_rows, args.output)
        else:
            print_table(result_columns, result_rows)
