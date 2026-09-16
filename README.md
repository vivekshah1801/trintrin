# trintrin

A small Trino console: Ruthlessly simple.
Single python file, single HTML with embedded JS & CSS, no dependancies.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/vivekshah1801/trintrin/main/install.sh | sh
```

Drops `trintrin.py` and `trintrin.html` into `~/.trintrin/` and puts a `trintrin` launcher on
`~/.local/bin` (add that to your `PATH` if the installer says it's missing). Needs `python3` or `uv`
already on your machine.

## Run

```sh
kubectl port-forward svc/trino 28080:8080   # or whatever gets you to Trino
trintrin                                    # UI on http://localhost:8375
```

Cloned the repo instead? `uv run trintrin.py` works, and so does `./trintrin.py` (the shebang shells
out to `uv run --script`) or plain `python3 trintrin.py`. There is nothing to install — `requirements.txt`
is empty on purpose.

## Features

- **Explore** — browse catalogs → schemas → tables → columns. Clicking a table drops a `SELECT` into the editor;
- **Saved queries** — name and store queries in the browser, along with the columns you had selected and any
  filters, search and sort in effect. Click one to load it, then run it to get that view back.
- **Results** — click a header to sort, filter per column, search across all visible columns, and pick which
  columns to show from the **Columns** menu.
- **Download CSV** — exports the checked rows, or every row matching the current filters if nothing is checked.
  Only visible columns are exported.
- **Share Query** — Gives a embedded URL with current SQL. Paste it to a different browser tab or share
  with teammate. Opens the same query by decoding the URL.

Host, user, last query, saved queries and settings live in `localStorage`, so they survive a reload. Saved inside browser, never sent across the network.

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

This is fun little project I carved after spending hours on debugging trino data.
Intentionally trintrin does not have extravagant features or performance optimision like full blown data IDE. 
Open up an issue for new feature requests or reporting bugs.

## License

MIT
