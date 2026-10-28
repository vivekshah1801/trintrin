# Changelog

All notable changes to trintrin are listed here.

## v1.5.0 — 2026-10-28

### What's new
- **Auto-upgrade:** at most every 3 hours, running `trintrin` checks for a newer GitHub release, installs it
  and restarts into it, so new features reach everyone without `trintrin --upgrade`. If the check and download
  take more than 5 seconds in total it gives up and runs the installed version; failures are silent. Set `TRINTRIN_NO_AUTO_UPGRADE=1` to turn it
  off. Git checkouts are never touched. Installs older than v1.5.0 need one last `trintrin --upgrade`.
- **Usage stats:** the UI reports `app_upgraded` (with the previous version) the first time it opens on a new
  version. Respects the ⚙ Settings opt-out like every other event.

## v1.4.1 — 2026-10-26

### Fixes
- **Usage stats no longer blocked by ad blockers:** the UI sends events to trintrin's own local server
  (`/api/events`), which forwards them to PostHog in batches on a background thread. The UI gets an
  immediate reply, so this adds no wait to anything you do; if PostHog is slow or unreachable, events are
  dropped rather than queued without limit.
- If sending ever fails, the page stops trying until it's reloaded, so the browser console shows at most
  one error instead of one per action.

## v1.4.0 — 2026-10-26

### What's new
- **Anonymous usage stats:** the web UI reports which features are used (runs, copies, downloads, saved
  queries, filters, …) with coarse counts, an anonymous random ID, app version, browser/OS and local hour.
  Never SQL, catalog/schema/table names, hosts, users, results or error text. Turn it off in
  ⚙ Settings → *Send anonymous usage stats*.

## v1.3.0 — 2026-10-26

### What's new
- **Download as TSV:** **Download CSV ▾** now has a menu to download as CSV or TSV (`.tsv`).
- **Copy/download confirmation:** the status bar briefly highlights "Copied …" / "Downloaded …" (and
  "Share link copied") so it's easy to notice. Respects reduced-motion settings.
- **GitHub link** in the footer, next to the version.

### Fixes
- ⌘/Ctrl + C now copies checked rows right after you tick them. Before, the focused checkbox counted as
  "typing in a field" and the shortcut did nothing until you clicked elsewhere. It also works in Safari,
  which doesn't fire a copy event when nothing is selected.

## v1.2.0 — 2026-10-26

### What's new
- **Expand a cell:** click a clipped, multi-line or JSON cell to see its full value in a popover. JSON is
  pretty-printed, the text is selectable, and **Copy** puts the original value on the clipboard.
  Closes on Esc, an outside click, or scrolling the grid.
- **Fit column to contents:** double-clicking a column's resize edge now fits the full contents, up to the
  visible grid width, instead of stopping at 460px.
- **Copy CSV:** a new **Copy CSV ▾** button copies results as CSV, or as TSV from the menu (TSV pastes into
  separate Excel/Google Sheets cells). It copies the same rows and columns as **Download CSV**.
- **⌘/Ctrl + C:** with rows checked, copies them as TSV. Normal copy still works in text boxes and on
  selected text.
- The status bar confirms each copy (e.g. `Copied 42 rows × 7 cols as CSV`); copies over 50,000 rows ask
  first.
- **`trintrin --upgrade`:** updates your install to the latest GitHub release, if it is newer.
  `trintrin --version` prints the installed version. (Installs older than v1.2.0 need the install script
  re-run once to get this flag.)

## v1.1.2 — 2026-10-07

### What's new
- **Stop running queries:** a Stop button (or Esc) cancels the query on the Trino side too (#10)
- **Write-query warning:** asks for confirmation before running INSERT, UPDATE, DELETE, DROP, CREATE, ALTER,
  TRUNCATE, MERGE, REPLACE or RENAME (#10)
- **Saved queries:** UX improvements (#10)
- **Explore:** long names scroll sideways, and the sidebar can be resized (#11)
- **Installer:** detects your login shell and adds `~/.local/bin` to its PATH; set
  `TRINTRIN_NO_MODIFY_PATH=1` to opt out (#12)
- **Share:** the button shows "Copied!" for 2 seconds after copying the link (#13)
- The footer no longer links to a GitHub profile (#15)

### Fixes
- Overlapping catalog loads no longer show catalogs twice in Explore (#14)
