# trintrin

A lightweight, modular Trino console: CLI queries, CSV dumps, and a local browser UI with no external dependencies.

Trino builds each `nextUri` from the coordinator's own hostname. If you reach Trino through a port-forward, an
SSH tunnel or a bastion, that hostname does not resolve on your machine and the stock `trino` CLI simply hangs.
trintrin rewrites every `nextUri` back to the host you gave it, so queries actually finish.

## Run

```sh
kubectl port-forward svc/trino 28080:8080   # or whatever gets you to Trino
uv run trintrin.py                          # UI on http://localhost:8375
```

`./trintrin.py` works too (the shebang shells out to `uv run --script`), as does plain `python3 trintrin.py`.
There is nothing to install — `requirements.txt` is empty on purpose.

## UI

Set the host and user in the header, hit **Test connection**, then write SQL and press ⌘/Ctrl+Enter.

- **Explore** — browse catalogs → schemas → tables → columns. Use the **Snipe** button (⌖ or `⌘/Ctrl+Shift+L`) to automatically locate, expand, scroll to, and highlight the active SQL query's table in the tree (just like IntelliJ's Select Opened File). Clicking a table drops a `SELECT` into the editor; the ▶ button runs it.
- **Saved queries** — name, save, reorder (drag and drop), batch delete (multi-select), export, and import queries directly on your machine (e.g. `~/.local/share/trintrin/saved_queries.json` on Linux, `~/Library/Application Support/trintrin/` on macOS, `%APPDATA%\trintrin\` on Windows), along with the columns you had selected and any
  filters, search and sort in effect. Use **Export** / **Import** to backup or share queries across machines.
- **Results** — click a header to sort, filter per column, search across all visible columns, and pick which
  columns to show from the **Columns** menu.
- **Download CSV** — exports the checked rows, or every row matching the current filters if nothing is checked.
  Only visible columns are exported.
- **Settings & Theme** — choose between Auto (matches system theme, default), Light, or Dark from Settings. Apache Hudi metadata columns (`_hoodie_*`) are hidden by default, since they are noise in most
  queries. Turn that off if you want them.

Saved queries are stored on disk according to OS conventions (`~/.local/share/trintrin/` on Linux, `~/Library/Application Support/trintrin/` on macOS, `%APPDATA%\trintrin\` on Windows, or `$XDG_DATA_HOME/trintrin/`). Host, user, last query, sidebar width and settings live in `localStorage`, so they survive a reload.

## CLI

```sh
uv run trintrin.py -q 'SHOW CATALOGS'
uv run trintrin.py -q 'SELECT * FROM tpch.sf1.customer LIMIT 1000' -o customers.csv
echo 'SELECT 1' | uv run trintrin.py -q -
```

`-s` sets the coordinator URL (default `http://localhost:28080`), `-u` the `X-Trino-User` header,
`-p` the UI port, `--no-browser` skips opening a browser.

## Notes

The browser never talks to Trino directly — `trintrin.py` proxies every query, which keeps the page on a single
origin and avoids CORS entirely. It binds to `127.0.0.1` and has no auth, so treat it as a local dev tool.

## License

MIT
