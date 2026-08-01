@echo off
REM ============================================
REM LibreTV Android App - 一键打包入口
REM ============================================
REM 工作流程：
REM   1. 同步 www/ 到 Android 项目（来自 Capacitor）
REM   2. 生成 keystore（如果还没有）
REM   3. 打包 release APK
REM ============================================

cd /d "%~dp0"

echo.
echo === LibreTV Android App 一键打包 ===
echo.

REM 1. 同步 web 资源
echo [1/3] 同步前端资源到 Android...
cd ..
call npx cap sync android
if %errorlevel% neq 0 (
    echo [错误] 同步失败
    pause
    exit /b 1
)
cd android

REM 2. 检查 keystore
echo.
echo [2/3] 检查 keystore 配置...
if not exist "keystore.properties" (
    echo 未检测到 keystore.properties，需要先生成
    echo.
    call generate-keystore.bat
)

REM 3. 打包
echo.
echo [3/3] 开始打包 APK...
call build-release.bat