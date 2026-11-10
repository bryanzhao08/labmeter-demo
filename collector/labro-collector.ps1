<#
LaBro Collector: writes the usage log for one instrument computer, so nobody has to export it by hand.

What it records, once a minute, for whoever is logged in to Windows:
  computer name, Windows username, logon time, last time seen, minutes with keyboard or mouse activity,
  and minutes the instrument software was open (only if you name the program with -Apps).
What it never records: keystrokes, window titles, screen contents, files, or anything from the instrument software.

It does not lock the computer or block anyone. It only keeps a log.

Output: one CSV per computer per month, e.g. C:\LaBro\logs\FORTESSA-PC-2026-10.csv, in the columns LaBro's
"Usage log" box reads directly. With -ShareDir the file is also copied to a shared folder every minute.

Run by hand to try it:   powershell -ExecutionPolicy Bypass -File labro-collector.ps1 -Once
Install for all users:   run install.cmd as administrator (see README.txt)
Past sessions:           powershell -ExecutionPolicy Bypass -File labro-collector.ps1 -Backfill 45   (run as administrator)

Targets Windows PowerShell 5.1+. Windows integration still requires testing. No internet access.
#>
param(
  [string]$OutDir = 'C:\LaBro\logs',
  [string]$ShareDir = '',           # optional, e.g. \\coreserver\labro
  [string]$Instrument = '',         # optional name to write instead of the computer name
  [string[]]$Apps = @(),            # optional process names of the instrument software, e.g. FACSDiva,ZEN
  [ValidateRange(1, 3600)][int]$EverySec = 60,
  [int]$IdleAfterMin = 5,           # no keyboard/mouse for this long = not counted as active
  [int]$Backfill = 0,               # days of past sessions to read from the Windows event log
  [switch]$Once,                    # write one row and exit (for testing)
  [int]$Ticks = 0,                  # testing: stop after this many ticks
  [string]$FakeUser = '', [string]$FakeNow = '', [int]$FakeIdleSec = -1   # testing only
)

$ErrorActionPreference = 'Stop'
$HEAD = 'Workstation,Username,Logon Time,Logoff Time,Duration (min),Active (min),Software open (min),Source'
$onWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or ($env:OS -eq 'Windows_NT')

function Get-Now { if ($script:testNow) { $script:testNow } else { Get-Date } }
function Fmt([datetime]$d) { $d.ToString('yyyy-MM-dd HH:mm:ss') }
function Csv([string]$s) { if ($s -match '[",\r\n]') { '"' + ($s -replace '"', '""') + '"' } else { $s } }
function Row($s) {
  $dur = [int][math]::Round(($s.End - $s.Start).TotalMinutes)
  (@((Csv $s.Pc), (Csv $s.User), (Fmt $s.Start), (Fmt $s.End), $dur, $s.Active, $s.App, $s.Source) -join ',')
}

# Rewrite this session's own line in the month file (matched by computer + user + logon time). Other lines are kept.
function Save-Session($s) {
  if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
  $file = Join-Path $OutDir ("{0}-{1}-{2}.csv" -f ($s.Pc -replace '[^a-zA-Z0-9_.-]', '_'), $s.Start.ToString('yyyy-MM'), $script:sessionKey)
  $key = (@((Csv $s.Pc), (Csv $s.User), (Fmt $s.Start)) -join ',') + ','
  for ($try = 0; $try -lt 5; $try++) {
    try {
      $lines = @()
      if (Test-Path $file) { $lines = @(Get-Content -Path $file | Where-Object { $_ -and $_ -ne $HEAD -and -not $_.StartsWith($key) }) }
      $all = @($HEAD) + $lines + @(Row $s)
      [System.IO.File]::WriteAllLines(($file + '.tmp'), [string[]]$all)
      Move-Item -LiteralPath ($file + '.tmp') -Destination $file -Force
      break
    } catch { if ($try -eq 4) { throw }; Start-Sleep -Milliseconds 300 }
  }
  if ($ShareDir) { try { Copy-Item -Path $file -Destination $ShareDir -Force } catch { } }   # share down? the local copy is still complete
  $file
}

