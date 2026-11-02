# LabMeter demo

A static GitHub Pages demo of LabMeter: clip-on sensors detect when shared lab instruments actually run, NFC taps claim the instrument to a grant, and reconciliation compares bookings, claims and measured runs. Verified run time is billed; walk-ups, overruns, idle claims, no-shows and sensor gaps go to a review queue.

**All data is simulated.** There are no real instruments, sensors, users or customers. Researcher and grant names are invented display labels for `user-N` and `grant-N`. The instrument "tap" page is a client-side simulation and persists nothing. Review decisions and the portable-gear actions (Mark found, Report missing, Check out, Return) are stored only in your browser's localStorage. Portable-gear locations are room-level, from simulated BLE gateway sightings (not GPS); `data/assets.json` documents the status rules.

## Modes
- **Overview (default):** a static 2D snapshot at the latest data time. Metric strip, floor plan with instrument and gear chips, an Attention list, and per-instrument rows with a 7-day usage sparkline. No animation, and three.js is never loaded.
- **Live simulation:** the top-right toggle (also `#/?mode=sim`, remembered in localStorage) opens a 3D view that plays the week by itself (about 1 simulated hour per 2 s, 1x/4x/pause, loops, quiet hours are skipped faster). The event feed and metrics are derived from the timeline, reconciliation and assets data. three.js r128 is loaded from cdnjs only when this mode opens. With reduced-motion set, it starts paused.

## How the data was generated
The real LabMeter FastAPI server (SQLite, fresh temporary DB) was started on a local port and `sim/run.py --days 7` posted deterministic synthetic gateway events, NFC claims and bookings over HTTP (16,400 events, 6 instruments, 12 demo users, 5 grants). The API responses the UI needs were then saved to `data/`: `reconciliation.json`, `utilization.json`, `instruments.json`, `timeline-<instrument>.json`, `tag-<instrument>.json`, plus `billing.csv`, `bookings.csv` and the simulator's `ground_truth.json`. The server was stopped afterwards.

## Limitations
- The simulator creates one ~65-minute observation window per instrument per day, so timelines are sparse and utilization is relative to monitored time.
- Billing floors to 15-minute increments per uninterrupted run; booked-time billing is not implemented; no iLab/PPMS schema is validated.
- "Pending review value" is run time x hourly rate for walk-ups and overruns; it is not billed.

## Run locally
`python3 -m http.server` in the parent folder, then open `/labmeter-demo/`. Uses relative paths and hash routing, so it works under any subpath. Opening via `file://` will not load the JSON.
