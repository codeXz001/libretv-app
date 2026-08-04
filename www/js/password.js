// 密码保护功能（Capacitor 适配版）
//
// 角色：普通用户 / 管理员
//   - 普通用户密码 APP_USER_PASSWORD_HASH = sha256('999999')
//   - 管理员密码 APP_ADMIN_PASSWORD_HASH = sha256('147258')
// 部署端可通过 window.__ENV__.PASSWORD / __ENV__.ADMIN_PASSWORD 覆盖任一套。
//
// 即便 sha256.min.js 加载失败（Service Worker 缓存破损场景），仍可通过
// 浏览器内置 crypto.subtle.digest 异步路径完成验证。

// 同步 SHA-256 兜底：js-sha256 库存在时优先使用
// 注意：本文件加载完成后绝不覆盖 window.sha256（见文件末尾），
// 否则下面 sha256() 的回退分支会递归调用被覆盖的异步版本自身，导致栈溢出。
if (typeof window._jsSha256 !== 'function' && typeof window.sha256 === 'function') {
    window._jsSha256 = window.sha256;
}
function sha256Sync(message) {
    let hash = null;
    if (typeof window._jsSha256 === 'function') hash = window._jsSha256(message);
    else if (typeof window.sha256 === 'function') hash = window.sha256(message);
    // 类型校验：只接受 64 位 hex 字符串，防止误收到 Promise 等非哈希值污染内置缓存
    return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

// 异步 SHA-256：Web Crypto 优先，回退到捕获的同步实现
async function sha256(message) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
            return Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { /* fallthrough */ }
    }
    // 回退分支只认脚本加载时捕获的同步实现（_jsSha256），
    // 绝不调用 window.sha256 —— 它可能已被覆盖为异步版本，会导致无限递归。
    if (typeof window._jsSha256 === 'function') return window._jsSha256(message);
    throw new Error('No SHA-256 implementation available.');
}

function getConfiguredPasswordHash(name) {
    const value = window.__ENV__ && window.__ENV__[name];
    return typeof value === 'string' && value.length === 64 && !/^0+$/.test(value)
        ? value
        : '';
}

// 内置密码哈希缓存：脚本加载时同步算（若 js-sha256 可用），并启动异步保险计算
const __builtinHashes = { user: '', admin: '', asyncReady: false };
function computeBuiltinHashesSync() {
    const cfg = window.ACCESS_PASSWORD_CONFIG;
    if (!cfg) return;
    if (cfg.builtinUserPassword && !__builtinHashes.user) {
        __builtinHashes.user = sha256Sync(cfg.builtinUserPassword) || '';
    }
    if (cfg.builtinAdminPassword && !__builtinHashes.admin) {
        __builtinHashes.admin = sha256Sync(cfg.builtinAdminPassword) || '';
    }
}
computeBuiltinHashesSync();
(async () => {
    const cfg = window.ACCESS_PASSWORD_CONFIG;
    if (!cfg) return;
    if (cfg.builtinUserPassword && !__builtinHashes.user) {
        try { __builtinHashes.user = await sha256(cfg.builtinUserPassword); } catch (e) {}
    }
    if (cfg.builtinAdminPassword && !__builtinHashes.admin) {
        try { __builtinHashes.admin = await sha256(cfg.builtinAdminPassword); } catch (e) {}
    }
    __builtinHashes.asyncReady = true;
})();

function getBuiltinPasswordHashes() {
    // 优先使用预计算常量（sha256-fallback.js 与 Web Crypto 都不可用时的最后防线），
    // 其次使用脚本加载时同步/异步计算好的缓存值。
    const cfg = window.ACCESS_PASSWORD_CONFIG;
    const user = (cfg && cfg.userHash) || __builtinHashes.user || '';
    const admin = (cfg && cfg.adminHash) || __builtinHashes.admin || '';
    return { user, admin };
}

