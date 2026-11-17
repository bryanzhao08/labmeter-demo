# Getting started with Parity

This guide is for a core manager. It takes you from download to your first exported month.

## 1. Install

1. Open the [latest release](https://github.com/bryanzhao08/parity/releases/latest).
2. Under **Assets**, download the Mac ZIP (Apple silicon).
3. Unzip it and move Parity to Applications.

`SHA256SUMS.txt` on the same page lets you check the download. The page's "Source code" ZIP is not the app.

## 2. Open it for the first time

The app is not signed, so your computer will show a warning.

- **Mac:** if it says the app is from an unidentified developer, open **System Settings**, then **Privacy & Security**, then choose **Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info**, then **Run anyway**. Windows has not been verified yet.

## 3. Choose how to start

Home opens to a calendar. A setup window offers three choices:

- **Try the scheduling agent:** use synthetic bookings from a practice system.
- **Use my spreadsheets:** load your own exports.
- **Explore the calendar first:** close the window and look around.

Choose **Set up Parity** on Home to see these again.

## 4. Try simulated data

1. Choose **Try the scheduling agent**.
2. Pick FBS or iLab, a month and a scenario.
3. Select **Run** and read the activity log and schedule preview.
4. Choose **Use in Parity** to load the records into your workspace.

Invalid records block this step. **Open practice scheduler** shows the practice system in your browser.

## 5. Or use your own files

1. Put one month of reservation exports, usage logs and your price sheet in one folder. CSV and Excel work.
2. On Home, scroll to **Add your lab's data**.
3. Choose the folder, or upload the files one at a time.

The reservations appear on the calendar. Parity reads your files and never changes them.

## 6. Check prices

1. Open **Billing rules**.
2. Add your prices and policy.
3. Review the rules Parity understood, then save.

A PDF price sheet must be pasted in as text. Set up rules before you check charges.

## 7. Read the schedule

- Move between months or choose **Today**.
- Switch between day and week views.
- Filter by instrument, and click a reservation to see its details.

Compare a few reservations with your own records.

## 8. Review results

1. Choose **Analyze the month**.
2. Open **Results** and read each flagged line.
3. Compare a few charges with the original records.

Rows Parity cannot read block the export until you fix them.

## 9. Export

Export the eligible charges as a CSV. Held rows are left out.

Parity does not send charges to any scheduling or finance system. After a restart, load your files again. Saved billing rules and agent history stay.

## Connections

Open **Connections** for two optional setups.

- **API key or exported files:** FBS uses exports, with no API key. iLab's token lists equipment only, so reservations still come from exports. Enter the token in the separate credential window.
- **MCP connector:** lets Claude Desktop or Codex check a month. Pick an exports folder, copy the settings and restart your client. See the [MCP guide](../mcp/README.md).

## More help

- [Pilot testing and known limits](../TESTING.md)
- [Scheduling agent details](../agent/README.md)
