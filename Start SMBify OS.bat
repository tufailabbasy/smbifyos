@echo off
setlocal

cd /d "%~dp0"
title SMBify OS Launcher
set "APP_URL=http://localhost:5173"

if /I "%~1"=="--check" goto check_only

call :ensure_tools || goto fail
call :ensure_dependencies || goto fail
call :configure_runtime

call :stop_node_on_port 5050
call :stop_node_on_port 4001
call :stop_node_on_port 5173
call :stop_node_on_port 5174

echo Starting SMBify OS...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process '%APP_URL%'" >nul 2>&1

echo SMBify OS should now be opening in your browser.
echo Keep this launcher window open while using the app.
echo.
call npm.cmd run dev
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  exit /b 0
)

echo.
echo SMBify OS session ended unexpectedly. Exit code: %EXIT_CODE%
echo Use "Restart SMBify OS.bat" to bring services back up.
pause
exit /b %EXIT_CODE%

:check_only
call :ensure_tools || goto fail
call :ensure_dependencies || goto fail
call :configure_runtime
echo SMBify OS launcher check passed.
exit /b 0

:ensure_tools
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Please install Node.js first.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not installed. Please install Node.js first.
  exit /b 1
)

exit /b 0

:ensure_dependencies
if not exist "node_modules\concurrently\package.json" goto install_dependencies
if not exist "node_modules\express\package.json" goto install_dependencies
if not exist "client\node_modules\vite\package.json" goto install_dependencies
if not exist "client\node_modules\react\package.json" goto install_dependencies
exit /b 0

:install_dependencies
echo Installing root dependencies...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed in workspace root.
  exit /b 1
)

echo Installing client dependencies...
call npm.cmd --prefix client install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed in client folder.
  exit /b 1
)

exit /b 0

:configure_runtime
set "PORT=5050"
set "CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173"
set "VITE_API_BASE_URL=http://localhost:5050"
for %%I in ("%~dp0legacy-modules\gmb-and-state-scrapper") do set "GMB_STATE_SCRAPER_ROOT=%%~fI"
if not exist "%GMB_STATE_SCRAPER_ROOT%\server\modules\gmb-photo-scraper.js" (
  for %%I in ("%~dp0..\gmb and state scrapper") do set "GMB_STATE_SCRAPER_ROOT=%%~fI"
)
set "GMB_PHOTO_SCRAPER_MODULE=%GMB_STATE_SCRAPER_ROOT%\server\modules\gmb-photo-scraper.js"
set "STATE_SCRAPER_ROOT=%GMB_STATE_SCRAPER_ROOT%"

if not exist "%GMB_PHOTO_SCRAPER_MODULE%" (
  echo Warning: gmb-photo-scraper module not found in legacy-modules or legacy sibling path:
  echo %GMB_PHOTO_SCRAPER_MODULE%
  echo Google and state-directory scrapers may fail until this path is available.
)

exit /b 0

:stop_node_on_port
powershell -NoProfile -Command ^
  "$ids = Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and $proc.ProcessName -ieq 'node') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }"
exit /b 0

:fail
echo.
echo SMBify OS could not start.
pause
exit /b 1
