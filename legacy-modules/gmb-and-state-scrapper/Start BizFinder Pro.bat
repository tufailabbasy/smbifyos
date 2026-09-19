@echo off
setlocal

set "SOURCE_DIR=%~dp0"
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
cd /d "%SOURCE_DIR%"
title BizFinder Pro Launcher
set "APP_URL=http://127.0.0.1:4173"
set "RUNTIME_ROOT=%LOCALAPPDATA%"
if not defined LOCALAPPDATA set "RUNTIME_ROOT=%TEMP%"
call :resolve_runtime_dir || goto fail

if /I "%~1"=="--check" goto check_only

call :ensure_tools || goto fail
call :prepare_runtime || goto fail
cd /d "%RUNTIME_DIR%" || goto fail
call :ensure_env || goto fail
call :ensure_dependencies || goto fail
call :stop_existing_runtime || goto fail

echo Starting BizFinder Pro...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process '%APP_URL%'" >nul 2>&1

echo BizFinder Pro should now be opening in your browser.
echo Keep the BizFinder Pro terminal window open while using the app.
echo.
call npm.cmd run dev
goto fail

:check_only
call :ensure_tools || goto fail
call :prepare_runtime || goto fail
cd /d "%RUNTIME_DIR%" || goto fail
call :ensure_env || goto fail
call :ensure_dependencies || goto fail
echo BizFinder Pro launcher check passed.
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

:resolve_runtime_dir
for %%I in ("%SOURCE_DIR%") do set "SOURCE_NAME=%%~nxI"
for %%I in ("%SOURCE_DIR%\..") do set "SOURCE_PARENT=%%~nxI"
for %%I in ("%SOURCE_DIR%") do set "SOURCE_DRIVE=%%~dI"
set "SOURCE_DRIVE=%SOURCE_DRIVE::=%"
set "RUNTIME_DIR=%RUNTIME_ROOT%\BizFinder Pro Runtime\%SOURCE_DRIVE%_%SOURCE_PARENT%_%SOURCE_NAME%"
exit /b 0

:prepare_runtime
if not exist "%RUNTIME_DIR%" (
  mkdir "%RUNTIME_DIR%" >nul 2>&1
  if errorlevel 1 (
    echo Could not create the local BizFinder Pro runtime folder.
    exit /b 1
  )
)

echo Syncing BizFinder Pro to a local runtime folder...
robocopy "%SOURCE_DIR%\." "%RUNTIME_DIR%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD ".git" "node_modules" "node_modules.broken" "server\data\gmb-photo-jobs" "server\data\gmb-photo-downloads" "server\data\gmb-rank-tracker" "server\output"
if errorlevel 8 (
  echo Failed to sync the project files into the local runtime folder.
  exit /b 1
)

echo Using local runtime folder:
echo %RUNTIME_DIR%
exit /b 0

:ensure_env
if not exist ".env" (
  > ".env" (
    echo PORT=4001
  )
  echo Created a default .env file.
)

exit /b 0

:ensure_dependencies
if exist "node_modules\concurrently\package.json" if exist "node_modules\vite\package.json" if exist "node_modules\express\package.json" if exist "node_modules\react\package.json" if exist ".deps-stamp" (
  powershell -NoProfile -Command "$pkg = Get-Item 'package.json'; $stamp = Get-Item '.deps-stamp' -ErrorAction SilentlyContinue; if (-not $stamp -or $pkg.LastWriteTimeUtc -gt $stamp.LastWriteTimeUtc) { exit 1 } else { exit 0 }" >nul 2>&1
  if not errorlevel 1 (
    exit /b 0
  )
)

echo Installing project dependencies in the local runtime folder...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed in the local runtime folder.
  exit /b 1
)

powershell -NoProfile -Command "Set-Content -LiteralPath '.deps-stamp' -Value (Get-Date).ToString('o')" >nul 2>&1
exit /b 0

:stop_existing_runtime
echo Stopping any older BizFinder Pro processes...
powershell -NoProfile -Command ^
  "$currentLauncherCmdId = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID)).ParentProcessId; " ^
  "$runtime = [IO.Path]::GetFullPath($env:RUNTIME_DIR); " ^
  "$allProcesses = Get-CimInstance Win32_Process; " ^
  "$childrenByParent = @{}; " ^
  "foreach ($proc in $allProcesses) { $parentId = [int]$proc.ParentProcessId; if (-not $childrenByParent.ContainsKey($parentId)) { $childrenByParent[$parentId] = New-Object System.Collections.Generic.List[int] }; $null = $childrenByParent[$parentId].Add([int]$proc.ProcessId) }; " ^
  "$rootIds = New-Object System.Collections.Generic.HashSet[int]; " ^
  "foreach ($proc in $allProcesses) { if ($proc.ProcessId -eq $currentLauncherCmdId -or -not $proc.CommandLine) { continue }; if ($proc.CommandLine -like '*BizFinder Pro\Start BizFinder Pro.bat*' -or $proc.CommandLine -like ('*' + $runtime + '*') -or $proc.CommandLine -like '*BizFinder Pro Runtime*') { $null = $rootIds.Add([int]$proc.ProcessId) } }; " ^
  "$stopIds = New-Object System.Collections.Generic.HashSet[int]; " ^
  "$stack = New-Object System.Collections.Generic.Stack[int]; " ^
  "foreach ($rootId in $rootIds) { $stack.Push($rootId) }; " ^
  "while ($stack.Count -gt 0) { $processId = $stack.Pop(); if ($processId -eq $currentLauncherCmdId -or $stopIds.Contains($processId)) { continue }; $null = $stopIds.Add($processId); if ($childrenByParent.ContainsKey($processId)) { foreach ($childId in $childrenByParent[$processId]) { if (-not $stopIds.Contains($childId)) { $stack.Push($childId) } } } }; " ^
  "foreach ($processId in ($stopIds | Sort-Object -Descending)) { try { Stop-Process -Id $processId -Force -ErrorAction Stop } catch {} }; " ^
  "Start-Sleep -Seconds 2"
if errorlevel 1 (
  echo Failed to stop the previous BizFinder Pro processes.
  exit /b 1
)
exit /b 0

:fail
echo.
echo BizFinder Pro could not start.
pause
exit /b 1
