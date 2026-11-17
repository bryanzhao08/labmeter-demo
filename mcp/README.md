# Parity MCP server

A read-only server that lets an AI client such as Claude or Codex check a month of lab data. It needs Node.js only, with no npm install and no network. The desktop app can also run it without Node.

## Run it

```sh
node mcp/parity-mcp.cjs --folder /path/to/exports
```

Point your MCP client at that command over stdio.

| Option | Meaning |
| --- | --- |
| `--folder <dir>` | Required. The exports folder to read. |
| `--rules <file>` | Use saved billing rules. Without it, rules come from the price sheet. |
| `--allow-details` | Include source labels, headings, names and session details. Treat those answers as sensitive. |

## What it reads

- CSV, TSV, text, XLSX and XLS files, down to two levels of subfolders.
- It picks the newest reservation export and price sheet, plus overlapping logs.
- It skips hidden files, temporary Office files, files over 20 MB and anything beyond the newest 200.
- It rereads the folder on every call and never writes to it.

## Tools

All five tools are read-only.

| Tool | What it returns |
| --- | --- |
| `find_exports` | The files found and which ones are in use |
| `read_prices` | Rates, each tied to an opaque tier |
| `check_month` | Session count as `sessions`, and `session_details` when details are on |
| `sessions_needing_review` | Sessions that need a manager's look |
| `test_report` | A summary report of the check |

Results come as both text and structured JSON. Machine and tier IDs stay consistent while the inputs are unchanged.

## Privacy defaults

- Output uses opaque file and machine labels.
- It leaves out column headings, tier and price names, policy notes and session details.
- Errors use fixed messages.

## Folder safety

Files with symbolic-link components are rejected. Each file is opened once, then checked and read with a size limit. A parent folder replaced at the exact moment of a scan could still slip through, so use a folder other processes cannot change.

## Connect Claude Desktop or Codex

1. In the app, open **Connections**, then **2. MCP connector**.
2. Choose Claude Desktop or Codex, and select an exports folder.
3. Copy the generated settings. The app fills in the executable, server path, folder, rules path and `ELECTRON_RUN_AS_NODE`.
4. Merge them into your client's config, then restart the client.

- **Claude Desktop:** **Settings**, **Developer**, **Edit Config**. Add the Parity entry to `mcpServers` in `claude_desktop_config.json`.
- **Codex:** add the `[mcp_servers.parity]` and environment tables to `~/.codex/config.toml`.

Parity never edits these files. A passing server test does not prove a client is connected.

Suggested prompt:

> Use Parity to find my exports, read my prices, and check this month. Summarize missing data and sessions needing review. Do not submit charges.

Client docs: [Claude Desktop and local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [Codex MCP](https://developers.openai.com/codex/mcp/).

## Test it

```sh
node tests/mcp.test.cjs
node mcp/parity-mcp.cjs --folder mcp/eval-fixture
```

`mcp/evaluation.xml` holds ten read-only questions for the synthetic `mcp/eval-fixture` data.

## Practice scheduling server

A separate server, `agent/mcp.cjs`, offers `parity_pull_practice_schedule` and `parity_practice_run_status` for synthetic FBS and iLab sources. Tick the practice-agent box in Connections to add it. It has its own in-memory runtime and does not import into the app. See the [scheduling agent guide](../agent/README.md).
