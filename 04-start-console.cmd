@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" -LaunchTarget Console
if errorlevel 1 (
  echo.
  echo DrinkGroupBuy console launcher stopped. Start 01-start-server.cmd first and review the message above.
  pause
)

endlocal
