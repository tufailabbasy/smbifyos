@echo off
setlocal

cd /d "%~dp0"
title BizFinder Pro Restart
set "START_SCRIPT=%~dp0Start BizFinder Pro.bat"

if /I "%~1"=="--check" goto check_only

if not exist "%START_SCRIPT%" (
  echo Start BizFinder Pro.bat was not found in this folder.
  goto fail
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required to restart BizFinder Pro on Windows.
  goto fail
)

echo Stopping any running BizFinder Pro launcher window...
taskkill /FI "WINDOWTITLE eq BizFinder Pro Launcher*" /T /F >nul 2>&1

echo Releasing BizFinder Pro ports if a manual Node session is still running...
call :stop_node_on_port 3001
call :stop_node_on_port 5173

timeout /t 2 >nul

echo Starting BizFinder Pro again...
start "" "%START_SCRIPT%"

echo.
echo BizFinder Pro restart has been triggered.
echo A new launcher window should open in a moment.
timeout /t 2 >nul
exit /b 0

:check_only
if not exist "%START_SCRIPT%" (
  echo Start BizFinder Pro.bat was not found in this folder.
  exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required to restart BizFinder Pro on Windows.
  exit /b 1
)

echo BizFinder Pro restart launcher check passed.
exit /b 0

:stop_node_on_port
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%~1 .*LISTENING"') do (
  call :stop_node_pid %%P
)
exit /b 0

:stop_node_pid
set "PROC_NAME="
for /f "usebackq delims=" %%N in (`powershell -NoProfile -Command "(Get-Process -Id %~1 -ErrorAction SilentlyContinue).ProcessName"`) do (
  set "PROC_NAME=%%N"
)

if /I "%PROC_NAME%"=="node" (
  taskkill /PID %~1 /T /F >nul 2>&1
)

set "PROC_NAME="
exit /b 0

:fail
echo.
echo BizFinder Pro could not restart.
pause
exit /b 1
