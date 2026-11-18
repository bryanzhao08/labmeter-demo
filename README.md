# Parity

**The agentic lab management framework. You run the science. Parity runs the lab.**

Parity is a desktop app that helps a shared lab keep its bookings, instrument use and billing in order. A crew of agents prepares the month, and you approve the result.

## What it does

- Reads your reservation exports, instrument usage logs and price sheet.
- Matches each booking with the time the instrument actually ran.
- Applies your own rates, tiers and after-hours rules.
- Flags no-shows, overruns and outliers for review.
- Exports a charges file only after you approve it.

Your files stay on your computer. Parity never changes your scheduling system.

## Download

- [Latest release on GitHub](https://github.com/bryanzhao08/parity/releases/latest) (Mac, Apple silicon)
- [Download page](https://bryanzhao08.github.io/parity/site/download.html) with first-launch tips
- [Project site](https://bryanzhao08.github.io/parity/site/)

The build is unsigned, and Windows has not been verified.

## Try it in 2 minutes

1. Open Parity.
2. Choose **Try the scheduling agent**.
3. Pick **FBS practice**.
4. Select **Run**, then read the schedule it collects.

The practice data is synthetic. For the full walkthrough, see [Getting started](docs/GETTING_STARTED.md).

## How it works

Six selectable, locally trained agents prepare the month — powered by 7 built-in local ML models (with optional local Ollama LLM routing/briefings), **Ask the Crew** autopilot, and live-synced MCP tools so Claude or Codex can summon any agent individually:

- **Sherlock Ohms (Source Scout):** detects the booking system, classifies spreadsheets/telemetry, and hashes provenance.
- **Sir Slots-a-Lot (Schedule Puller):** pulls paginated bookings, maps columns via ML, and blocks invalid rows.
- **Count Wattula (Plug & Log Collector):** collects workstation logon logs and smart-plug watt streams, separating active runs from standby file-copying.
- **Dr. Venn (Session Matcher):** pairs every booking with PC & smart-plug runs, isolating walk-ups and no-shows.
- **Baron Von Markup (Rate & Rule Pricer):** applies your rates, tiers, rounding steps, and after-hours windows.
- **Captain Nitpick (Discrepancy Auditor):** classifies overruns, no-shows, walk-ups, short sessions, and outliers for one-click approval.

## For developers

```sh
npm ci
for f in tests/*.test.cjs; do node "$f"; done
npm run desktop:test
npm run desktop:mac    # Apple silicon Mac ZIP
npm run desktop:win    # Windows x64 installer, build on Windows
```

Run `npm run desktop:start` to launch the app from source.

## Documentation

- [Getting started](docs/GETTING_STARTED.md): a walkthrough for core managers.
- [Pilot testing and known limits](TESTING.md)
- [Desktop app and build guide](desktop/README.md)
- [MCP server](mcp/README.md): let Claude or Codex check a month.
- [Scheduling agent](agent/README.md): architecture, training and limits.

## Older prototypes

Earlier work used simulated sensors and a browser-only demo. Those pages are kept for history and are not the current app:

- `overview.html`, `lab.html`: sensor overview and 3D lab simulator.
- `close.html`, `workbench.html`: earlier month-end and reconciliation pages.

`app.html` is the current desktop entry point. All bundled data is synthetic.

## Contact

zhaobrya@usc.edu
