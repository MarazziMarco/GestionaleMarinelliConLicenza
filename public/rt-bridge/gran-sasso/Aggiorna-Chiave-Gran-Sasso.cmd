@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Aggiorna-Chiave.ps1" -ConfigPath "C:\ProgramData\MarinelliRTBridge\GranSasso\config.json" -Task "Marinelli RT Bridge - Gran Sasso"
endlocal