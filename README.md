# trintrin

A small Trino console: one Python file, one HTML file, no dependencies.

Trino builds each `nextUri` from the coordinator's own hostname. If you reach Trino through a port-forward, an
SSH tunnel or a bastion, that hostname does not resolve on your machine and the stock `trino` CLI simply hangs.
trintrin rewrites every `nextUri` back to the host you gave it, so queries actually finish.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/vivekshah1801/trintrin/main/install.sh | sh
```

Drops `trintrin.py` and `trintrin.html` into `~/.trintrin/` and puts a `trintrin` launcher on
`~/.local/bin` (add that to your `PATH` if the installer says it's missing). Needs `python3` or `uv`
already on your machine — nothing else.

## Run

```sh
kubectl port-forward svc/trino 28080:8080   # or whatever gets you to Trino
trintrin                                    # UI on http://localhost:8375
```

Cloned the repo instead? `uv run trintrin.py` works, and so does `./trintrin.py` (the shebang shells
out to `uv run --script`) or plain `python3 trintrin.py`. There is nothing to install — `requirements.txt`
is empty on purpose.

## UI

Set the host and user in the header, hit **Test connection**, then write SQL and press ⌘/Ctrl+Enter.

- **Explore** — browse catalogs → schemas → tables → columns. Clicking a table drops a `SELECT` into the editor;
  the ▶ button runs it.
- **Saved queries** — name and store queries in the browser, along with the columns you had selected and any
  filters, search and sort in effect. Click one to load it, then run it to get that view back.
- **Results** — click a header to sort, filter per column, search across all visible columns, and pick which
  columns to show from the **Columns** menu.
- **Download CSV** — exports the checked rows, or every row matching the current filters if nothing is checked.
  Only visible columns are exported.
- **Settings** — Apache Hudi metadata columns (`_hoodie_*`) are hidden by default, since they are noise in most
  queries. Turn that off if you want them.

Host, user, last query, saved queries and settings live in `localStorage`, so they survive a reload.

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
