# Android 开发工具链安装指引（全部装到 F 盘）

> 目标：在 F 盘完整安装 Android Studio + JDK 17 + Android SDK，配好环境变量，让 `f:/app/libretv-app` 可以命令行打包 APK。

---

## 📊 磁盘占用预估

| 组件 | 大小 | 安装路径 |
|---|---|---|
| Android Studio | ~600 MB | `F:\Program Files\Android\Android Studio` |
| Android Studio 自带 JDK 17 | ~200 MB | `F:\Program Files\Android\Android Studio\jbr` |
| Android SDK + Build Tools + Platform 34 | ~500 MB | `F:\Android\Sdk` |
| Platform-Tools（adb） | ~150 MB | `F:\Android\Sdk\platform-tools` |
| Gradle 缓存（首次打包时下载） | ~500 MB - 1 GB | `C:\Users\<user>\.gradle`（可改到 F） |
| **合计** | **~1.5 - 2.5 GB** | 全部在 F 盘 |

---

## 步骤 1：下载 Android Studio

打开浏览器访问：

```
https://developer.android.com/studio
```

点击 **`Download Android Studio Hedgehog`**（或更新版本）
同意条款 → 下载 `.exe`（约 1.2 GB）

---

## 步骤 2：安装 Android Studio（关键：改路径到 F 盘）

1. 双击运行下载的 `.exe`
2. 欢迎页 → **Next**
3. 组件选择页 → 全选（Android Studio + Android Virtual Device 用不上可以不勾）→ **Next**
4. **安装路径（重点）**：
   - 默认是 `C:\Program Files\Android\Android Studio`
   - **改为**：`F:\Program Files\Android\Android Studio`
   - 点 **Browse...** 选择 F 盘对应目录
5. **开始菜单文件夹** → 保持默认 → **Install**
6. 等待 5-10 分钟安装
7. 勾选 **Start Android Studio** → **Finish**

---

## 步骤 3：首次启动配置

### 3.1 导入设置

首次启动弹出 **Import Android Studio Settings** 对话框：

- 选 **`Do not import settings`**（首次安装）
- 点 **OK**

### 3.2 数据共享

弹出 **Help improve Android Studio** 提示：

- 选 **`Don't send`**（隐私）
- 点 **OK**

### 3.3 进入 SDK Manager（关键：改 SDK 路径到 F 盘）

- 顶部菜单 → **`Tools`** → **`SDK Manager`**（或欢迎页直接点 SDK Manager 图标）
- 弹窗右上角 **`Edit`** 链接（在路径右边）

进入 SDK Setup：
- **Android SDK Location**：把默认的 `C:\Users\xxx\AppData\Local\Android\Sdk` 改为 **`F:\Android\Sdk`**
- 弹窗会问"目录不存在，是否创建" → **Yes**

### 3.4 选择 SDK 组件

回到 SDK Manager 主界面：

**SDK Platforms** 标签 → 勾选：
- ✅ `Android 14 (API 34)`（推荐，Capacitor 6 默认 targetSdk）
- 其他版本可按需勾选（不勾省空间）

**SDK Tools** 标签 → 勾选：
- ✅ `Android SDK Build-Tools 34.0.0`（必须）
- ✅ `Android SDK Command-line Tools (latest)`
- ✅ `Android SDK Platform-Tools`（adb，必须）
- ✅ `Android Emulator`（可选，要模拟器就勾，约 1.5 GB；不要就别勾）
- ✅ `Google USB Driver`（可选，真机调试用）

### 3.5 应用并下载

- 点 **`Apply`**
- 弹出 License 同意 → 全选 → **`Accept`**
- **`Next`** → 等待下载（5-15 分钟，取决于网速）
- 下载完成 → **`Finish`**

---

## 步骤 4：配置系统环境变量

让命令行（PowerShell / CMD / Git Bash）也能找到 JDK 和 Android SDK。

### 4.1 打开环境变量设置

- `Win + R` → 输入 `sysdm.cpl` → 回车
- **`高级`** 标签 → **`环境变量(N)...`**

### 4.2 配置用户环境变量（推荐，影响小）

在 **用户变量** 区：

| 变量名 | 变量值 |
|---|---|
| `JAVA_HOME` | `F:\Program Files\Android\Android Studio\jbr` |
| `ANDROID_HOME` | `F:\Android\Sdk` |
| `ANDROID_SDK_ROOT` | `F:\Android\Sdk`（兼容旧脚本） |

> ⚠️ Android Studio 自带的 JDK 在 `jbr` 目录下。如果你另外装独立 JDK 17 到 `F:\tools\jdk-17`，那就改成那个路径。

### 4.3 修改 PATH（追加，不覆盖）

在用户变量的 **`Path`** 行点 **`编辑(I)...`**：

点 **`新建(N)`**，依次添加：

```
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\cmdline-tools\latest\bin
%ANDROID_HOME%\emulator
```

> 最后一行如果你没装 Android Emulator，可以不加。

### 4.4 保存

- 一路点 **`确定`** 关闭所有对话框

---

## 步骤 5：把 Gradle 缓存也搬到 F 盘（推荐）

Gradle 首次打包会下载约 500 MB - 1 GB 的依赖到 `C:\Users\<user>\.gradle`，可以改到 F 盘：

