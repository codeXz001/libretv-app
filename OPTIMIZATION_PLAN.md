# LibreTV 优化计划

> 待办清单，按优先级分阶段执行。每个条目都标注了文件路径与具体改动，避免开工时再翻代码。
>
> 创建时间：2026-08-01
>
> 范围：`www/` 前端 + `android/` 原生层 + 文档（README / BUILD_AND_DEBUG / INSTALL_ANDROID_SDK_F）

---

## 阶段 0 · 改动原则（贯穿全局）

- 任何文件改动后，**不**主动 `git add / commit`，由用户确认后再提交。
- 不跑 `npm run lint --fix` / `prettier --write` 这类带 `--fix` 的命令，避免污染 diff。
- 每次实际改动前 `git status --porcelain` 圈定本次边界。
- 所有改动优先用 `Edit` 而非 `Write`，降低误覆盖风险。
- 关键改动（涉及状态、URL、DOM 注入路径）改完后人工 spot-check。

---

## 阶段 1 · 安全 / 健壮性 🔴

> 优先级最高。这些问题在用户量大或被扫站时会被利用；并且其中几条（`isWebkit` / `setInterval` 不清理）已经是确定性的内存泄漏。

### 1.1 [高危] `app.js` onclick 模板字符串注入
- 文件：`www/js/app.js`
- 行号：~750（搜索结果卡片）、~1101（剧集按钮 `renderEpisodes`）
- 现状：`onclick="playVideo('${episode}','${vodName}','${sourceCode}',${index},'${vodId}')"`，`episode`（直来自第三方接口的 m3u8 URL）和 `sourceCode` 没充分转义。
- 方案：
  1. 改用 `addEventListener('click', …)` + `data-*` 属性传值，事件回调里 `e.currentTarget.dataset.xxx` 取。
  2. 所有用户可注入字段（`vod_name`、`title`、`url`、`sourceCode`）用 `textContent` 写入或严格白名单（`sourceCode` 限定为 `custom_<int>` 或 `API_SITES` 的 key）。
  3. 移除 `app.js:751` 的 `showDetails` 拼接式 onclick，同步改为事件委托。

### 1.2 [高危] `api.js` fetch 拦截器 URL 解析偏差
- 文件：`www/js/api.js`
- 行号：~581
- 现状：`new URL(input, window.location.origin)` 对绝对 URL 走 base，路径部分正常；但当 `input` 是相对路径且含特殊字符时，`pathname` 可能错位。
- 方案：
  1. 改为 `typeof input === 'string' ? new URL(input, window.location.origin) : new URL(input.url, window.location.origin)`。
  2. 加 `if (!requestUrl.pathname.startsWith('/api/')) return originalFetch(...)` 提前 return，避免被路径匹配漏判。
  3. 增加 `try/catch` 兜底，URL 解析失败时走原 fetch。

### 1.3 [中危] `videoPlayerFrame.src` 协议校验缺失
- 文件：`www/js/app.js`
- 行号：~1041
- 现状：`videoPlayerFrame.src = url`，URL 来自接口返回，未校验协议。
- 方案：加白名单，只允许 `http:` / `https:`；其余提示「不支持的播放器协议」并 return。

### 1.4 [中危] `importConfigFromUrl` 任意 URL 请求
- 文件：`www/js/app.js`
- 行号：~1205
- 现状：`fetch(url)` 接受任意用户输入 URL。
- 方案：加协议校验（仅 http/https）；可选：增加大小上限（< 1MB）+ 超时（5s）+ 内容类型二次校验。

### 1.5 [低] `player.js` 死代码 `isWebkit`
- 文件：`www/js/player.js`
- 行号：~94
- 方案：直接删除 `const isWebkit = …`，以及后续未引用点。

