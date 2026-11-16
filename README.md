# LaBro

**The agentic lab management framework. You run the science. LaBro runs the lab.**

LaBro is a desktop app that helps a shared lab keep its bookings, instrument use and billing in order. A crew of agents prepares the month, and you approve the result.

## What it does

- Reads your reservation exports, instrument usage logs and price sheet.
- Matches each booking with the time the instrument actually ran.
- Applies your own rates, tiers and after-hours rules.
- Flags no-shows, overruns and outliers for review.
- Exports a charges file only after you approve it.

Your files stay on your computer. LaBro never changes your scheduling system.

## Download

- [Latest release on GitHub](https://github.com/bryanzhao08/labro/releases/latest) (Mac, Apple silicon)
- [Download page](https://bryanzhao08.github.io/labro/site/download.html) with first-launch tips
- [Project site](https://bryanzhao08.github.io/labro/site/)

The build is unsigned, and Windows has not been verified.

## Try it in 2 minutes

1. Open LaBro.
2. Choose **Try the scheduling agent**.
3. Pick **FBS practice**.
4. Select **Run**, then read the schedule it collects.

The practice data is synthetic. For the full walkthrough, see [Getting started](docs/GETTING_STARTED.md).

## How it works

- **Finder:** detects the lab's booking system and data sources.
- **Collector:** pulls the month's bookings, instrument logs and price sheet.
- **Matcher:** pairs every booking with the time the instrument actually ran.
- **Pricer:** applies the lab's rates, tiers and after-hours rules.
- **Reviewer:** flags exceptions and hands you one bill to approve.

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
