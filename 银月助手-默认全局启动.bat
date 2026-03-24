@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
set "NPM_CMD="

if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"

if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NPM_CMD if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"

if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NPM_CMD if exist "%LocalAppData%\Programs\nodejs\npm.cmd" set "NPM_CMD=%LocalAppData%\Programs\nodejs\npm.cmd"

if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :node_found
  )
)
:node_found

if not defined NPM_CMD (
  for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
    set "NPM_CMD=%%I"
    goto :npm_found
  )
)
:npm_found

if not defined NODE_EXE (
  echo [codex-im] Node.js not found in PATH.
  echo [codex-im] Please install Node.js 18+ first.
  pause
  exit /b 1
)

if not defined NPM_CMD (
  echo [codex-im] npm.cmd not found in PATH.
  echo [codex-im] Please reinstall Node.js or fix PATH.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [codex-im] .env not found in project root.
  echo [codex-im] Please create .env before starting.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [codex-im] node_modules not found.
  echo [codex-im] Run npm install once before first start.
  pause
  exit /b 1
)

echo [codex-im] Working directory: %cd%
echo [codex-im] Node: %NODE_EXE%
echo [codex-im] NPM: %NPM_CMD%
echo [codex-im] Starting Feishu bot...
echo.

call "%NPM_CMD%" run feishu-bot
set "exit_code=%errorlevel%"

echo.
if not "%exit_code%"=="0" (
  echo [codex-im] Default launcher exited with code %exit_code%.
) else (
  echo [codex-im] Default launcher finished.
)
pause
exit /b %exit_code%
