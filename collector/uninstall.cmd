@echo off
rem Removes the LaBro Collector. The logs in C:\LaBro\logs are kept.
del "%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp\LaBro Collector.cmd" 2>nul
del "C:\LaBro\labro-collector.ps1" 2>nul
echo Removed. It stops for each user at their next logoff. Logs are still in C:\LaBro\logs.
pause
