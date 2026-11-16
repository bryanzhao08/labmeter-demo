# LaBro desktop

Version 0.8.0. This guide is for developers. Managers should start with the [user guide](../docs/GETTING_STARTED.md).

[Latest release](https://github.com/bryanzhao08/labro/releases/latest) · [Pilot testing](../TESTING.md) · [MCP server](../mcp/README.md) · [Scheduling agent](../agent/README.md)

## Run and build

You need Node.js and npm.

```sh
npm ci
npm run desktop:start       # run from source
npm run desktop:test:home   # first-run, calendar and upload smoke test
npm run desktop:test        # full desktop smoke test
npm run desktop:mac         # Apple silicon Mac ZIP
npm run desktop:win         # Windows x64 installer, build on Windows
```

Build output goes to `release/`.

- The Mac build targets Apple silicon and is unsigned.
- The Windows build has not been run on Windows.
- The GitHub release carries the Mac ZIP and a checksum file.
- A manual "Desktop builds" GitHub workflow can also produce Mac and Windows artifacts.

## What it is made of

| Part | Details |
| --- | --- |
| Shell | Electron 45.2.3, sandboxed renderer, isolated preload, Node main process |
| Excel | SheetJS 0.20.3, read offline |
| Shared logic | JavaScript modules that normalize and reconcile reservations, usage and prices |
| Entry point | `app.html` (older pages are historical prototypes) |
| Practice agent | Localhost read-only simulator, bounded tool planner, trained header mapper, private JSON run history |
| Optional | A local Ollama description parser, not required |

No hosted backend or cloud database is needed.

## Storage

- A chosen export folder is read-only and watched for new files.
- Saved billing rules persist in local application storage.
- Imported workspace data is not kept. Load it again after a restart.

## Connections

- **iLab:** the equipment connection runs in the main process against allowlisted HTTPS hosts. A separate sandboxed window takes the token.
- **Token storage:** OS encryption when available, otherwise memory only. The renderer sees connection status, never the token.
- **FBS and real schedules:** exported files only.
- **Scheduling agent:** targets synthetic simulators. It never changes upstream bookings or submits charges.
- **MCP settings:** Connections generates Claude JSON or Codex TOML for the five-tool billing server. A checkbox adds the two-tool practice server. Both run with the packaged Electron binary and `ELECTRON_RUN_AS_NODE=1`, so Node is not needed. Client settings are never edited automatically.

## Security notes

- Diagnostics omit source labels.
- Billing MCP details need `--allow-details`.
- Folder reads reject symbolic-link components and check a single opened file descriptor.
- A concurrent parent-folder replacement race remains. Use a trusted source folder.

## Verification

Version 0.8.0 passed all 19 Node test files, the first-run and calendar smoke test, the full desktop smoke test and packaged Mac checks. These use synthetic data. They are not evidence of live vendor access or time savings.
