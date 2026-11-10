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
