@echo off
cd /d "%~dp0"
echo launcher started %date% %time% > launcher_log.txt
echo cwd=%cd% >> launcher_log.txt
echo ============================================
echo  LibreTV App build launcher
echo  This window stays open until you close it.
echo ============================================
echo.
powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apk.ps1"
echo (powershell session ended) >> launcher_log.txt
