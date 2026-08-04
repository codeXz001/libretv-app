# LibreTV Android App — 打包与调试完全指引

> 本文档配套 `libretv-app/` 项目使用。所有命令在 `libretv-app/` 目录根下执行。

---

## 📋 前置环境

你需要在 **本机** 装好以下工具（任选一种打包方式）：

### 方式 A：Android Studio 打包（推荐新手）

| 工具 | 版本 | 下载 |
|---|---|---|
| Android Studio | Hedgehog 2023.1.1 或更高 | https://developer.android.com/studio |
| JDK | 17（Android Studio 自带） | — |
| Android SDK | API 34（Android Studio 自带） | — |

下载 Android Studio 后第一次启动会引导你安装 SDK。

### 方式 B：命令行打包（适合 CI / 高级用户）

| 工具 | 版本 | 下载 |
|---|---|---|
| JDK | 17 | https://adoptium.net/ |
| Android SDK | API 34 + Build-Tools | https://developer.android.com/studio#command-line-tools-only |
| 设置环境变量 `ANDROID_HOME` 指向 SDK 目录 | — | — |

---

## 🚀 三步打包流程

### 第 1 步：把后端地址填入应用

打开 `www/js/config.js`，把占位符改成你部署好的 LibreTV 后端地址：

```js
// 改成你的公网后端地址（部署指引见 ../LibreTV/DEPLOY_CLOUDFLARE.md）
const PROXY_URL = 'https://libretv.pages.dev/proxy/';
```

> ⚠️ **必须 HTTPS**，否则 Android 9+ 会拒绝明文 HTTP 请求

---

### 第 2 步：（可选）设置应用密码

打开 `www/js/app-config.js`：

```js
const APP_PASSWORD_HASH = '';  // 留空 = 无需密码
// 或者填一个密码的 SHA-256 哈希：
const APP_PASSWORD_HASH = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';  // = 'admin'
```

**生成密码哈希**（任选一种）：
- 浏览器控制台：`crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的密码')).then(h => console.log(Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')))`
- Node.js：`node -e "console.log(require('crypto').createHash('sha256').update('你的密码').digest('hex'))"`

---

### 第 3 步：同步前端到原生项目

每次改了 `www/` 下的文件都需要重新同步：

```bash
cd f:/app/libretv-app
npx cap sync android
```

---

## 📦 方式 A：用 Android Studio 打包

### 1. 打开项目

```bash
cd f:/app/libretv-app
npx cap open android
```

会启动 Android Studio 并自动打开 `android/` 目录。

### 2. 首次同步（可能 5-10 分钟）

Android Studio 会自动下载 Gradle、依赖、SDK 组件。等待右下角进度条完成。

如果弹出 "Trust this project" 提示，选 "Trust"。

### 3. 生成签名密钥

1. 顶部菜单 `Build` → `Generate Signed Bundle / APK...`
2. 选 `APK` → `Next`
3. 选 `Create new...` 创建 keystore
4. 填写：
   - **Key store path**：`f:/app/libretv-app/android/libretv-release.keystore`
   - **Password**：自己设一个 8 位以上的密码（务必记住！）
   - **Confirm**：再输一遍
   - **Alias**：`libretv`
   - **Validity (years)**：`100`
   - 下方证书信息随便填（CN/OU/O/L/ST/C 至少填一项）
5. 点 `OK` → `Next`

> ⚠️ **keystore 必须妥善保管**：每次升级应用都要用同一个 keystore，否则会被识别为不同应用，无法覆盖安装！

### 4. 选择 release 构建

1. 选 `release`
2. 勾选 `V1 (Jar Signature)` 和 `V2 (Full APK Signature)`（兼容性最好）
3. 点 `Create`

### 5. 等待打包完成

控制台会输出：
```
BUILD SUCCESSFUL
```

### 6. 找到 APK

