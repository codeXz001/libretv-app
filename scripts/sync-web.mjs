// scripts/sync-web.mjs —— 把 LibreTV（F:\app\my\LibreTV）最新 Web 层同步到本 App 的 www/，并自动做 Capacitor 适配
//
// 用法：node scripts/sync-web.mjs
// 同步后如需更新 Android 内置资源，再执行：npx cap sync
//
// 自动适配项：
//   1. index.html / player.html：
//      - viewport 增加 viewport-fit=cover & user-scalable=no（全面屏安全区 + App 内禁缩放）
//      - window.__ENV__.PASSWORD = "{{PASSWORD}}" → ""（App 无服务端注入，走内置 APP_PASSWORD_HASH）
//      - 移除 pwa-register.js 引用（App 内无需 PWA 注册）
//      - 注入 app-config.js（内置密码哈希）与 app-native.js（返回键/分享）引用（若缺失）
//   2. js/config.js：PROXY_URL 由相对 '/proxy/' 改为公网后端绝对地址
//   3. 排除 js/password.js、js/proxy-auth.js（App 适配版：已含 APP_PASSWORD_HASH 逻辑，勿覆盖）
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'F:\\app\\my\\LibreTV';
const DST = join(ROOT, 'www');

// 部署好的 LibreTV 后端公网地址（代理统一走这里）
const APP_PROXY_URL = 'https://zztv-5ms.pages.dev/proxy/';

// 需要同步的目录清单（相对路径）
const DIRS = ['js', 'css', 'libs', 'image'];
// 根目录文件清单
const FILES = ['index.html', 'player.html', 'watch.html', 'about.html', 'manifest.json', 'robots.txt'];
// js/ 下排除的文件（App 内不需要 或 已做 App 适配勿覆盖）
const EXCLUDE_JS = ['pwa-register.js', 'password.js', 'proxy-auth.js'];

function read(p) { return readFileSync(p, 'utf8'); }
function write(p, content) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content, 'utf8'); }

// ---------- 1. 复制目录 ----------
const copied = [];
for (const dir of DIRS) {
  const srcDir = join(SRC, dir);
  const dstDir = join(DST, dir);
  if (!existsSync(srcDir)) { console.warn(`[跳过] 源目录不存在: ${srcDir}`); continue; }
  if (dir === 'js') {
    // js/ 逐个复制并排除（recursive 必须带上：源目录若含子目录，不带会抛 ERR_FS_EISDIR）
    mkdirSync(dstDir, { recursive: true });
    for (const name of readdirSync(srcDir)) {
      if (EXCLUDE_JS.includes(name)) continue;
      cpSync(join(srcDir, name), join(dstDir, name), { recursive: true });
      copied.push(`js/${name}`);
    }
  } else {
    cpSync(srcDir, dstDir, { recursive: true });
    for (const name of readdirSync(srcDir)) copied.push(`${dir}/${name}`);
  }
}

