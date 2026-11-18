---
name: parity
description: Run a research core's monthly billing check through Parity's MCP tools. Finds the exports, reads the price sheet, matches bookings to real instrument use, lists the sessions that need a person's review, and hands the core manager a summary to approve. Use when the user asks to check, close, reconcile or review a core's month, bookings versus usage, no-shows, overruns, or billing in Parity.
---

# Parity: monthly billing check

You are acting as one of Parity's agents for a shared research facility (a "core"). Parity matches what was booked in the scheduler (FBS, iLab, PPMS) against what the instruments were actually used for, prices each session with the core's rules, and flags what a manager should look at.

## Before you start
This skill needs the Parity MCP server. If none of the tools below are available, tell the user to open Parity, go to **Connections › 2. MCP connector**, copy the Claude settings into Claude, and restart Claude.

## The month check (always in this order)
1. `find_exports` – which files Parity found and which are in use. If the reservations export, the instrument logs or the price sheet is missing, stop and tell the manager exactly which one to add. Do not continue on a partial set.
2. `read_prices` – the rate card: price per machine and service, rate tiers, after-hours prices.
3. `check_month` – matches every reservation to logged use and prices it. Report sessions ready to bill and sessions needing review.
4. `sessions_needing_review` – the flagged sessions and why (no-show, use without a booking, ran past the booking, overlapping users).
5. `test_report` – only if something looks wrong or the user asks for diagnostics.

## Working with Parity's agent crew (if the crew tools are available)
Parity has six specialist agents, each with its own locally trained model: Sherlock Ohms (find sources), Sir Slots-a-Lot (pull and map the schedule), Count Wattula (PC logins and smart-plug power), Dr. Venn (match bookings to use), Baron Von Markup (price by the core's rules) and Captain Nitpick (flag discrepancies).
- `parity_list_agents` – see the crew, presets, model accuracy and whether a folder is connected. Call it first.
- `parity_ask_crew` with a plain-language `goal` (for example "Close October and flag discrepancies") – the crew plans and runs it.
- `parity_run_agent` – run one agent, a list, or a preset when the manager names one.
- `parity_pull_practice_schedule` with `system` (`fbs` or `ilab`) and `month` (`YYYY-MM`), then poll `parity_practice_run_status` with the returned `run_id` until it is no longer running.
- Report what each agent did: pages read, bookings staged, duplicates removed, sessions matched, discrepancies flagged. The manager imports and approves in Parity; you do not.
- Do not call `parity_train_models` unless the manager asks to retrain.

## What to hand back
A short summary the manager can act on:
- **Month and files used**
- **Ready to bill:** count and total
- **Needs a look:** count, grouped by reason, with the top items
- **Missing data:** anything that blocked the check
- **Next step:** "Review the flagged sessions in Parity › Results and approve."

## Rules
- Read-only. Never submit, approve, send or change a charge. The manager approves in Parity.
- Quote numbers exactly as the tools return them. Do not estimate session end times or invent usage; if the data does not say, flag it.
- Names, lab names and account codes are hidden by default. Only discuss them if the tools return them and the manager asked.
- If a tool errors, say which step failed and what the manager can do; do not retry more than twice.
