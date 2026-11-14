# Getting started with LaBro

## Download

Get the Apple silicon Mac app from [GitHub Releases](https://github.com/bryanzhao08/labmeter-demo/releases/latest). Download the ZIP under **Assets**, unzip it, and move LaBro to Applications. `SHA256SUMS.txt` provides the archive checksum.

The current build is unsigned. Windows execution is not verified. The repository's source-code ZIP is separate from the runnable Mac app.

## Start with the calendar

Home opens to a calendar immediately. Select a date, move between months, or use **Today**. After importing reservations, the calendar offers day/week views, instrument filters and clickable reservations.

The first-time setup popup offers:

- **Try the scheduling agent:** collect synthetic bookings from an independent FBS or iLab practice system.
- **Use my spreadsheets:** add your own exports below the calendar.
- **Explore the calendar first:** dismiss setup and keep browsing.

Use **Set up LaBro** on Home to open that choice again.

## Use your real files

1. Save reservation exports, instrument usage logs and your price sheet in one folder. CSV and Excel are supported; PDF price sheets require pasted text.
2. On Home, scroll to **Add your lab's data**. Choose the folder or upload reservations and logs individually. The reservations populate the calendar.
3. Open **Billing rules**, add your prices/policy, review the interpreted rules, then save. Configure rules before checking charges.
4. Choose **Analyze the month**. Review exceptions under **Results**, then export eligible charges. Unreadable rows block export until corrected.

The app reads source files without modifying them. It does not submit charges to a scheduling or finance system. Imported workspace records must be loaded again after restarting; saved billing rules and agent run history persist.

## Try the scheduling agent

Open it from first-time setup or the link in **Connections**. Choose FBS or iLab, a month and a scenario, then run the agent. Inspect the activity log and schedule preview. **Open practice scheduler** shows the underlying synthetic source in your browser.

Choose **Use in LaBro** to replace the current workspace's reservations and usage logs with the validated synthetic records. This does not overwrite saved billing rules on disk. Invalid records block import. The practice systems are independent LaBro simulators, not authenticated vendor integrations.

## Connections

### 1. API key or exported files

Find/select your scheduling system. FBS uses exports without an API key. iLab's optional token connection fetches equipment; its reservations still use exported reports. Enter the iLab token in the separate credential window.

### 2. MCP connector

Choose **Claude Desktop** or **Codex**, select an exports folder, and copy the generated settings. Claude uses JSON; Codex uses TOML. Merge the settings into your existing client configuration and restart the client. LaBro does not edit those files automatically.

Copy the provided prompt to ask your agent to find exports, read prices and check the month. Default tool responses hide names and account codes. The optional practice-agent checkbox adds the separate synthetic scheduling server.

See [MCP setup](../mcp/README.md) and [agent architecture and training](../agent/README.md).
