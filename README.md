# trintrin

A small Trino console: Ruthlessly simple.
Single python file, single HTML with embedded JS & CSS, no dependancies.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/vivekshah1801/trintrin/main/install.sh | sh
```

Drops `trintrin.py` and `trintrin.html` into `~/.trintrin/` and puts a `trintrin` launcher on
`~/.local/bin`. If that directory isn't on your `PATH`, the installer detects your shell (zsh, bash,
fish, tcsh/csh, ksh, sh/dash) and adds it to the matching startup file, e.g. `~/.zshrc`. Set
`TRINTRIN_NO_MODIFY_PATH=1` to skip that and just print the line to add. Needs `python3` or `uv`
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
  columns to show from the **Columns** menu. Drag a header edge to resize a column, or double-click it to fit
  the contents. Click a clipped cell to see its full value (JSON is pretty-printed) and copy it.
- **Copy / Download CSV** — copies or downloads (as CSV or TSV) the checked rows, or every row matching the
  current filters if nothing is checked. Only visible columns are exported. With rows checked, ⌘/Ctrl + C
  copies them as TSV, ready to paste into Excel or Google Sheets.
- **Share Query** — Gives a embedded URL with current SQL. Paste it to a different browser tab or share
  with teammate. Opens the same query by decoding the URL.

Host, user, last query, saved queries and settings live in `localStorage`, so they survive a reload. Saved inside browser, never sent across the network.

The web UI sends anonymous usage stats (which features are used, never queries, table names or data); turn it off in ⚙ Settings.

## CLI

```sh
uv run trintrin.py -q 'SHOW CATALOGS'
uv run trintrin.py -q 'SELECT * FROM tpch.sf1.customer LIMIT 1000' -o customers.csv
echo 'SELECT 1' | uv run trintrin.py -q -
```

`-s` sets the coordinator URL (default `http://localhost:28080`), `-u` the `X-Trino-User` header,
`-p` the UI port, `--no-browser` skips opening a browser.

### Upgrade

trintrin keeps itself up to date: at most every 3 hours, running `trintrin` checks for a newer
[GitHub release](https://github.com/vivekshah1801/trintrin/releases), installs it over your install (in
`~/.trintrin`) and restarts into it. If that takes more than 5 seconds, or GitHub is unreachable, it gives up
and runs the version you have. Set
`TRINTRIN_NO_AUTO_UPGRADE=1` to turn this off.

```sh
trintrin --upgrade
```

Upgrades right away instead of waiting for the next check. `trintrin --version` shows the installed version.
Neither applies to git checkouts — use `git pull` there.

## Notes

The browser never talks to Trino directly — `trintrin.py` proxies every query, which keeps the page on a single
origin and avoids CORS entirely. It binds to `127.0.0.1` and has no auth, so treat it as a local dev tool.

This is fun little project I carved after spending hours on debugging trino data.
Intentionally trintrin does not have extravagant features or performance optimision like full blown data IDE. 
Open up an issue for new feature requests or reporting bugs.

## License

MIT
