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
    // js/ 逐个复制并排除
    const { readdirSync } = await import('fs');
    mkdirSync(dstDir, { recursive: true });
    for (const name of readdirSync(srcDir)) {
      if (EXCLUDE_JS.includes(name)) continue;
      cpSync(join(srcDir, name), join(dstDir, name));
      copied.push(`js/${name}`);
    }
  } else {
    cpSync(srcDir, dstDir, { recursive: true });
    const { readdirSync } = await import('fs');
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

    // 2b. PASSWORD 占位 → 空（App 无服务端注入）
    html = html.replace(/window\.__ENV__\.PASSWORD\s*=\s*"[^"]*";/, 'window.__ENV__.PASSWORD = "";  // App 内无服务端注入，走无密码模式');

    // 2c. 移除 PWA 注册引用
    html = html.replace(/<script src="js\/pwa-register\.js"[^>]*><\/script>\s*\n?/g, '');

    // 2d. 注入 App 特有脚本引用（若缺失）：
    //     app-config.js（内置密码哈希，须在 config.js 之前）+ app-native.js（返回键/分享）
    if (!html.includes('js/app-config.js')) {
      html = html.replace(
        '<script src="js/config.js">',
        '<script src="js/app-config.js"></script>\n    <script src="js/config.js">'
      );
    }
    if (!html.includes('js/app-native.js')) {
      html = html.replace(
        '<script src="js/config.js">',
        '<script src="js/app-native.js"></script>\n    <script src="js/config.js">'
      );
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

// ---------- 4. 报告 ----------
console.log(`\n同步完成，共 ${copied.length} 个文件 -> ${DST}`);
console.log('下一步：npx cap sync 更新 Android 内置资源，然后 npx cap open android 构建。');
