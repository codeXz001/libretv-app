@echo off
REM ============================================
REM Android 开发环境变量一键配置脚本
REM ============================================
REM 用法：以管理员身份运行此脚本
REM 作用：自动配置 JAVA_HOME / ANDROID_HOME / Path
REM 备份：会备份原 Path 到 %USERPROFILE%\path-backup.txt
REM ============================================

setlocal enabledelayedexpansion

echo.
echo === Android 开发环境变量配置脚本 ===
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请以管理员身份运行此脚本！
    echo 右键脚本 → "以管理员身份运行"
    pause
    exit /b 1
)

REM 检查路径是否存在
set "STUDIO_PATH=F:\Program Files\Android\Android Studio"
set "JDK_PATH=%STUDIO_PATH%\jbr"
set "SDK_PATH=F:\Android\Sdk"

if not exist "%JDK_PATH%\bin\javac.exe" (
    echo [警告] 未检测到 JDK: %JDK_PATH%
    echo 请先完成 Android Studio 安装，并确认 jbr 目录存在
    echo.
    set /p CONTINUE="是否继续配置（假设你会装好 JDK）？(y/N): "
    if /i not "%CONTINUE%"=="y" (
        echo 已取消。
        pause
        exit /b 0
    )
)

if not exist "%SDK_PATH%\platform-tools\adb.exe" (
    echo [警告] 未检测到 Android SDK: %SDK_PATH%
    echo 请先在 Android Studio SDK Manager 中安装组件
    echo.
    set /p CONTINUE="是否继续配置（假设你会装好 SDK）？(y/N): "
    if /i not "%CONTINUE%"=="y" (
        echo 已取消。
        pause
        exit /b 0
    )
)

echo [1/4] 备份当前 PATH...
echo !PATH! > "%USERPROFILE%\path-backup-%date:~0,4%%date:~5,2%%date:~8,2%.txt"
echo 已备份到 %USERPROFILE%\path-backup-*.txt

echo [2/4] 设置 JAVA_HOME...
setx JAVA_HOME "%JDK_PATH%" /M >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 用户级 setx 失败，尝试用户级...
    setx JAVA_HOME "%JDK_PATH%" >nul 2>&1
)

echo [3/4] 设置 ANDROID_HOME / ANDROID_SDK_ROOT...
setx ANDROID_HOME "%SDK_PATH%" /M >nul 2>&1
if %errorlevel% neq 0 (
    setx ANDROID_HOME "%SDK_PATH%" >nul 2>&1
)
setx ANDROID_SDK_ROOT "%SDK_PATH%" /M >nul 2>&1
if %errorlevel% neq 0 (
    setx ANDROID_SDK_ROOT "%SDK_PATH%" >nul 2>&1
)

echo [4/4] 追加 PATH...
REM 检查 PATH 里是否已有这些路径，避免重复
set "NEW_PATH=%%PATH%%"

REM 用 setx 设置新的 PATH（保留原有 + 新增）
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%b"

REM 把新路径加到系统 PATH 末尾
set "ADD_PATH=%JDK_PATH%\bin;%SDK_PATH%\platform-tools;%SDK_PATH%\cmdline-tools\latest\bin;%SDK_PATH%\emulator"

REM 简单判断：如果 PATH 里已有这些路径就跳过，否则追加
echo %SYS_PATH% | findstr /i "%JDK_PATH%\bin" >nul 2>&1
if %errorlevel% neq 0 (
    set "NEW_SYS_PATH=%SYS_PATH%;%ADD_PATH%"
    setx Path "%NEW_SYS_PATH%" /M >nul 2>&1
    if %errorlevel% neq 0 (
        setx Path "%USR_PATH%;%ADD_PATH%" >nul 2>&1
    )
    echo 已追加到 PATH: %ADD_PATH%
) else (
    echo PATH 中已包含目标路径，跳过
)

echo.
echo === 配置完成 ===
echo.
echo 已设置的环境变量：
echo   JAVA_HOME = %JDK_PATH%
echo   ANDROID_HOME = %SDK_PATH%
echo   ANDROID_SDK_ROOT = %SDK_PATH%
echo   PATH 追加 = %JDK_PATH%\bin;%SDK_PATH%\platform-tools;...
echo.
echo [重要] 必须新开命令行窗口才能生效！
echo 验证命令（新窗口中执行）：
echo   java -version
echo   adb version
echo   sdkmanager --list_installed
echo.
pause