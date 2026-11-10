LaBro Collector
===============
Keeps the usage log for an instrument computer, so nobody exports it from the manufacturer's software by hand.

Status: prototype. The logging loop is tested; it has not yet been run on a real instrument PC. Try it on one
computer first, and ask your IT group before installing on managed machines.

What it records (once a minute, for whoever is logged in to Windows)
  - computer name and Windows username
  - logon time and the last time the session was seen
  - minutes with keyboard or mouse activity
  - minutes the instrument software was open (only if you name the program)
What it never records
  - keystrokes, window titles, screen contents, files, or data from the instrument software
It does not lock the computer or block anyone, and it does not use the internet.
Tell your users the computer keeps a usage log; most cores already say so in their user policy.

Try it (no install)
  1. Copy this folder to the instrument computer.
  2. Open PowerShell in the folder and run:
       powershell -ExecutionPolicy Bypass -File labro-collector.ps1 -Once -OutDir .\logs
  3. Open the CSV it names. It should hold one row with your username.

Install for every user of the computer
  1. Optional: open install.cmd in Notepad and set SHARE (a shared folder to copy the log to) and
     APPS (the instrument software's program name, as shown in Task Manager > Details, without .exe).
  2. Right-click install.cmd > Run as administrator.
  3. Log out and back in. A file appears in C:\LaBro\logs, one per collector session, e.g. FORTESSA-PC-2026-10-<session-id>.csv.

Last month, before the collector was installed
  Run PowerShell as administrator:
       powershell -ExecutionPolicy Bypass -File labro-collector.ps1 -Backfill 45
  It reads Windows' own logon and logoff events for the past 45 days. (Not yet tested on a real PC.)

Use the log
  Drop the month's CSV into the "Usage log" box in LaBro (Close the month). Several computers: drop one
  file at a time, or paste them into one file first. LaBro lines the sessions up with the reservations
  and applies your grace, overrun and no-show rules.

Columns
  Workstation, Username, Logon Time, Logoff Time, Duration (min), Active (min), Software open (min), Source

Good to know
  - A shared account (everyone logs in as "Lab User") gives one username for all sessions. Per-user
    Windows accounts, or the reservation itself, are then needed to say who was there.
  - If the computer is switched off without logging out, the session ends at the last minute seen.
  - Instruments with no computer need a different method (a power sensor); the collector cannot see them.

Remove
  Right-click uninstall.cmd > Run as administrator. Logs are kept.

Evidence limits
  Session start means collector start, and end means last observation (not confirmed logoff).
  Keyboard activity and an open program do not prove acquisition or billable use.
  Shared Windows accounts cannot identify individual researchers. Review charges against core rules.
  Each process writes a separate file to avoid concurrent users overwriting each other.
  Backfill is a separate evidence source: do not import it alongside overlapping live logs.
  Windows startup, logoff, share permissions and backfill still require a real-PC pilot.
