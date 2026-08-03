@echo off
cd /d "%~dp0"
echo launcher started %date% %time% > launcher_log.txt
echo cwd=%cd% >> launcher_log.txt
echo ============================================
echo  LibreTV App build launcher
echo  Window stays open until you close it.
echo ============================================
echo.
powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "$src='%~dp0build_apk.ps1'; $dst='%~dp0build_apk.run.ps1'; $txt=[System.IO.File]::ReadAllText($src); [System.IO.File]::WriteAllText($dst, $txt, [System.Text.Encoding]::UTF8); & $dst"
echo (launcher finished) >> launcher_log.txt
