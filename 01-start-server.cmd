@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" -LaunchTarget Server
if errorlevel 1 (
  echo.
  echo DrinkGroupBuy server launcher stopped. Review the message above.
  pause
)

endlocal
