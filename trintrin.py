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
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

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

    def info(self):
        """Returns the coordinator's /v1/info payload, used by the UI's connection test."""
        return self._get_json('{}/v1/info'.format(self.server))

    def run(self, sql):
        """Runs `sql` to completion and returns (columns, rows)."""
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
                return columns or [], rows
            time.sleep(POLL_INTERVAL_SECONDS)
            response = self._get_json(self._rewrite(next_uri))


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
                self._respond(200, handle.read(), 'text/html; charset=utf-8')
        except IOError as error:
            self._respond_json(500, {'error': 'cannot read {}: {}'.format(UI_FILE, error)})

    def do_POST(self):
        if self.path not in ('/api/query', '/api/ping'):
            self._respond_json(404, {'error': 'not found'})
            return

        try:
            request = self._read_request()
        except ValueError as error:
            self._respond_json(400, {'error': 'bad request: {}'.format(error)})
            return

        client = TrinoClient(request.get('server'), request.get('user'))

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


def serve(port, open_browser):
    url = 'http://localhost:{}'.format(port)
    print("trintrin serving {} (default Trino target {})".format(url, DEFAULT_SERVER))
    if open_browser:
        webbrowser.open(url)
    try:
        HTTPServer(('127.0.0.1', port), TrintrinHandler).serve_forever()
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
    args = parser.parse_args()

    if args.query is None:
        serve(args.port, not args.no_browser)
    else:
        sql = sys.stdin.read() if args.query == '-' else args.query
        result_columns, result_rows = TrinoClient(args.server, args.user).run(sql)
        if args.output:
            write_csv(result_columns, result_rows, args.output)
        else:
            print_table(result_columns, result_rows)