// 兼容旧版 APP_PASSWORD_HASH（= 用户哈希）
if (typeof window.APP_PASSWORD_HASH === 'string' && window.APP_PASSWORD_HASH.length === 64
    && !/^0+$/.test(window.APP_PASSWORD_HASH) && !__builtinHashes.user) {
    __builtinHashes.user = window.APP_PASSWORD_HASH;
}

/**
 * 获取当前生效的密码哈希条目数组 [{ role, hash }, ...]
 * 优先级：环境变量 > 内置
 */
function getEffectivePasswordEntries() {
    const entries = [];
    const envUser = getConfiguredPasswordHash('PASSWORD');
    const envAdmin = getConfiguredPasswordHash('ADMIN_PASSWORD');
    const builtin = getBuiltinPasswordHashes();
    const userHash = envUser || builtin.user;
    const adminHash = envAdmin || builtin.admin;
    if (userHash) entries.push({ role: 'user', hash: userHash });
    if (adminHash && adminHash !== userHash) {
        entries.push({ role: 'admin', hash: adminHash });
    }
    return entries;
}

// 兼容旧调用：返回用户密码哈希（保持向后兼容）
function getEffectivePasswordHash() {
    const entries = getEffectivePasswordEntries();
    const userEntry = entries.find(e => e.role === 'user');
    return userEntry ? userEntry.hash : '';
}

/**
 * 检查是否设置了密码保护（任一密码存在即视为已启用）
 */
function isPasswordProtected() {
    return getEffectivePasswordEntries().length > 0;
}

function isPasswordRequired() {
    return false;
}

function ensurePasswordProtection() {
    if (isPasswordRequired()) {
        showPasswordModal();
        throw new Error('Password protection is required');
    }
    if (isPasswordProtected() && !isPasswordVerified()) {
        showPasswordModal();
        throw new Error('Password verification required');
    }
    return true;
}

/**
 * 读取已保存的验证状态（兼容旧版 {passwordHash} 与新版 {role, passwordHash}）
 */
function readVerificationState() {
    try {
        const raw = localStorage.getItem(PASSWORD_CONFIG.localStorageKey);
        if (!raw) return null;
        const state = JSON.parse(raw);
        return state && typeof state === 'object' ? state : null;
    } catch (error) {
        console.warn('读取密码验证状态失败:', error);
        return null;
    }
}

/**
 * 判断当前浏览器是否已经通过有效密码验证
 */
function isPasswordVerified() {
    try {
        if (!isPasswordProtected()) return true;
        const stored = readVerificationState();
        if (!stored || stored.verified !== true || !stored.timestamp || !stored.passwordHash) return false;
        const current = getEffectivePasswordEntries().find(entry => entry.hash === stored.passwordHash);
        return !!current && Date.now() - stored.timestamp < PASSWORD_CONFIG.verificationTTL;
    } catch (error) {
        console.error('检查密码验证状态时出错:', error);
        return false;
    }
}

/**
 * 获取当前访问模式：user / admin；未验证时返回 null
 */
function getAccessMode() {
    if (!isPasswordProtected()) return 'user';
    if (!isPasswordVerified()) return null;
    const stored = readVerificationState();
    const entry = getEffectivePasswordEntries().find(item => item.hash === stored?.passwordHash);
    return entry ? entry.role : 'user';
}

function isAdminMode() {
    return getAccessMode() === 'admin';
}

/**
 * 验证用户输入的密码（异步），命中后返回角色信息
 */
async function verifyPassword(password) {
    // 等待异步预计算完成（首次调用时只跑一次；带超时兜底，避免任何环境下手动阻塞）
    if (!__builtinHashes.asyncReady) {
        await new Promise(resolve => {
            const timer = setTimeout(resolve, 1500);
            const check = () => {
                if (__builtinHashes.asyncReady) { clearTimeout(timer); resolve(); }
                else setTimeout(check, 10);
            };
            check();
        });
    }
    try {
        const entries = getEffectivePasswordEntries();
        if (!entries.length) return false;

        const inputHash = await sha256(password);
        const matched = entries.find(entry => entry.hash === inputHash);
        if (!matched) return false;

        localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify({
            verified: true,
            timestamp: Date.now(),
            passwordHash: matched.hash,
            role: matched.role
        }));
        localStorage.setItem('accessMode', matched.role);
        localStorage.removeItem('proxyAuthHash');
        return true;
    } catch (error) {
        console.error('验证密码时出错:', error);
        return false;
    }
}

