@echo off
rem LaBro Collector install. Right-click this file and choose "Run as administrator".
rem Optional: edit the two lines below first.
set "SHARE="
rem   ^ a shared folder to copy the log to, e.g. set "SHARE=\\coreserver\labro"
set "APPS="
rem   ^ the instrument software's program name(s), e.g. set "APPS=FACSDiva,ZEN"

net session >nul 2>&1
if errorlevel 1 ( echo Please right-click install.cmd and choose "Run as administrator". & pause & exit /b 1 )

mkdir "C:\LaBro\logs" 2>nul
copy /y "%~dp0labro-collector.ps1" "C:\LaBro\labro-collector.ps1" >nul
if errorlevel 1 ( echo Could not copy labro-collector.ps1. Keep it in the same folder as install.cmd. & pause & exit /b 1 )
rem Every user must be able to add to the log folder.
icacls "C:\LaBro\logs" /grant *S-1-5-32-545:(OI)(CI)M >nul

set "ARGS="
if not "%SHARE%"=="" set "ARGS=%ARGS% -ShareDir "%SHARE%""
if not "%APPS%"=="" set "ARGS=%ARGS% -Apps %APPS%"

rem Starts hidden for every user at logon, from the all-users Startup folder.
set "START=%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp\LaBro Collector.cmd"
> "%START%" echo @start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\LaBro\labro-collector.ps1"%ARGS%

echo.
echo Installed. Logging starts the next time someone logs in to this computer.
echo Logs: C:\LaBro\logs    To remove: run uninstall.cmd as administrator.
pause
