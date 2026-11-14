# Trying LaBro on a core's computer

This is for a core facility manager who agreed to try LaBro. It takes about ten minutes. LaBro only reads files; it never changes them and never posts anything to FBS, iLab or a finance system.

## What you need
- A Windows PC or an Apple Silicon Mac.
- One folder, for example `Documents\LaBro month`, containing:
  1. the month's **reservations**, downloaded from your booking system (FBS, iLab, PPMS...) as Excel or CSV;
  2. the **usage log** from each instrument (login and logout times, or start and end times);
  3. your **price sheet** (Excel, CSV, or a text file with the prices).

The files can have any names. LaBro works out which is which from what is inside them.

## Steps
1. Install and open LaBro. The app is not signed yet, so Windows may show "Windows protected your PC" (choose More info, then Run anyway) and macOS may ask you to open it from System Settings, Privacy & Security.
2. On the welcome page choose **Choose a folder** and pick the folder above. LaBro lists what it found.
3. Choose **Read my pricing and continue**. Check the price table, fix anything wrong, and save.
4. The **Schedule** fills in from your reservations. Green bars show logged use. Click any reservation for its rate and charge.
5. **Results** lists every session, with the ones that need a look first.
6. Choose **Copy test report** in the sidebar and paste it into an email to us.

No files to hand yet? Choose **Try it with simulated data** on the welcome page.

## What the test report contains
Counts and aggregate review-flag totals. Source headings, names, account or funding codes, file names, folder paths and dollar amounts are omitted. Read it before sending; it is plain text.

## What leaves the computer
Nothing, by default. Two things are optional and off until you turn them on:
- **iLab API token** (Connections page): enter the token in a separate credential window. LaBro calls iLab's API server to confirm the connection and list your equipment. The token is encrypted with the computer's keychain when available; otherwise it stays in memory until the app closes.
- **AI agent (MCP)**: if you add LaBro to an agent such as Claude Desktop, that agent receives counts and totals. It receives names only if you start the server with `--allow-details`.

## Known limits
- Unreadable source rows block billing export until the files are corrected and analyzed again; approving other exceptions does not bypass this.
- FBS has no documented public API, so FBS data comes from the files you download.
- The iLab connection lists equipment. Reservations still come from an exported report.
- PDF price sheets are not read; paste the table as text instead.
- After-hours rates, user-type rates and rounding are applied; cancellation and no-show fees are flagged for you, not calculated.
