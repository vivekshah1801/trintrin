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
import sys

from utils import (
    DEFAULT_PORT,
    DEFAULT_SERVER,
    DEFAULT_USER,
    TrinoClient,
    print_table,
    serve,
    write_csv,
)

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
        serve(args.port, not args.no_browser, args.server)
    else:
        sql = sys.stdin.read() if args.query == '-' else args.query
        result_columns, result_rows = TrinoClient(args.server, args.user).run(sql)
        if args.output:
            write_csv(result_columns, result_rows, args.output)
        else:
            print_table(result_columns, result_rows)
