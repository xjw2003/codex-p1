@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\codex-isolated.ps1" -Mode login-isolated
set "exit_code=%errorlevel%"
echo.
if not "%exit_code%"=="0" (
  echo [codex-im] Project-isolated login exited with code %exit_code%.
) else (
  echo [codex-im] Project-isolated login finished.
)
pause
exit /b %exit_code%
