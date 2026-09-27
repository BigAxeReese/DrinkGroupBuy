@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-vm-server.ps1"
if errorlevel 1 (
  echo.
  echo DrinkGroupBuy update stopped. Review the message above.
)

pause
endlocal
