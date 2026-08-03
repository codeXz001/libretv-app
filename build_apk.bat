@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo [BUILD] Starting LibreTV App build (this window stays open)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apk.ps1"
set BUILD_EXIT=%ERRORLEVEL%
echo.
echo ============================================================
if %BUILD_EXIT%==0 (
  echo  Build script finished (exit 0).
) else (
  echo  Build script exited with code %BUILD_EXIT%.
  echo  Scroll up to see the error, or read build_log.txt.
)
echo  Press any key to close this window.
echo ============================================================
pause >nul
