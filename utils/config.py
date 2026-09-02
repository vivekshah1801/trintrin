"""Configuration constants and paths for trintrin."""

import os

DEFAULT_SERVER = 'http://localhost:28080'
DEFAULT_USER = 'trintrin'
DEFAULT_PORT = 8375
POLL_INTERVAL_SECONDS = 0.1
REQUEST_TIMEOUT_SECONDS = 30
MAX_BODY_BYTES = 1 << 20

# Root directory of the trintrin project
STATIC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_FILE = os.path.join(STATIC_DIR, 'trintrin.html')

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
}