function Get-IdleSeconds {
  if ($FakeIdleSec -ge 0) { return $FakeIdleSec }
  if (-not $onWindows) { return 0 }
  if (-not ('LaBro.Idle' -as [type])) {
    Add-Type -Namespace LaBro -Name Idle -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
public static uint Seconds() { LASTINPUTINFO l = new LASTINPUTINFO(); l.cbSize = (uint)Marshal.SizeOf(l); if (!GetLastInputInfo(ref l)) return 0; return ((uint)Environment.TickCount - l.dwTime) / 1000; }
'@
  }
  [int][LaBro.Idle]::Seconds()
}

function Test-AppOpen {
  if (-not $Apps -or $Apps.Count -eq 0) { return $false }
  $names = @($Apps | ForEach-Object { $_ -split ',' } | ForEach-Object { ($_.Trim() -replace '\.exe$', '') } | Where-Object { $_ })
  [bool](Get-Process -Name $names -ErrorAction SilentlyContinue)
}

# Past sessions from the Windows event log (logon = 21, logoff = 23 in the Local Session Manager log).
# Needs an administrator window. Sessions still open, or cut short by a power-off, have no logoff event and are skipped.
function Invoke-Backfill([int]$days) {
  $since = (Get-Date).AddDays(-$days)
  $ev = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'; Id = 21, 23; StartTime = $since } -ErrorAction Stop | Sort-Object TimeCreated
  $open = @{}; $n = 0
  foreach ($e in $ev) {
    $x = [xml]$e.ToXml(); $u = [string]$x.Event.UserData.EventXML.User; $sid = [string]$x.Event.UserData.EventXML.SessionID
    if (-not $u) { continue }
    $user = ($u -split '\\')[-1]; $k = $sid + '|' + $user
    if ($e.Id -eq 21) { $open[$k] = $e.TimeCreated }
    elseif ($open.ContainsKey($k)) {
      $s = @{ Pc = $script:pc; User = $user; Start = $open[$k]; End = $e.TimeCreated; Active = ''; App = ''; Source = 'event log' }
      $open.Remove($k)
      if (($s.End - $s.Start).TotalMinutes -ge 1) { Save-Session $s | Out-Null; $n++ }
    }
  }
  Write-Output ("{0} past sessions written to {1}" -f $n, $OutDir)
}

# ---------- main
$script:sessionKey = [guid]::NewGuid().ToString("N")
if (-not $onWindows -and -not $FakeUser) { throw "Windows is required; FakeUser is for synthetic tests only." }
$script:testNow = $null
if ($FakeNow) { $script:testNow = [datetime]$FakeNow }
$script:pc = if ($Instrument) { $Instrument } elseif ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { [Environment]::MachineName }
$user = if ($FakeUser) { $FakeUser } elseif ($env:USERNAME) { $env:USERNAME } else { [Environment]::UserName }

if ($Backfill -gt 0) { Invoke-Backfill $Backfill; return }

$now = Get-Now
$s = @{ Pc = $script:pc; User = $user; Start = $now; End = $now; Active = 0; App = 0; Source = 'collector' }
$activeSec = 0; $appSec = 0; $tick = 0
while ($true) {
  $file = Save-Session $s
  if ($Once) { Write-Output ("Wrote " + $file); break }
  $tick++
  if ($Ticks -gt 0 -and $tick -gt $Ticks) { break }
  if ($script:testNow) { $script:testNow = $script:testNow.AddSeconds($EverySec) } else { Start-Sleep -Seconds $EverySec }
  $now = Get-Now
  # A gap much longer than one tick means the computer slept. Close this session at the last time seen and start a new one.
  if (($now - $s.End).TotalSeconds -gt [math]::Max(600, $EverySec * 5)) {
    $s = @{ Pc = $script:pc; User = $user; Start = $now; End = $now; Active = 0; App = 0; Source = 'collector' }; $activeSec = 0; $appSec = 0
    continue
  }
  if ((Get-IdleSeconds) -lt $IdleAfterMin * 60) { $activeSec += $EverySec }
  if (Test-AppOpen) { $appSec += $EverySec }
  $s.End = $now; $s.Active = [int][math]::Round($activeSec / 60); $s.App = [int][math]::Round($appSec / 60)
}
