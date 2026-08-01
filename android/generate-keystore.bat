@echo off
REM ============================================
REM LibreTV Android App - Keystore 生成脚本
REM ============================================
REM 用法：双击运行，按提示输入密码
REM 完成后请保留 libretv-release.keystore 和记住密码
REM 每次更新应用必须用同一个 keystore，否则会被识别为不同应用
REM ============================================

cd /d "%~dp0"

echo.
echo === 正在生成 LibreTV 自签名密钥库 ===
echo.

if exist libretv-release.keystore (
    echo [警告] libretv-release.keystore 已存在！
    set /p OVERWRITE="是否覆盖？现有应用将无法被覆盖安装 (y/N): "
    if /i not "%OVERWRITE%"=="y" (
        echo 已取消。
        pause
        exit /b 0
    )
)

set /p STORE_PWD="请输入密钥库密码（会被隐藏，建议 8 位以上）: "
set /p KEY_PWD="请输入密钥密码（可与上面相同）: "
set /p ALIAS="请输入密钥别名（默认 libretv）: "
if "%ALIAS%"=="" set ALIAS=libretv

keytool -genkey -v ^
  -keystore libretv-release.keystore ^
  -alias %ALIAS% ^
  -keyalg RSA ^
  -keysize 2048 ^
  -validity 10000 ^
  -storepass %STORE_PWD% ^
  -keypass %KEY_PWD% ^
  -dname "CN=LibreTV, OU=Personal, O=LibreTV, L=City, ST=State, C=CN"

if %errorlevel% neq 0 (
    echo.
    echo [错误] 生成密钥库失败
    pause
    exit /b 1
)

echo.
echo === 密钥库生成成功：libretv-release.keystore ===
echo.

REM 把密码写入 keystore.properties
(
    echo # Release Keystore 配置（敏感信息，请勿提交到 Git）
    echo storePassword=%STORE_PWD%
    echo keyPassword=%KEY_PWD%
    echo keyAlias=%ALIAS%
    echo storeFile=libretv-release.keystore
) > keystore.properties

echo === 密码已写入 keystore.properties ===
echo.
echo 下一步：
echo   1. 编辑 build.gradle 已自动启用签名
echo   2. 运行 build-release.bat 打包 APK
echo.

pause