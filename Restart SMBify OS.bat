@echo off
setlocal

cd /d "%~dp0"
title SMBify OS Restart
set "START_SCRIPT=%~dp0Start SMBify OS.bat"

if /I "%~1"=="--check" goto check_only

if not exist "%START_SCRIPT%" (
  echo Start SMBify OS.bat was not found in this folder.
  goto fail
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required to restart SMBify OS on Windows.
  goto fail
)

echo Stopping any running SMBify OS launcher window...
taskkill /FI "WINDOWTITLE eq SMBify OS Launcher*" /T /F >nul 2>&1

echo Releasing SMBify OS ports if a manual Node session is still running...
call :stop_node_on_port 5050
call :stop_node_on_port 4001
call :stop_node_on_port 5173
call :stop_node_on_port 5174

timeout /t 2 >nul

echo Starting SMBify OS again...
start "" "%START_SCRIPT%"

echo.
echo SMBify OS restart has been triggered.
echo A new launcher window should open in a moment.
timeout /t 2 >nul
exit /b 0

:check_only
if not exist "%START_SCRIPT%" (
  echo Start SMBify OS.bat was not found in this folder.
  exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required to restart SMBify OS on Windows.
  exit /b 1
)

echo SMBify OS restart launcher check passed.
exit /b 0

:stop_node_on_port
powershell -NoProfile -Command ^
  "$ids = Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and $proc.ProcessName -ieq 'node') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }"
exit /b 0

:fail
echo.
echo SMBify OS could not restart.
pause
exit /b 1