### 1.6 [中] `player.js` `setInterval(...,200)` 永不清理
- 文件：`www/js/player.js`
- 行号：~265–281
- 现状：`setInterval` 轮询 `art.video`，命中后才 `clearInterval`。若 `art.destroy()` 提前发生（切下一集），轮询会一直跑空。
- 方案：
  1. 改用 `requestAnimationFrame` + 最大重试次数（如 50 次 ≈ 10s），超时未命中则放弃。
  2. 或者把 `art.on('video:loadedmetadata')` 内要做的事搬出 `setInterval`，改为基于事件触发。

### 1.7 [中] `player.js` `setTimeout` ID 未保存
- 文件：`www/js/player.js`
- 行号：~743–758（10s loading 提示文案覆盖）、~264（`saveCurrentProgress` 兜底）
- 方案：所有长寿命 `setTimeout` 保存 ID，`destroy()` 时统一清理（或挂在 artplayer 的 destroy 回调里）。

### 1.8 [低] `api.js` HLS loader 容错
- 文件：`www/js/api.js` / `www/js/player.js`
- 现状：`Hls.DefaultConfig.loader` 在某些打包场景可能为 undefined。
- 方案：`(Hls.DefaultConfig && Hls.DefaultConfig.loader) || class {}` 兜底；并把 `CustomHlsJsLoader` 的 `super(config)` 包一层 try/catch。

### 1.9 [低] `ui.js` Toast 队列清理
- 文件：`www/js/ui.js`
- 行号：~57–94
- 方案：页面卸载（`pagehide` / `beforeunload`）时清空 `toastQueue` 并取消所有 pending `setTimeout`，避免离开页面后回调触发无意义的 DOM 操作。

### 1.10 [低] `app.js:2` 与 `player.js:1` `selectedAPIs` / `customAPIs` 各解析一次
- 文件：`www/js/app.js`、`www/js/player.js`
- 现状：两个页面独立读 localStorage，状态可能不一致。
- 方案：把 localStorage 读取收敛到一处（例如 `config.js` 暴露 `getSelectedAPIs()` / `getCustomAPIs()`），两边都调用。

---

## 阶段 2 · 首屏与渲染性能 🟠

### 2.1 [高影响] tailwindcss CDN 改本地按需构建
- 文件：`www/index.html` line 16 / `www/player.html` line 14 / `www/watch.html`
- 现状：同步加载 `libs/tailwindcss.min.js`（~3MB），阻塞首屏。
- 方案：
  1. 引入 `@tailwindcss/cli`（或保留 CDN 但加 `defer` + 关键 CSS 内联）。
  2. 提取 `index.html`、`player.html`、`watch.html` 实际用到的类，构建出 `css/tailwind-built.css`（预期 < 30KB）。
  3. `<link rel="stylesheet" href="css/tailwind-built.css" media="print" onload="this.media='all'">` 或纯同步（视网络环境定）。
  4. `index.html` head 内联关键 above-the-fold 样式（搜索框、logo、按钮色调），消除首屏白屏闪烁。

### 2.2 [高影响] 10 个 `<script>` 全部加 `defer` 并合并
- 文件：`www/index.html`、`www/player.html`、`www/watch.html`
- 现状：10 个串行 script 标签阻塞解析。
- 方案：
  1. 全部加 `defer`，保证执行顺序。
  2. 提供 `npm run build:bundle` 脚本（esbuild / rollup），输出 `js/app.bundle.js`，单文件 + sourcemap。
  3. 移除 `app-config.js`、`config.js`、`proxy-auth.js`、`customer_site.js`、`ui.js`、`api.js`、`douban.js`、`password.js`、`search.js`、`app.js`、`version-check.js`、`index-page.js` 等独立 script 标签，替换为单 bundle。
  4. 注意 `index.html:417` 的 `window._jsSha256 = window.sha256` 必须在 password.js 加载前完成——bundle 化后用注释锁定顺序即可。

