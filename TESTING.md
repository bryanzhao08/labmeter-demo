# Trying LaBro on a core's computer

Use the [getting-started guide](docs/GETTING_STARTED.md) for installation and navigation. The current verified build is for Apple silicon Mac; Windows execution is not verified. The app is unsigned.

## Pilot inputs

Use one agreed month of reservations, instrument usage logs and prices, exported as CSV or Excel. De-identified files are suitable. Keep the source folder stable while checking it.

## Manager walkthrough

1. Open LaBro. Verify that Home shows a calendar, with uploads underneath.
2. Choose **Use my spreadsheets** in setup, then select your exports folder or upload reservations/logs on Home.
3. Confirm the dates, instruments and booking durations against a known source record. Switch day/week views and open a reservation.
4. Add your price sheet under **Billing rules**. Check prices, user tiers, rounding, after-hours policy and evidence type before saving.
5. Analyze the month. Compare several charges with the original records and your manual bill. Record useful flags and false positives.
6. Confirm that unreadable source rows block export. Approving other exceptions must not bypass that block.
7. If useful, copy the diagnostic report and inspect it before sharing. Sending a report is a separate manual action.

Computer login duration is not necessarily experimental duration. Time spent copying files must not be represented as measured experiment time without the appropriate evidence.

## Optional connectors

- **iLab API:** the secure token window supports equipment retrieval. Real scheduling reports still come from exports.
- **MCP:** Connections generates separate Claude/Codex settings for an explicitly selected folder. Default responses contain counts and totals without names or account codes. Enabling detailed responses changes what the client receives.
- **Scheduling agent:** independent FBS/iLab practice systems use synthetic data. Test normal, temporary-rate-limit and invalid-row scenarios. Check retries, duplicate removal, cancellations and blocked import. This does not validate live scheduling access.

## Diagnostic report

The copied report omits source headings, names, account/funding codes, filenames, folder paths and dollar amounts. It contains counts and aggregate review-flag totals.

## Developer checks

```sh
npm ci
npm run agent:test
node tests/agent-mcp.test.cjs
npm run desktop:test:home
npm run desktop:test
npm run desktop:mac
```

The home smoke covers onboarding, calendar date/month interaction, upload into the calendar, week view, unique element IDs and blocking charges before billing setup. Full desktop smoke covers import/pricing/reconciliation, folder watching, token failure/cancellation/success and both practice agent sources.

## Remaining validation

Live FBS/iLab scheduling, real customer exports, Windows, release signing and model generalization remain unverified. PDF prices require pasted text. Cancellation/no-show fees require manager review. Source-file reads have a documented residual concurrent parent-directory replacement race.
