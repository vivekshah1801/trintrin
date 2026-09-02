"""Trino REST API client and error formatting."""

import json
import time
import urllib.parse
import urllib.request

from .config import (
    DEFAULT_SERVER,
    DEFAULT_USER,
    POLL_INTERVAL_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
)


def describe(error):
    return f'{type(error).__name__}: {error}'


class TrinoClient:
    """Talks to Trino over its REST API, rewriting every `nextUri` back to the server we can actually reach."""

    def __init__(self, server=None, user=None):
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
        return self._get_json(f'{self.server}/v1/info')

    def run(self, sql):
        """Runs `sql` to completion and returns (columns, rows)."""
        request = urllib.request.Request(
            f'{self.server}/v1/statement',
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