APK 位置：
```
f:/app/libretv-app/android/app/build/outputs/apk/release/LibreTV-v{versionName}-release.apk
```

---

## 📦 方式 B：用命令行打包

### 1. 配 JDK + Android SDK

确保环境变量已设置：
```bash
java -version    # 17.x
echo %ANDROID_HOME%   # 类似 C:\Users\xxx\AppData\Local\Android\Sdk
```

### 2. 创建 keystore

双击运行：
```
f:/app/libretv-app/android/generate-keystore.bat
```

按提示输入密码（密码会自动写入 `keystore.properties`）。

### 3. 打包

双击运行：
```
f:/app/libretv-app/android/build-release.bat
```

或者命令行：
```bash
cd f:/app/libretv-app/android
gradlew.bat assembleRelease
```

### 4. 找到 APK

```
f:/app/libretv-app/android/app/build/outputs/apk/release/LibreTV-v{versionName}-release.apk
```

---

## 📱 安装到手机

### 1. 准备手机

- **Android 6.0+**（minSdkVersion）
- **打开"未知来源"**：
  - 设置 → 应用 → 特殊应用权限 → 安装未知应用 → 选择你用来打开 APK 的应用（文件管理器 / 微信 / QQ / 浏览器）→ 允许

### 2. 传输 APK

任选一种：
- **USB 数据线**：连接电脑 → 把 APK 复制到手机存储
- **微信/QQ**：发给自己 → 在手机上下载
- **网盘**：上传到网盘 → 手机下载
- **ADB**：`adb install LibreTV-v{versionName}-release.apk`

### 3. 安装

在手机文件管理器里点击 APK → 确认安装 → 等待几秒完成。

### 4. 启动

桌面会出现 **LibreTV** 图标（黑色圆角 logo），点击打开。

---

## 🐛 调试

### 方式 1：Chrome 远程调试（推荐）

1. 手机打开 **USB 调试**：
   - 设置 → 关于手机 → 连点 7 次"版本号"激活开发者模式
   - 返回 → 系统 → 开发者选项 → 打开 USB 调试

2. USB 连接电脑

3. 电脑 Chrome 地址栏输入：
   ```
   chrome://inspect/#devices
   ```

4. 手机上启动 LibreTV 应用

5. 在 Chrome 里会看到 WebView 列表，点击 `inspect` 即可打开 DevTools

可以查看 console、network、修改样式，所有 Web 调试能力都可用。

### 方式 2：Android Studio Logcat

Android Studio 底部 `Logcat` 标签可以看原生日志：
- 筛选 `Capacitor` / `chromium` / `WebView` 看 Web 端日志
- 筛选 `libretv` / `MainActivity` 看原生端日志

### 方式 3：应用内查看错误

打开应用 → 如果搜索/播放失败，页面上会有红色 toast 提示。

---

## 🔄 更新应用流程

后续修改了前端代码后：

```bash
cd f:/app/libretv-app
# 修改 www/ 下的文件
npx cap sync android
```

然后重新打包（同上步骤），生成新的 APK 传到手机覆盖安装。

---

## ⚠️ 常见问题

### Q1: 安装提示"应用未安装"
**A**:
- 检查是否开启了"未知来源"
- 检查是否已安装同包名但不同签名的旧版本（卸载重装）
- 检查 APK 是否下载完整（重新下载）

### Q2: 启动后白屏 / 一直转圈
**A**:
- 检查手机网络是否正常
- 打开 `chrome://inspect` 看 console 报错
- 最常见原因：`PROXY_URL` 没改成公网地址，或者后端没部署好
- 手机能否直接打开 `https://your-domain.pages.dev`？不能就是后端问题

### Q3: 能搜索但视频播不了
**A**:
- 后端 Functions 日志看是否有 `代理请求鉴权失败`
- 检查 `CORS_ORIGIN` 环境变量是否设置正确
- 如果是国内手机 + Cloudflare：可能需要 VPN

