# LaBro desktop — 0.8.0

[Download the Mac app](https://github.com/bryanzhao08/labmeter-demo/releases/latest) · [User guide](../docs/GETTING_STARTED.md) · [Pilot checklist](../TESTING.md)

Home opens directly to an interactive calendar with uploads below. First-time setup offers the scheduling agent, spreadsheets or calendar exploration. Connections has separate API/export and Claude/Codex MCP sections.

## Run or build

Requires Node.js and npm for development:

```sh
npm ci
npm run desktop:start
npm run desktop:test:home
npm run desktop:test
npm run desktop:mac
```

Artifacts are in `release/`. The Mac build targets Apple silicon and is unsigned. `npm run desktop:win` targets x64 Windows, but Windows execution is not verified. The published GitHub release includes the Mac ZIP and checksum.

## Runtime and storage

- Electron 45.2.3 with sandboxed HTML/CSS/JavaScript, isolated preload IPC and Node main process.
- SheetJS 0.20.3 reads Excel offline. Shared JavaScript modules normalize and reconcile reservations, usage and prices.
- A selected export folder is read-only and watched for new files. Saved billing rules persist in local application storage; imported workspace data must be loaded again after restart.
- The practice scheduling agent uses a localhost read-only simulator, bounded tool planner, trained header mapper and private JSON run history. No hosted backend or cloud database is required.
- The optional local Ollama description parser is separate from the scheduling agent and is not required.

## Connections and boundaries

The iLab equipment connection runs in the main process against allowlisted HTTPS API hosts. Token entry uses a separate sandboxed window. Tokens use OS encryption when available, otherwise memory only. The renderer receives connection status, not the token.

Real schedules use exported files. The FBS/iLab scheduling agent currently targets independent synthetic simulators. It never changes upstream bookings or submits charges.

The Connections page generates Claude JSON or Codex TOML for the existing five-tool billing MCP. An optional checkbox includes the separate two-tool scheduling-practice MCP. Both can run with the packaged Electron binary and `ELECTRON_RUN_AS_NODE=1`, without a separate Node installation. Client settings are not modified automatically.

Default diagnostics omit source labels. Billing MCP details require explicit `--allow-details`. Folder reads reject symbolic-link components and validate a single opened descriptor; a concurrent parent-directory replacement race remains, so use a trusted source folder.

## Verification

Version 0.8.0 passed all 19 Node test files, first-run/calendar/upload smoke, full desktop billing/credential/agent smoke, and packaged Mac checks. These are synthetic-fixture checks, not evidence of live vendor access or customer time savings.

See [scheduling-agent implementation and limits](../agent/README.md) and [MCP tools](../mcp/README.md). Older workbench, sensor and campus pages remain historical prototypes; `app.html` is the current desktop entry point.
