@echo off
rem Removes the Parity Collector. The logs in C:\Parity\logs are kept.
del "%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp\Parity Collector.cmd" 2>nul
del "C:\Parity\parity-collector.ps1" 2>nul
echo Removed. It stops for each user at their next logoff. Logs are still in C:\Parity\logs.
pause
