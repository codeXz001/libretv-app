@echo off
chcp 65001 >nul
setlocal
cd /d "F:\app\libretv-app"

echo ============================================
echo   LibreTV App - One-click APK Build
echo ============================================
echo.

rem ---- 1. 检查 Java ----
java -version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 Java，请安装 JDK 17+ 并配置 JAVA_HOME
    pause
    exit /b 1
)
echo [OK] Java:
java -version 2>&1 | findstr /i "version"

rem ---- 2. 检查 Android SDK ----
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    ) else (
        echo [ERROR] 未找到 Android SDK，请安装并配置 ANDROID_HOME 环境变量
        pause
        exit /b 1
    )
)
echo [OK] ANDROID_HOME=%ANDROID_HOME%

rem ---- 3. 修复 local.properties（写入真实 SDK 路径）----
> "android\local.properties" echo sdk.dir=%ANDROID_HOME:\=/%
echo [OK] android\local.properties 已更新

rem ---- 4. 可选：同步 LibreTV 最新 Web 层 ----
echo.
set /p SYNC_WEB="是否先同步 LibreTV 最新 Web 层到 www? (Y/N, 默认 N): "
if /i "%SYNC_WEB%"=="Y" (
    call npm run sync:web
    if errorlevel 1 echo [WARN] sync:web 失败，继续构建（使用现有 www）
)

rem ---- 5. cap sync ----
echo.
echo 执行 npx cap sync ...
call npx cap sync
if errorlevel 1 ( echo [ERROR] cap sync 失败 & pause & exit /b 1 )

rem ---- 6. 判断签名并构建 ----
set "BUILD_TYPE=assembleDebug"
if exist "android\app\libretv-release.keystore" (
    set "BUILD_TYPE=assembleRelease"
    echo [INFO] 检测到 release keystore，构建 Release 包
) else (
    echo [INFO] 未检测到 release keystore，构建 Debug 包（可直接安装调试；上架需先生成 keystore）
)

echo.
echo 开始构建 %BUILD_TYPE% （首次会下载 Gradle 依赖，请耐心等待）...
cd android
call gradlew.bat %BUILD_TYPE% --no-daemon
if errorlevel 1 ( echo [ERROR] 构建失败，请检查上方日志 & cd .. & pause & exit /b 1 )
cd ..

echo.
echo ============================================
if "%BUILD_TYPE%"=="assembleRelease" (
    echo 构建完成:
    echo   android\app\build\outputs\apk\release\app-release.apk
) else (
    echo 构建完成:
    echo   android\app\build\outputs\apk\debug\app-debug.apk
)
echo ============================================
pause
