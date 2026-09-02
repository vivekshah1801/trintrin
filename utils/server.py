"""HTTP Server and request handler for trintrin UI and API endpoints."""

import json
import os
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

from .client import TrinoClient, describe
from .config import DEFAULT_SERVER, MAX_BODY_BYTES, MIME_TYPES, STATIC_DIR, UI_FILE
from .storage import load_saved_queries, store_saved_queries


class TrintrinHandler(BaseHTTPRequestHandler):
    """Serves the single-page UI and proxies its queries, so the browser only ever talks to this origin."""

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

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
        clean_path = self.path.split('?')[0].lstrip('/')
        if not clean_path or clean_path == 'index.html':
            target_file = UI_FILE
        elif clean_path == 'api/saved':
            self._respond_json(200, {'saved': load_saved_queries()})
            return
        else:
            # Prevent path traversal outside STATIC_DIR
            norm_path = os.path.normpath(clean_path)
            if norm_path.startswith('..') or os.path.isabs(norm_path):
                self._respond_json(403, {'error': 'forbidden'})
                return
            target_file = os.path.join(STATIC_DIR, norm_path)

        if os.path.isfile(target_file):
            ext = os.path.splitext(target_file)[1].lower()
            content_type = MIME_TYPES.get(ext, 'application/octet-stream')
            try:
                with open(target_file, 'rb') as handle:
                    self._respond(200, handle.read(), content_type)
                return
            except OSError as error:
                self._respond_json(500, {'error': f'cannot read {target_file}: {error}'})
                return

        self._respond_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path not in ('/api/query', '/api/ping', '/api/saved'):
            self._respond_json(404, {'error': 'not found'})
            return

        try:
            request = self._read_request()
        except ValueError as error:
            self._respond_json(400, {'error': f'bad request: {error}'})
            return

        if self.path == '/api/saved':
            saved = request.get('saved')
            if not isinstance(saved, list):
                self._respond_json(400, {'error': 'expected "saved" to be a list'})
                return
            try:
                store_saved_queries(saved)
                self._respond_json(200, {'saved': saved})
            except Exception as error:
                self._respond_json(500, {'error': f'cannot save queries: {error}'})
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


def serve(port, open_browser, server_url=DEFAULT_SERVER):
    url = f'http://localhost:{port}'
    print(f"trintrin serving {url} (default Trino target {server_url})")
    if open_browser:
        webbrowser.open(url)
    try:
        HTTPServer(('127.0.0.1', port), TrintrinHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
