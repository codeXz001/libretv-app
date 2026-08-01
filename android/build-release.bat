@echo off
REM ============================================
REM LibreTV Android App - Release 打包脚本
REM ============================================
REM 用法：先执行 generate-keystore.bat 生成密钥库，
REM      再执行本脚本打包 release APK
REM ============================================

cd /d "%~dp0"

echo.
echo === LibreTV Android Release 打包 ===
echo.

if not exist "keystore.properties" (
    echo [错误] 未找到 keystore.properties
    echo 请先双击运行 generate-keystore.bat 生成密钥库
    pause
    exit /b 1
)

if not exist "gradlew.bat" (
    echo [错误] 未找到 gradlew.bat，请确认在 android 目录中运行
    pause
    exit /b 1
)

echo [1/3] 检查 Java 环境...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Java，请安装 JDK 17 或更高版本
    echo 下载地址：https://adoptium.net/
    pause
    exit /b 1
)

echo [2/3] 清理旧的构建产物...
call gradlew.bat clean --quiet
if %errorlevel% neq 0 (
    echo [警告] 清理失败，继续...
)

echo [3/3] 开始打包 release APK（首次会下载依赖，可能需要几分钟）...
echo.
call gradlew.bat assembleRelease
if %errorlevel% neq 0 (
    echo.
    echo [错误] 打包失败！请检查上方日志
    pause
    exit /b 1
)

echo.
echo === 打包成功 ===
echo.

set APK_PATH=app\build\outputs\apk\release\app-release.apk
if exist "%APK_PATH%" (
    echo APK 位置：%cd%\%APK_PATH%
    echo.
    for %%I in ("%APK_PATH%") do echo APK 大小：%%~zI 字节
    echo.
    echo 下一步：
    echo   1. 把 app-release.apk 传到手机
    echo   2. 手机需打开"允许未知来源应用"
    echo   3. 点击 APK 文件安装
    echo   4. 首次启动需输入密码（密码即 generate-keystore 时设置的访问密码）
    echo.
) else (
    echo [警告] 未在预期位置找到 APK，请手动查找 app-release.apk
)

pause