### 2.3 [中影响] 搜索结果改用 DocumentFragment
- 文件：`www/js/app.js`
- 行号：~749–798
- 方案：
  1. 用 `document.createElement('div')` 构建模板字符串 → 改为模板字符串 + `insertAdjacentHTML` 多次插入 / 或构造 `DocumentFragment` 后一次性 append。
  2. 转义逻辑抽到 `utils/escape.js`，所有 DOM 文本写入路径统一调用，杜绝遗漏。
  3. 同步给剧集列表（`renderEpisodes` 两个实现）做同样改造。

### 2.4 [中影响] `renderEpisodes` 去重
- 文件：`www/js/app.js:1095`、`www/js/player.js:858`
- 方案：合并到 `js/render.js` 单一实现，两个页面共用；倒序状态、当前选中态都走参数。

### 2.5 [中影响] `filterAdsFromM3U8` 智能过滤
- 文件：`www/js/player.js`
- 行号：~786–803
- 现状：只过滤 `#EXT-X-DISCONTINUITY`，等于没过滤。
- 方案：
  1. 维护一个广告关键字白名单（URI 含 `ad.`、`ads.`、`/ad/`、广告 domain 列表）。
  2. 当 `#EXTINF` 后续 URI 命中关键字时，跳过该行。
  3. 加 `manifestLoadingTime` 采样，若过滤导致分片 < 总数 50%，自动关闭过滤（兜底）。
  4. 严格模式 (`strictMode = true`) 才使用 loader 拦截，非严格模式仅过滤 `manifest`。

### 2.6 [低] 观看历史全量渲染加虚拟滚动
- 文件：`www/js/ui.js`
- 行号：~382 起
- 方案：仅当历史 > 50 条时启用窗口化（IntersectionObserver），否则保持原逻辑。

### 2.7 [低] 加 `<link rel="preload">` / `dns-prefetch`
- 文件：`www/index.html` head
- 方案：预解析 `PROXY_URL` 域名、`image/logo.png` 用 `preload`，豆瓣图片用 `preconnect`。

---

## 阶段 3 · 代码质量与去重 🟡

### 3.1 收敛 `selectedAPIs` 默认值
- 文件：`www/js/app.js:2`、`:31`
- 现状：默认数组写了两遍。
- 方案：抽到 `config.js` 的 `DEFAULT_SELECTED_APIS = ['tyyszy', 'bfzy', 'dyttzy', 'ruyi']`，统一引用。

### 3.2 删除死代码
- 文件：
  - `www/js/api.js` 的 `handleAggregatedSearch`（~358–469）
  - `www/js/api.js` 的 `handleMultipleCustomSearch`（~471–574）
  - `www/js/api.js` 的 `testSiteAvailability`（~615）—— 主流程没调用。
  - `www/js/player.js` 的 `isWebkit`
- 方案：直接删除；若担心误删，先 grep 确认无引用。

### 3.3 `hookInput` 时序修复
- 文件：`www/js/app.js:833–855`
- 现状：`hookInput` 注册在 `DOMContentLoaded`，但 `DOMContentLoaded` 主处理器先于它跑，搜索框 keypress 绑定可能抢跑。
- 方案：把 `hookInput()` 移到主处理器最前面（紧跟 `initAPICheckboxes` 之前）。

### 3.4 `currentEpisodes` 状态同步
- 文件：`www/js/app.js:1003–1024`
- 现状：`playVideo` 拼 watchUrl 时直接读模块顶部 `currentEpisodes`，可能滞后于详情弹窗里的赋值。
- 方案：
  1. `playVideo` 调用前从 DOM `episodesGrid` 内 button 的 `data-index` 反查；或
  2. 详情弹窗 `currentEpisodes = data.episodes` 后立即 broadcast 一个 `CustomEvent('episodes-updated')`，`playVideo` 监听。

### 3.5 错误处理收敛
- 文件：所有 `js/*.js`
- 方案：抽 `utils/error.js` 暴露 `reportError(err, ctx)`，统一 `console.error + showToast + Sentry-style 上报（如不需要上报可省）`；现有的 5+ 处 `try/catch` 替换为统一调用。