### Q4: 键盘弹出后播放器被挤压
**A**: 在 `www/css/` 加键盘适配样式，或等 Capacitor 后续修复 WebView 焦点问题

### Q5: 全屏播放切换有问题
**A**: ArtPlayer 的全屏是 Web 层全屏，需要手动适配 Android 状态栏。在 `www/js/player.js` 监听全屏事件调整 statusBar 插件。

### Q6: 想改应用名称
**A**: 编辑 `android/app/src/main/res/values/strings.xml`：
```xml
<string name="app_name">LibreTV</string>
<string name="title_activity_main">LibreTV</string>
```

### Q7: 想换图标
**A**: 把图标覆盖到 `android/app/src/main/res/mipmap-*/ic_launcher.png`（不同分辨率），重启 Android Studio 让它重新生成预览。

### Q8: 想换包名（com.libretv.app）
**A**: 全局搜索替换 `com.libretv.app` 为新包名，同时修改：
- `android/app/build.gradle` 的 `applicationId` 和 `namespace`
- `android/app/src/main/java/com/libretv/app/` 目录结构
- `capacitor.config.json` 的 `appId`

### Q9: 升级到新版本 LibreTV
**A**:
```bash
# 把新版 LibreTV 的文件复制过来（注意排除后端相关）
xcopy /E /Y /I f:\app\LibreTV\js      f:\app\libretv-app\www\js
xcopy /E /Y /I f:\app\LibreTV\css     f:\app\libretv-app\www\css
xcopy /E /Y /I f:\app\LibreTV\libs    f:\app\libretv-app\www\libs
xcopy /E /Y    f:\app\LibreTV\index.html  f:\app\libretv-app\www\index.html
xcopy /E /Y    f:\app\LibreTV\player.html f:\app\libretv-app\www\player.html
xcopy /E /Y    f:\app\LibreTV\watch.html  f:\app\libretv-app\www\watch.html
npx cap sync android
```

---

## 📂 项目最终结构

```
libretv-app/                          ← 项目根
├── www/                              ← 前端资源（修改这里）
│   ├── index.html
│   ├── player.html
│   ├── watch.html
│   ├── manifest.json
│   ├── js/
│   │   ├── app-config.js            ← 应用密码配置（新建）
│   │   ├── api.js / search.js / ... （从 LibreTV 复制）
│   │   └── config.js                ← PROXY_URL 在这里改
│   ├── css/
│   ├── image/                       ← 图标源文件
│   └── libs/
├── android/                         ← Capacitor 生成的 Android 项目
│   ├── app/
│   │   ├── build.gradle             ← 已配置签名
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml  ← 已加权限
│   │   │   ├── assets/public/       ← www/ 同步到这里
│   │   │   └── java/com/libretv/app/MainActivity.java
│   │   └── res/                     ← 图标在这里
│   ├── keystore.properties          ← 签名密码（首次打包时自动创建）
│   ├── libretv-release.keystore     ← 签名密钥（首次打包时自动创建）
│   ├── generate-keystore.bat        ← 生成 keystore 脚本
│   └── build-release.bat            ← 打包脚本
├── capacitor.config.json
├── package.json
├── README.md
└── build-all.bat                    ← 根目录一键打包入口
```

---

## 🎯 验收清单

打包安装到手机后，逐项验证：

- [ ] 应用图标是 LibreTV logo
- [ ] 应用名称是 "LibreTV"
- [ ] 启动有黑色启动屏（logo 居中）
- [ ] 启动后能看到首页（搜索框 + 豆瓣推荐）
- [ ] 设置面板能打开
- [ ] 搜索关键词能返回结果
- [ ] 点击搜索结果能进入播放页
- [ ] 视频能正常播放（HLS）
- [ ] 播放器支持全屏切换
- [ ] 退出再打开能恢复观看历史

---

完成所有验证后，你就拥有了一个**自签名的 LibreTV Android 应用**，可以自用或小范围分发。