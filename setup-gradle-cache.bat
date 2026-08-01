@echo off
REM ============================================
REM Gradle 用户主目录迁移到 F 盘脚本
REM ============================================
REM 用法：直接双击运行（不需要管理员）
REM 作用：让 Gradle 把所有缓存/依赖存到 F 盘而不是 C 盘
REM 原理：设置 GRADLE_USER_HOME 环境变量
REM ============================================

setlocal

echo.
echo === Gradle 缓存迁移到 F 盘 ===
echo.

set "GRADLE_HOME_DIR=F:\gradle-cache"

if not exist "%GRADLE_HOME_DIR%" (
    mkdir "%GRADLE_HOME_DIR%"
    echo 已创建目录: %GRADLE_HOME_DIR%
)

REM 检查是否已设置
setx GRADLE_USER_HOME "%GRADLE_HOME_DIR%" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo === 已设置 GRADLE_USER_HOME = %GRADLE_HOME_DIR% ===
    echo.
    echo [重要] 新开命令行窗口后生效
    echo 验证：
    echo   echo %%GRADLE_USER_HOME%%
    echo   应该输出: %GRADLE_HOME_DIR%
    echo.
) else (
    echo [错误] 设置失败
)

pause