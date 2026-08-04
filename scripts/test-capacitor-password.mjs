// 模拟 zztv-5ms.pages.dev 部署场景：Capacitor www 中的 password.js + app-config.js
// 验证 999999 / 147258 都能登录并正确返回角色。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wwwRoot = join(root, 'www');

function createStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

function loadCapacitorRuntime() {
  // 完全模拟 www/ 页面：sha256.min.js → sha256-fallback.js → app-config.js → config.js → password.js
  const sha256Lib = fs.readFileSync(join(wwwRoot, 'libs/sha256.min.js'), 'utf8');
  const fallbackLib = fs.readFileSync(join(wwwRoot, 'js/sha256-fallback.js'), 'utf8');
  const appConfig = fs.readFileSync(join(wwwRoot, 'js/app-config.js'), 'utf8');
  const config = fs.readFileSync(join(wwwRoot, 'js/config.js'), 'utf8');
  const psw = fs.readFileSync(join(wwwRoot, 'js/password.js'), 'utf8');

  const storage = createStorage();
  const sandbox = {
    window: {},
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return {}; },
      head: { appendChild() {} },
    },
    console,
    crypto: webcrypto,
    localStorage: storage,
    Date,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
  };
  sandbox.window.crypto = webcrypto;
  sandbox.window.TextEncoder = TextEncoder;
  sandbox.window.TextDecoder = TextDecoder;
  sandbox.window.__ENV__ = { PASSWORD: '', ADMIN_PASSWORD: '' };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(sha256Lib, ctx, { filename: 'libs/sha256.min.js' });
  vm.runInContext(fallbackLib, ctx, { filename: 'js/sha256-fallback.js' });
  vm.runInContext(appConfig, ctx, { filename: 'js/app-config.js' });
  vm.runInContext(config, ctx, { filename: 'js/config.js' });
  vm.runInContext(psw, ctx, { filename: 'js/password.js' });
  sandbox.storage = storage;
  return sandbox;
}

// 模拟"双坏"场景：libs/sha256.min.js 加载失败（SW 缓存破损）+ Web Crypto 不可用，
// 仅剩 js/sha256-fallback.js 提供同步哈希 —— 两个内置密码仍必须能登录。
function loadDoubleMissingRuntime() {
  const fallbackLib = fs.readFileSync(join(wwwRoot, 'js/sha256-fallback.js'), 'utf8');
  const appConfig = fs.readFileSync(join(wwwRoot, 'js/app-config.js'), 'utf8');
  const config = fs.readFileSync(join(wwwRoot, 'js/config.js'), 'utf8');
  const psw = fs.readFileSync(join(wwwRoot, 'js/password.js'), 'utf8');

  const storage = createStorage();
  const sandbox = {
    window: {},
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return {}; },
      head: { appendChild() {} },
    },
    console,
    // crypto 完全不可用（WebView 异常 / 旧版环境）
    localStorage: storage,
    Date,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
  };
  sandbox.window.TextEncoder = TextEncoder;
  sandbox.window.TextDecoder = TextDecoder;
  sandbox.window.__ENV__ = { PASSWORD: '', ADMIN_PASSWORD: '' };

  const ctx = vm.createContext(sandbox);
  // 故意跳过 libs/sha256.min.js，且 window.crypto 未定义
  vm.runInContext(fallbackLib, ctx, { filename: 'js/sha256-fallback.js' });
  vm.runInContext(appConfig, ctx, { filename: 'js/app-config.js' });
  vm.runInContext(config, ctx, { filename: 'js/config.js' });
  vm.runInContext(psw, ctx, { filename: 'js/password.js' });
  sandbox.storage = storage;
  return sandbox;
}

test('Capacitor www: 999999 / 147258 都通过, 角色正确', async () => {
  const sb = loadCapacitorRuntime();
  const win = sb.window;
  const storage = sb.storage;
  assert.equal(win.ACCESS_PASSWORD_CONFIG.builtinUserPassword, '999999');
  assert.equal(win.ACCESS_PASSWORD_CONFIG.builtinAdminPassword, '147258');

  // entries 同步预算应当立即可用（sha256.min.js 已加载）
  const entries = win.getEffectivePasswordEntries();
  assert.equal(entries.length, 2);

  const clearStorage = () => {
    storage.removeItem('passwordVerified');
    storage.removeItem('accessMode');
  };
  clearStorage();

  assert.equal(await win.verifyPassword('999999'), true);
  assert.equal(win.getAccessMode(), 'user');
  assert.equal(win.isAdminMode(), false);

  // 清空再测管理员
  clearStorage();
  assert.equal(await win.verifyPassword('147258'), true);
  assert.equal(win.getAccessMode(), 'admin');
  assert.equal(win.isAdminMode(), true);

  clearStorage();
  assert.equal(await win.verifyPassword('wrong'), false);
  assert.equal(win.getAccessMode(), null);
});

test('双坏场景: sha256.min.js 加载失败 + Web Crypto 不可用, 仅 fallback 兜底仍能登录', async () => {
  const sb = loadDoubleMissingRuntime();
  const win = sb.window;
  const storage = sb.storage;
  assert.equal(typeof win.sha256, 'function', 'fallback 应提供同步 sha256');

  // 预计算常量兜底：条目应立即可用
  const entries = win.getEffectivePasswordEntries();
  assert.equal(entries.length, 2);

  const clearStorage = () => {
    storage.removeItem('passwordVerified');
    storage.removeItem('accessMode');
  };
  clearStorage();

  // 用户密码
  assert.equal(await win.verifyPassword('999999'), true);
  assert.equal(win.getAccessMode(), 'user');

  // 管理员密码
  clearStorage();
  assert.equal(await win.verifyPassword('147258'), true);
  assert.equal(win.getAccessMode(), 'admin');

  // 错误密码仍被拒绝
  clearStorage();
  assert.equal(await win.verifyPassword('123456'), false);
  assert.equal(win.getAccessMode(), null);
});