// ---------- 2. 复制根文件 ----------
for (const f of FILES) {
  const src = join(SRC, f);
  if (!existsSync(src)) { console.warn(`[跳过] 源文件不存在: ${src}`); continue; }
  if (f.endsWith('.html')) {
    // 需要 App 适配替换
    let html = read(src);

    // 2a. viewport 适配
    html = html.replace(
      /<meta name="viewport" content="[^"]*">/,
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">'
    );

    // 2b. PASSWORD/ADMIN_PASSWORD 占位 → 空（App 无服务端注入，密码由 app-config.js 提供）
    html = html.replace(/window\.__ENV__\.PASSWORD\s*=\s*"[^"]*";/, 'window.__ENV__.PASSWORD = "";  // App 内无服务端注入，走 app-config.js');
    html = html.replace(/window\.__ENV__\.ADMIN_PASSWORD\s*=\s*"[^"]*";/, 'window.__ENV__.ADMIN_PASSWORD = "";  // App 内无服务端注入');

    // 2c. 移除 PWA 注册引用
    html = html.replace(/<script src="js\/pwa-register\.js"[^>]*><\/script>\s*\n?/g, '');

    // 2d. 注入 App 特有脚本引用（若缺失）：
    //     app-config.js（内置密码哈希，须在 config.js 之前）+ app-native.js（返回键/分享）
    if (!html.includes('js/app-config.js')) {
      html = html.replace(
        /<script src="js\/config\.js"([^>]*)>/,
        '<script src="js/app-config.js" defer></script>\n    <script src="js/config.js"$1>'
      );
    }
    if (!html.includes('js/app-native.js')) {
      html = html.replace(
        /<script src="js\/config\.js"([^>]*)>/,
        '<script src="js/app-native.js" defer></script>\n    <script src="js/config.js"$1>'
      );
    }

    // 2e. player.html：注入「分享」按钮（App 内走系统分享面板，Web 降级复制链接）
    //     锚点用「锁定控制按钮」注释，插在它前面；已存在则跳过（幂等）
    if (f === 'player.html' && !html.includes('shareVideo()')) {
      const shareBtn =
        '                    <!-- 分享按钮（App 内系统分享面板 / Web 降级复制链接） -->\n' +
        '                    <button title="分享" onclick="shareVideo()" class="px-2 py-1 bg-[#222] hover:bg-[#333] border border-[#333] text-white rounded-lg transition">\n' +
        '                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">\n' +
        '                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0a3 3 0 11-5.367 2.684" />\n' +
        '                        </svg>\n' +
        '                    </button>\n\n';
      const anchor = '                    <!-- 锁定控制按钮';
      if (html.includes(anchor)) {
        html = html.replace(anchor, shareBtn + anchor);
        console.log('[适配] player.html 已注入分享按钮');
      } else {
        console.warn('[警告] player.html 未找到分享按钮锚点（锁定控制按钮），本次未注入');
      }
    }

    write(join(DST, f), html);
    copied.push(`${f} (适配)`);
  } else {
    cpSync(src, join(DST, f));
    copied.push(f);
  }
}

// ---------- 3. config.js：PROXY_URL 改公网绝对地址 ----------
const cfgPath = join(DST, 'js', 'config.js');
if (existsSync(cfgPath)) {
  let cfg = read(cfgPath);
  cfg = cfg.replace(
    /const PROXY_URL\s*=\s*['"][^'"]*['"]/,
    `const PROXY_URL = '${APP_PROXY_URL}'; // Capacitor 打包版：指向部署好的 LibreTV 后端`
  );
  write(cfgPath, cfg);
  console.log('[适配] js/config.js PROXY_URL -> ' + APP_PROXY_URL);
}

// ---------- 4. 自检：适配项若静默失败，App 会白屏/丢功能，必须显式报错 ----------
const problems = [];
function check(file, cond, msg) { if (!cond) problems.push(`${file}: ${msg}`); }

for (const f of ['index.html', 'player.html']) {
  const p = join(DST, f);
  if (!existsSync(p)) { problems.push(`${f}: 文件不存在`); continue; }
  const h = read(p);
  check(f, h.includes('js/app-config.js'), '缺少 app-config.js 引用（内置密码将失效）');
  check(f, h.includes('js/app-native.js'), '缺少 app-native.js 引用（返回键/分享将失效）');
  check(f, !h.includes('js/pwa-register.js'), '仍残留 pwa-register.js 引用');
  check(f, !h.includes('{{PASSWORD}}'), '仍残留 {{PASSWORD}} 占位符');
  check(f, !h.includes('{{ADMIN_PASSWORD}}'), '仍残留 {{ADMIN_PASSWORD}} 占位符');
  check(f, h.includes('viewport-fit=cover'), 'viewport 未适配全面屏');
}
const playerHtml = existsSync(join(DST, 'player.html')) ? read(join(DST, 'player.html')) : '';
check('player.html', playerHtml.includes('shareVideo()'), '缺少分享按钮');

const cfgFinal = existsSync(cfgPath) ? read(cfgPath) : '';
check('js/config.js', cfgFinal.includes(APP_PROXY_URL), `PROXY_URL 未改为 ${APP_PROXY_URL}`);

for (const f of ['app-config.js', 'app-native.js', 'password.js', 'proxy-auth.js']) {
  check('js/' + f, existsSync(join(DST, 'js', f)), 'App 适配文件丢失');
}

// ---------- 5. 报告 ----------
console.log(`\n同步完成，共 ${copied.length} 个文件 -> ${DST}`);
if (problems.length) {
  console.error('\n[自检未通过] 以下适配项有问题，请勿直接打包：');
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('[自检通过] App 适配项齐全（内置密码 / 原生增强 / 分享按钮 / 代理地址 / 全面屏）');
  console.log('下一步：npx cap sync 更新 Android 内置资源，然后重新构建。');
}