### 5.1 新建 gradle 配置目录

```bash
mkdir -p "F:\gradle-cache"
```

### 5.2 配置用户级 gradle.properties

创建文件 `C:\Users\Administrator\.gradle\gradle.properties`（用户名请改）：

```properties
# Gradle 守护进程配置
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true

# Gradle 用户主目录迁移到 F 盘
# 注意：这个变量 Gradle 7.6+ 才支持
# GRADLE_USER_HOME=F:\gradle-cache
```

> 把 `GRADLE_USER_HOME` 那行取消注释，Gradle 缓存就会存到 `F:\gradle-cache`。
> 注意：设置了 `GRADLE_USER_HOME` 后，`C:\Users\xxx\.gradle` 就不再用了。

### 5.3 备选：项目级 gradle.properties（不影响其他项目）

如果不想改用户级配置，可以只在 `f:/app/libretv-app/android/gradle.properties` 加：

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.daemon=true
```

---

## 步骤 6：验证安装

打开 **新的** PowerShell 或 CMD 窗口（旧窗口读不到新环境变量），依次执行：

```bash
# 检查 JDK
java -version
# 期望输出：openjdk version "17.x.x" ...

# 检查 javac
javac -version
# 期望输出：javac 17.x.x

# 检查 adb
adb version
# 期望输出：Android Debug Bridge version 1.0.xx

# 检查 sdkmanager
sdkmanager --list_installed
# 期望输出：列出已安装的 packages（含 build-tools;34.0.0, platforms;android-34 等）
```

如果任何一个命令找不到，说明环境变量配置有问题，回到步骤 4 检查。

---

## 步骤 7：配置 Capacitor 项目

让 `f:/app/libretv-app/android/` 知道 SDK 在哪：

### 7.1 编辑 local.properties

打开 `f:/app/libretv-app/android/local.properties`（已有这个文件，可能内容是错的），改为：

```properties
sdk.dir=F\:\\Android\\Sdk
```

> Windows 路径里的反斜杠要转义为 `\\`。

### 7.2 验证

```bash
cd f:/app/libretv-app/android
type local.properties
```

应该看到 `sdk.dir=F:\Android\Sdk`。

---

## 步骤 8：第一次打包测试

### 8.1 生成 keystore

```bash
cd f:/app/libretv-app/android
generate-keystore.bat
```

按提示输入密码（会自动写入 `keystore.properties`）。

### 8.2 命令行打包

```bash
build-release.bat
```

或者用 Android Studio：

```bash
cd f:/app/libretv-app
npx cap open android
```

Android Studio 打开后会自动同步 Gradle（首次需 5-15 分钟下载依赖）。

等 Gradle Sync 完成后，菜单 **`Build`** → **`Generate Signed Bundle / APK...`** → 按提示走。

### 8.3 找到 APK

成功后会输出：

```
BUILD SUCCESSFUL in 5m 32s
```

APK 位置：

```
F:\app\libretv-app\android\app\build\outputs\apk\release\LibreTV-v{versionName}-release.apk
```

---

## ⚠️ 常见问题

### Q1: 环境变量配好了但 `java` 还是找不到？
**A**: 必须**新开**命令行窗口，旧窗口的环境变量缓存还在。每个新设置的 `JAVA_HOME` 都需要重开 shell 才会生效。

### Q2: `sdkmanager` 提示 "Warning: Could not create settings"
**A**: 环境变量 `JAVA_HOME` 没设好或者路径里有空格。Android Studio 默认路径包含空格（`Program Files`），建议把 JDK 单独装到 `F:\tools\jdk-17` 避免问题。

### Q3: Gradle 下载很慢/卡住？
**A**: 改用国内镜像。在用户级 `~/.gradle/init.gradle` 添加：
```groovy
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/central' }
        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    }
}
```

### Q4: Android Studio 启动特别慢？
**A**: 编辑 `F:\Program Files\Android\Android Studio\bin\idea64.exe.vmoptions`，加大内存：
```
-Xms1024m
-Xmx4096m
-XX:ReservedCodeCacheSize=512m
```

### Q5: 真机调试时 adb 找不到设备？
**A**:
1. 手机开启 USB 调试
2. 数据线选 "传输文件" 而非 "仅充电"
3. 电脑上安装对应手机的 USB 驱动（一般会自动装）
4. `adb devices` 应该列出设备

---

## ✅ 安装完成后的目录结构

```
F:\
├── Program Files\
│   └── Android\
│       └── Android Studio\         ← Android Studio 本体
│           ├── bin\
│           ├── jbr\                ← 内置 JDK 17
│           └── plugins\
├── Android\
│   └── Sdk\                        ← Android SDK（独立于 Studio）
│       ├── cmdline-tools\
│       ├── platform-tools\
│       ├── build-tools\
│       └── platforms\
├── gradle-cache\                   ← Gradle 缓存（可选迁移）
└── app\
    └── libretv-app\                ← Capacitor 项目
        ├── android\
        │   ├── local.properties   ← 指向 F:\Android\Sdk
        │   ├── keystore.properties
        │   └── libretv-release.keystore
        └── www\
```

完全不影响 C 盘！