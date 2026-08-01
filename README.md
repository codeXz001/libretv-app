# LibreTV Android App（Capacitor 打包版）

基于 [LibreTV](https://github.com/LibreSpark/LibreTV) 用 [Capacitor](https://capacitorjs.com/) 打包的 Android 应用。

## 项目结构

```
libretv-app/
├── android/                     Capacitor 生成的 Android Studio 项目
├── www/                         前端静态资源（从 LibreTV 项目复制）
│   ├── index.html
│   ├── player.html
│   ├── watch.html
│   ├── manifest.json
│   ├── js/  css/  libs/  image/
├── capacitor.config.json        Capacitor 配置
├── package.json
├── README.md                    ← 本文件
├── BUILD_AND_DEBUG.md           ← 打包与手机调试指引
├── INSTALL_ANDROID_SDK_F.md     ← Android SDK/JDK 安装到 F 盘指引
├── build-all.bat                ← 一键打包入口
├── setup-android-env.bat        ← 自动配置环境变量（管理员运行）
└── setup-gradle-cache.bat       ← 把 Gradle 缓存迁到 F 盘
```

## 完整流程速查

| 步骤 | 操作 | 文档 |
|---|---|---|
| 1 | 部署 LibreTV 后端到 Cloudflare Pages | `../LibreTV/DEPLOY_CLOUDFLARE.md` |
| 2 | 安装 Android Studio + SDK 到 F 盘 | `INSTALL_ANDROID_SDK_F.md` |
| 3 | 改 `www/js/config.js` 的 `PROXY_URL` | — |
| 4 | （可选）改 `www/js/app-config.js` 设置密码 | — |
| 5 | 配置环境变量 | `setup-android-env.bat`（管理员运行） |
| 6 | 同步 + 打包 APK | `build-all.bat` 或 `BUILD_AND_DEBUG.md` |
| 7 | 安装到手机调试 | `BUILD_AND_DEBUG.md` |

## 快速开始（已安装好工具链的环境）

```bash
cd f:/app/libretv-app
npx cap sync android           # 同步前端到原生项目
cd android
generate-keystore.bat          # 首次打包需要：生成 keystore
build-release.bat              # 打包 release APK
```

打包成功后 APK 在 `android/app/build/outputs/apk/release/app-release.apk`。

## 命令速查

| 命令 | 作用 |
|---|---|
| `npm run sync` | 把 www/ 同步到 Android/iOS 原生项目 |
| `npm run android` | 用 Android Studio 打开 android/ |
| `npm run build:android` | 命令行直接打 release APK（需先配好签名） |
| `build-all.bat` | 同步 + 打包一条龙 |
| `setup-android-env.bat` | 自动配置 JAVA_HOME / ANDROID_HOME / PATH |
| `setup-gradle-cache.bat` | 把 Gradle 缓存迁到 F 盘 |

## License

Apache-2.0（同 LibreTV）