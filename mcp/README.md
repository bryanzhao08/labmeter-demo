# LaBro MCP server

Run with Node.js, with no npm installation or network access. The desktop app can also run it without Node installed; its Connections page gives the settings to paste into an agent.

```sh
node mcp/labro-mcp.cjs --folder /path/to/exports
```

Configure an MCP client to launch that command over stdio. The server reads supported CSV, TSV, text, XLSX and XLS files in the folder, including two levels of subfolders. It selects the newest reservation export and price sheet and overlapping logs. Hidden files, temporary Office files, files larger than 20 MB, and files beyond the newest 200 are skipped.

By default, outputs contain aggregate results rather than individual sessions. File names are replaced with numbered labels in this mode because a file name can contain private information. Pass `--allow-details` to enable actual file names, session user names and price policy notes. Column headers and machine names are returned in either mode. To use the billing rules saved in the LaBro app, add `--rules /path/to/rules.json`. The app writes that file when you save your rules, and its Connections page shows the full command. Without it the server builds rules from the selected price sheet.

The five read-only tools are `find_exports`, `read_prices`, `check_month`, `sessions_needing_review`, and `test_report`. JSON results are available as both text and structured content. `check_month` returns the session count as `sessions` and, when details are enabled, individual records as `session_details`. The server reads the folder afresh on each call and does not write to it.
