# Testing Parity

This page is for people piloting Parity on a core's computer, and for developers. For installation and navigation, see the [getting-started guide](docs/GETTING_STARTED.md).

## Known limits

- The build is unsigned.
- Windows execution is not verified. Only the Apple silicon Mac build has been checked.
- PDF price sheets must be pasted in as text.
- FBS has no public API, so Parity uses exported files.
- The iLab token lists equipment only. Reservations still come from exports.
- The scheduling agent runs against synthetic practice systems, not live FBS or iLab.
- Real customer exports, release signing and how well the column mapper handles unseen layouts are not yet tested.
- Cancellation and no-show fees need manager review.
- Computer login time is not the same as experiment time. Copying files must not be counted as measured work without proper evidence.
- Reading source files has a documented race: another process could replace a parent folder during a read. Use a trusted folder that nothing else changes.

## For pilot testers

### What to prepare

- One agreed month of reservations, usage logs and prices, as CSV or Excel.
- De-identified files are fine.
- Keep the folder unchanged while you test.

### Checklist

1. Open Parity and check that Home shows a calendar with uploads underneath.
2. Choose **Use my spreadsheets**, then select your folder or upload files on Home.
3. Compare dates, instruments and durations with a known record. Try day and week views.
4. Add your price sheet under **Billing rules**. Check prices, tiers, rounding, after-hours rules and evidence type, then save.
5. Analyze the month. Compare several charges with the originals and your manual bill.
6. Note useful flags and false positives.
7. Confirm that unreadable rows block export, and that approving other flags does not bypass the block.
8. Optional: copy the diagnostic report and read it before you share it.

### Optional connectors

- **iLab token:** a secure window retrieves equipment.
- **MCP:** Connections writes settings for Claude Desktop or Codex, for a folder you choose. By default, answers contain counts and totals, with no names or account codes. Turning on detailed answers changes what the client receives.
- **Scheduling agent:** try the normal, temporary-rate-limit and invalid-row scenarios. Check retries, duplicate removal, cancellations and the blocked import.

### Diagnostic report

The report holds counts and totals of review flags. It leaves out column headings, names, account codes, file names, folder paths and dollar amounts.

## For developers

```sh
npm ci
for f in tests/*.test.cjs; do node "$f"; done
npm run agent:test
npm run desktop:test:home
npm run desktop:test
npm run desktop:mac
```

- The `tests/*.test.js` files also run with `node`. `collector.test.js` needs PowerShell.
- The home smoke test covers setup, calendar interaction, upload, week view, unique element IDs and blocking charges before billing setup.
- The full desktop smoke test covers import, pricing, reconciliation, folder watching, token failure, cancel and success, and both practice sources.
- These checks use synthetic data. They do not show live vendor access or time savings.
