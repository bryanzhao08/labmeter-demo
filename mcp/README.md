# LaBro MCP server

Run with Node.js, with no npm installation or network access. The desktop app can also run it without Node installed; its Connections page gives the settings to paste into an agent.

```sh
node mcp/labro-mcp.cjs --folder /path/to/exports
```

Configure an MCP client to launch that command over stdio. The server reads supported CSV, TSV, text, XLSX and XLS files in the folder, including two levels of subfolders. It selects the newest reservation export and price sheet and overlapping logs. Hidden files, temporary Office files, files larger than 20 MB, and files beyond the newest 200 are skipped.

By default, outputs use opaque file and machine labels and omit source column headings, tier and price names, policy notes, and individual session details. Tool errors use fixed messages. Pass `--allow-details` to include source labels, headings, names and session details; treat those responses as sensitive. To use saved billing rules, add `--rules /path/to/rules.json`. Without it the server builds rules from the selected price sheet.

Files with symbolic-link components inside the selected folder are rejected. Each file is opened once and its descriptor is checked and read with a size limit. Portable filesystem APIs cannot completely prevent a concurrent replacement of a parent directory between checking its components and opening the file, so use a trusted folder that other processes cannot modify during a scan.

The five read-only tools are `find_exports`, `read_prices`, `check_month`, `sessions_needing_review`, and `test_report`. JSON results are available as both text and structured content. `check_month` returns the session count as `sessions` and, when details are enabled, individual records as `session_details`. The server reads the folder afresh on each call and does not write to it.

Opaque machine and tier IDs are consistent between tools while the selected inputs remain unchanged; they may change when inputs change. Rates are numeric and identify their opaque tier. `mcp/evaluation.xml` contains ten read-only questions for the synthetic `mcp/eval-fixture` data; run the server with `--folder mcp/eval-fixture` to use it.
