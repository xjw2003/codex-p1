@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\codex-isolated.ps1" -Mode prompt
set "exit_code=%errorlevel%"
echo.
if not "%exit_code%"=="0" (
  echo [codex-im] Launcher exited with code %exit_code%.
) else (
  echo [codex-im] Launcher finished.
)
pause
exit /b %exit_code%
