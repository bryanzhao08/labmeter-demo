# LaBro desktop preview
Local desktop edition of the existing demo. No account or server is required.
Requests, rules and decisions persist in this application's storage, separately from your browser.
Uploaded source files still need to be imported when reopening. Roles remain views, not access control.

## Use on Apple Silicon Mac
Unzip the release, then drag LaBro.app into Applications and launch it.
This preview is not Developer ID signed or notarized; macOS may block opening it.
A signed public release requires the owner's Apple developer signing setup.

CSV and Excel import, review, requests, rules, pricing and campus summaries work offline.
The app blocks network requests; external documentation opens in your normal browser.
The Windows collector remains a separate optional utility, not installed automatically.
No live FBS/iLab API, shared database, authentication or automatic updates are included.

## Build
Node.js and npm required:
- npm ci
- npm run desktop:test
- npm run desktop:mac
- npm run desktop:win (Windows build host recommended)

Artifacts are in release/. The mac build targets Apple Silicon; Windows targets x64.
Dependencies are pinned in package-lock.json. Spreadsheet reader license is in vendor/.

## Instrument folders (0.2)
Open Instrument folders from the app navigation. Choose the folder designated by
the instrument manager (or an approved server copy), filter filenames and select
the timing logs. Map user/start/end columns and label the evidence as acquisition,
computer session, or reservation. Preview before downloading evidence CSV.
Profiles persist; filesystem access does not: reselect the folder after reopening.
Only selected delimited text logs are read. Maximum 200 candidates, 2 MB each,
10 MB per preview. Invalid rows and overlapping intervals block export. Exact
duplicates are removed. Source path and row travel with every interval.
Times must be ISO YYYY-MM-DD HH:mm:ss in the instrument's local time, or ISO UTC
ending in Z. Local DST ambiguities require source review.

This is NOT a validated Bruker/Varian/NMR adapter, background sync service, data
backup, user-account provisioning, or an FBS API integration. File modification
times are never converted into usage. Evidence export is separate from billing;
it does not apply acquisition-only policy to the existing billing engine.
For a new instrument, obtain a sanitized log sample and compare one known session
to the software's display before defining an adapter and approving its output.

## Reconciliation workspace (0.3)
New startup screen: workbench.html. CSV/Excel worksheet selection, adjustable mapping,
raw login-event reconstruction, paired intervals, booking/usage timelines and a review
queue. Policy bases: booked, observed, or union (overlap counted once).
Only ready rows export; missing source endpoints block export. Review reasons accompany
accepted exceptions. Rates and rounding are editable, but rates are currently per service
for the batch, and rounding is per user/instrument/day. Source/review state is not restored
after restart. See README.md for remaining limits.

## 0.6: folder, connections and MCP
- The app reads one folder the person chooses (read-only) and recognises reservation exports, usage logs and price sheets by content. New files are picked up while the app is open.
- Connections page: identifies the booking system from its web address or installed software. iLab connects with an API token (stored encrypted in the main process, sent only to iLab's API servers). FBS connects through exported files because its web service is not publicly documented.
- `mcp/labro-mcp.cjs` is a read-only MCP server over the same folder. The packaged app can run it with `ELECTRON_RUN_AS_NODE=1`; the Connections page prints the settings.
- Network: the page itself still cannot reach the internet. Only the main process calls the iLab API hosts listed in `desktop/main.cjs`.
- See `TESTING.md` for the steps to give a core manager.