window.isPasswordProtected = isPasswordProtected;
window.isPasswordRequired = isPasswordRequired;
window.isPasswordVerified = isPasswordVerified;
window.getAccessMode = getAccessMode;
window.isAdminMode = isAdminMode;
window.getEffectivePasswordEntries = getEffectivePasswordEntries;
window.verifyPassword = verifyPassword;
window.ensurePasswordProtection = ensurePasswordProtection;
// 注意：不覆盖 window.sha256（保留 js-sha256 同步版本，供 sha256() 回退分支与
// 其他依赖同步哈希的代码使用）；异步版本以独立名称导出，避免递归自调用。
window.sha256Async = sha256;

function showPasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    if (passwordModal) {
        const doubanArea = document.getElementById('doubanArea');
        if (doubanArea) doubanArea.classList.add('hidden');
        const cancelButton = document.getElementById('passwordCancelBtn');
        if (cancelButton) cancelButton.classList.add('hidden');

        const title = passwordModal.querySelector('h2');
        const description = passwordModal.querySelector('p');
        const form = passwordModal.querySelector('form');
        const errorMsg = document.getElementById('passwordError');

        if (isPasswordRequired()) {
            if (title) title.textContent = '需要设置密码';
            if (description) description.textContent = '请先在部署平台设置 PASSWORD 环境变量来保护您的实例';
            if (form) form.style.display = 'none';
            if (errorMsg) {
                errorMsg.textContent = '为确保安全，必须设置密码环境变量才能使用本服务，请联系管理员进行配置';
                errorMsg.classList.remove('hidden');
                errorMsg.className = 'text-red-500 mt-2 font-medium';
            }
        } else {
            if (title) title.textContent = '访问验证';
            if (description) description.textContent = '请输入密码继续访问';
            if (form) form.style.display = 'block';
            if (errorMsg) {
                errorMsg.textContent = '密码错误，请重试';
                errorMsg.className = 'text-red-500 mt-2 hidden';
            }
        }

        passwordModal.style.display = 'flex';

        if (!isPasswordRequired()) {
            setTimeout(() => {
                const passwordInput = document.getElementById('passwordInput');
                if (passwordInput) passwordInput.focus();
            }, 100);
        }
    }
}

function hidePasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    if (passwordModal) {
        hidePasswordError();
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) passwordInput.value = '';
        passwordModal.style.display = 'none';

        if (localStorage.getItem('doubanEnabled') === 'true') {
            const doubanArea = document.getElementById('doubanArea');
            if (doubanArea) doubanArea.classList.remove('hidden');
            if (typeof initDouban === 'function') initDouban();
        }
    }
}

function showPasswordError() {
    const errorElement = document.getElementById('passwordError');
    if (errorElement) errorElement.classList.remove('hidden');
}

function hidePasswordError() {
    const errorElement = document.getElementById('passwordError');
    if (errorElement) errorElement.classList.add('hidden');
}

async function handlePasswordSubmit() {
    const passwordInput = document.getElementById('passwordInput');
    const password = passwordInput ? passwordInput.value.trim() : '';
    if (await verifyPassword(password)) {
        const role = getAccessMode();
        hidePasswordModal();
        document.dispatchEvent(new CustomEvent('passwordVerified', { detail: { role } }));
    } else {
        showPasswordError();
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
}

function initPasswordProtection() {
    if (isPasswordRequired()) {
        showPasswordModal();
        return;
    }
    if (isPasswordProtected() && !isPasswordVerified()) {
        showPasswordModal();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initPasswordProtection();
});