### 3.6 `api.js` 内重复的 fetch-with-timeout 逻辑
- 文件：`www/js/api.js` 全文、`www/js/search.js`
- 方案：抽 `utils/fetch.js` 暴露 `proxiedFetch(url, opts)`，内部统一：
  - 注入 `ProxyAuth` 鉴权参数
  - `AbortController` 超时
  - JSON / 文本响应解析
  - 错误标准化

### 3.7 `password.js` `proxy-auth.js` 可读性
- 文件：`www/js/password.js`、`www/js/proxy-auth.js`
- 方案：函数命名一致性（`isPasswordProtected` / `verifyPassword` / `getAuthToken`）；加 JSDoc。

### 3.8 类型化（可选）
- 方案：若想更稳，可以引入 `// @ts-check` + JSDoc 标注关键函数，不引入 TS 编译链。

---

## 阶段 4 · 体验 / 无障碍细节 🔵

### 4.1 搜索加 debounce + loading 防抖
- 文件：`www/js/app.js:502–506`
- 方案：`keypress` 改为 `input` + 350ms debounce，避免边输入边刷请求。

### 4.2 剧集列表长按复制
- 文件：`www/js/app.js:1095`、`www/js/player.js:858`
- 方案：button 加 `oncontextmenu` 阻止默认 + 调用 `copyLinks()` 复制当前集 URL；移动端用 `touchstart` 长按 600ms。

### 4.3 搜索框 autofocus
- 文件：`www/index.html:209`
- 方案：`<input ... autofocus>`（仅首页）；播放器 / 详情页不抢焦点。

### 4.4 错误重试按钮
- 文件：`www/js/ui.js` `showError`
- 方案：错误 toast 增加「重试」按钮，复用同一个 fetch 上下文。

### 4.5 骨架屏替代 spinner
- 文件：`www/index.html` / `www/css/styles.css`
- 方案：搜索结果区首次加载显示 8 个灰色卡片骨架（CSS-only），真实结果到达后替换。

### 4.6 主题切换
- 文件：`www/css/styles.css` + `www/js/ui.js`
- 方案：新增浅色主题（CSS 变量切换），设置面板里加开关。

### 4.7 ARIA 增强
- 文件：`www/index.html`、`www/player.html`
- 方案：
  - 搜索结果 `<div role="list">` + `<div role="listitem">`；
  - 模态框 `role="dialog"` + `aria-modal="true"` + 打开时焦点 trap；
  - 关闭按钮 `aria-label="关闭"`；
  - 进度条 `role="progressbar"` + `aria-valuenow`。

### 4.8 键盘导航
- 文件：`www/js/app.js`
- 方案：搜索结果列表支持 ↑ ↓ 选中 + Enter 打开详情。

---

## 阶段 5 · `android/` 原生层

### 5.1 `capacitor.config.json` 校验
- 文件：`libretv-app/capacitor.config.json`
- 方案：确认 `webDir` 指向 `www`、允许明文 HTTP 流量（PROXY_URL 是 https，可不动）、`appendUserAgent` 加 LibreTV 标识便于服务端识别。

### 5.2 `android/app/build.gradle` 体积优化
- 文件：`libretv-app/android/app/build.gradle`
- 方案：
  - 开启 `minifyEnabled true` + `shrinkResources true`（release）；
  - `abiFilters` 只保留 `arm64-v8a`（按需保留 armeabi-v7a）；
  - 检查是否启用了 `vectorDrawables.useSupportLibrary`。

### 5.3 `AndroidManifest.xml` 权限收敛
- 文件：`libretv-app/android/app/src/main/AndroidManifest.xml`
- 方案：移除 `android:usesCleartextTraffic="true"`（PROXY_URL 已是 https）；不需要的权限（READ_EXTERNAL_STORAGE 等）去掉。

### 5.4 启动屏 / 图标
- 文件：`libretv-app/android/app/src/main/res/`
- 方案：核对 `ic_launcher`、`splash` 资源是否齐全，避免打包后用默认占位图。

