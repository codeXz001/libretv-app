# LibreTV Android 打包快速上手

> 最简流程：装 JDK + Android 命令行工具 → 一键打包 APK（无需 Android Studio 图形界面）

---

## 🎯 最小化方案（仅命令行）

**只需 3 个组件**：
1. ✅ JDK 17（200 MB）
2. ✅ Android 命令行工具（150 MB）
3. ✅ Gradle（自动下载）

**跳过**：
- ❌ Android Studio GUI（省 1.5 GB）
- ❌ Android Emulator（省 1 GB）

---

## 步骤 1：安装 JDK 17

### 方式 A：winget 一键安装（推荐）

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

安装位置：`C:\Program Files\Eclipse Adoptium\jdk-17.x.x`

### 方式 B：手动下载

1. 打开 https://adoptium.net/temurin/releases/?version=17
2. 选择 `.msi` Windows x64 安装包
3. 双击安装（勾选"添加到 PATH"）

### 验证

**新开** PowerShell：
```powershell
java -version
javac -version
```

应显示 `openjdk version "17.x.x"`

---

## 步骤 2：下载 Android 命令行工具

打开 https://developer.android.com/studio#command-line-tools-only

下载 **commandlinetools-win-xxxx_latest.zip**（约 150 MB）

解压到：
```
F:\Android\Sdk\cmdline-tools\latest\
```

目录结构应该是：
```
F:\Android\Sdk\
└── cmdline-tools\
    └── latest\
        ├── bin\
        │   ├── sdkmanager.bat
        │   └── avdmanager.bat
        └── lib\
```

---

## 步骤 3：用 sdkmanager 安装必需组件

**PowerShell 执行**：

```powershell
# 设置临时环境变量
$env:ANDROID_HOME = "F:\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

# 同意许可
sdkmanager --licenses

# 安装必需组件（约 5-10 分钟）
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

---

## 步骤 4：配置永久环境变量

**手动设置**：
1. Win + R → `sysdm.cpl` → 高级 → 环境变量
2. 用户变量新建：
   - `JAVA_HOME` = `C:\Program Files\Eclipse Adoptium\jdk-17.x.x`
   - `ANDROID_HOME` = `F:\Android\Sdk`
3. 用户变量 `Path` 追加：
   - `%JAVA_HOME%\bin`
   - `%ANDROID_HOME%\platform-tools`
   - `%ANDROID_HOME%\cmdline-tools\latest\bin`

**或用脚本**（管理员运行）：
```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "F:\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot", "User")

$oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPath = "$oldPath;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin"
[Environment]::SetEnvironmentVariable("Path", $newPath, "User")
```

---

## 步骤 5：验证

**新开** PowerShell：
```powershell
java -version
adb version
sdkmanager --list_installed
```

三个都有输出 = 环境就绪 ✅

---

## 步骤 6：配置 Capacitor 项目

```powershell
cd f:\app\libretv-app

# 写入 SDK 路径
echo "sdk.dir=F:\\Android\\Sdk" > android\local.properties

# 验证
type android\local.properties
```

---

## 步骤 7：生成签名密钥

```powershell
cd android

keytool -genkey -v `
  -keystore libretv-release.keystore `
  -alias libretv `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

按提示输入密码（**务必记住**）和证书信息。

完成后把密码写入 `android\keystore.properties`（手动编辑）：

```properties
storePassword=你的密码
keyPassword=你的密码
keyAlias=libretv
storeFile=libretv-release.keystore
```

---

## 步骤 8：打包 APK

```powershell
cd f:\app\libretv-app\android

# 清理旧构建
.\gradlew.bat clean

# 打包 release（首次约 5-10 分钟，会下载 Gradle + 依赖）
.\gradlew.bat assembleRelease
```

等待输出：
```
BUILD SUCCESSFUL in 5m 32s
```

APK 位置：
```
f:\app\libretv-app\android\app\build\outputs\apk\release\LibreTV-v{versionName}-release.apk
```

---

## 步骤 9：安装到手机

1. 把 APK 通过 USB/微信/QQ 传到手机
2. 手机：设置 → 应用 → 特殊应用权限 → 安装未知应用 → 允许
3. 点击 APK 安装
4. 打开应用 → 输入密码 `999999` → 开始使用

---

## 🐛 常见问题

### Q: gradlew.bat 找不到 JAVA_HOME？
A: 关闭所有 PowerShell 窗口，**新开一个**才能读到新环境变量

### Q: sdkmanager 找不到？
A: 检查 `F:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat` 是否存在

### Q: Gradle 下载很慢？
A: 编辑 `C:\Users\<你的用户名>\.gradle\init.gradle`（新建），写入：
```groovy
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/central' }
        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    }
}
```

### Q: 想重新打包？
A: 改了 `www/` 下的文件后：
```powershell
cd f:\app\libretv-app
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

---

## ⏱️ 时间预估

| 步骤 | 时间 |
|---|---|
| 装 JDK | 3 分钟 |
| 下载命令行工具 | 5 分钟 |
| sdkmanager 装组件 | 10 分钟 |
| 首次 Gradle 构建 | 10 分钟 |
| **总计** | **约 30 分钟** |

---

完成后把 APK 路径告诉我，我帮你验证。