### 5.5 Gradle 缓存迁移脚本验证
- 文件：`libretv-app/setup-gradle-cache.bat`
- 方案：确认脚本幂等可重复执行（已存在但未验证）；README 加一句「二次执行不会清缓存」。

### 5.6 WebView 调试
- 文件：`libretv-app/android/.../MainActivity.java`（或 .kt）
- 方案：release 包默认关闭 `WebView.setWebContentsDebuggingEnabled(true)`；debug 包开启（已有就跳过）。

---

## 阶段 6 · 文档 📚

### 6.1 `README.md` 校准
- 文件：`libretv-app/README.md`
- 改动：
  - 「快速开始」一节加一句「修改 `www/js/config.js` 后必须重新 `npx cap sync`」。
  - 「命令速查」补充 `npm run build:bundle`（阶段 2 引入后）。
  - 顶部加「已知限制」一段，说明 App 内置 PROXY_URL 是公共代理，生产环境建议自部署。

### 6.2 `BUILD_AND_DEBUG.md` 校准
- 文件：`libretv-app/BUILD_AND_DEBUG.md`
- 改动：
  - 「常见问题」加几条：白屏 / tailwind 没加载 / HLS 在 Android 9 以下不工作（已知 hls.js 限制）。
  - 加一段「如何启用 WebView 远程调试」对应 5.6。

### 6.3 `INSTALL_ANDROID_SDK_F.md`
- 改动：版本号校准（当前文档可能引用过时 JDK 17，新 Android Gradle Plugin 已要求 JDK 21）。
- 检查 `setup-android-env.bat` 里的 `JAVA_HOME` 路径。

### 6.4 新增 `OPTIMIZATION_LOG.md`
- 每次执行完一个阶段，记录 diff 文件清单 + 测试要点。

---

## 阶段 7 · 验证清单（每个阶段改完都跑）

| 项 | 工具 / 命令 |
|---|---|
| JS 语法 | `node --check www/js/<file>.js` |
| HTML 合法性 | 浏览器 DevTools Console 无报错 |
| 搜索主路径 | 首页输入「战狼」→ 至少 1 个源返回结果 → 点详情 → 列表渲染 → 点剧集 → 播放 |
| 详情弹窗 | ESC 关闭、点击遮罩关闭、复制链接按钮 |
| 播放器 | 切集 / 暂停保存进度 / 自动连播 / 全屏 / 长按 3 倍速 |
| 豆瓣 | 启用/禁用切换、电影/电视剧切换、换一批 |
| 历史 | 添加 → 关闭再开 → 渲染正常；清空 → 空态 |
| 密码（如启用） | 错误密码提示、正确密码进入、TTL 过期再验证 |
| Android 真机 | debug 包安装 → 启动 → 首页可达 → 搜索可达 → 播放可达 → 退出后无白屏 |

---

## 执行顺序建议

1. **阶段 1**（安全）→ 一次性改完
2. **阶段 2**（性能）→ 改完跑一遍首页 + 搜索主路径
3. **阶段 3**（去重）→ 改完跑全量验证清单
4. **阶段 5**（android）→ 打包一次确认 OK
5. **阶段 4**（体验）→ 分散到 1–3 之后的空闲时段
6. **阶段 6**（文档）→ 全部改完后集中校准

---

## 待确认事项

开工前请确认：

- [ ] `libs/tailwindcss.min.js` 是否允许替换为本地构建产物（预期 ~30KB；如保留 CDN 仅加 `defer` 也可，告诉我即可）
- [ ] 是否接受引入 esbuild/rollup 做 bundle（一次性引入 `devDependencies`）
- [ ] 是否需要新增浅色主题
- [ ] `android/app/build.gradle` 启 minify 后包体减小 ~30%，是否启用
- [ ] 是否要新建 `OPTIMIZATION_LOG.md` 跟踪每次改动

确认后我会按阶段顺序开工，每完成一个阶段汇报 diff 摘要，不会自动 commit。