// 验证「切换默认源 → 首页刷新」修复的核心状态机逻辑(模拟浏览器环境)
// 从 home.js / app.js 修改点提取的等价逻辑,验证四个关键场景。
// 运行:node scripts/verify-home-reload.mjs

// ---------- 模拟 home.js 修改点 ----------
const calls = []; // 记录函数调用顺序
const document = { bodyView: 'view-home' }; // 模拟 document.body.dataset.view
let homeReloadPending = false;
let homeInitDone = false;
let homeReqSeq = 0;

function invalidateHomeCache() { homeReqSeq++; calls.push('invalidate'); }
function loadCategory() {
    // 等价真实 loadCategory:入口消费待重载标记(清缓存),再执行加载
    if (homeReloadPending) {
        homeReloadPending = false;
        invalidateHomeCache();
    }
    calls.push('loadCategory');
}

function loadCategoryEntry() { // 等价于 loadCategory 中消费 pending 的片段
    const seq = ++homeReqSeq;
    if (homeReloadPending) {
        homeReloadPending = false;
        invalidateHomeCache();
    }
    return seq;
}
function markHomeReload(view, initDone) {
    if (view === 'view-home' && initDone) {
        calls.push('mark:立即重载');
        loadCategory();
    } else {
        calls.push('mark:标记待重载');
        homeReloadPending = true;
    }
}
function switchView(viewId) {
    if (viewId === 'view-home') {
        if (homeReloadPending) { calls.push('switchView:待重载→强制重载'); loadCategory(); }
    }
}

// ---------- 模拟 app.js 修改点 ----------
let defaultSourceId = 'srcA';
function setDefaultSourceId(value) {
    const changed = value !== defaultSourceId;
    defaultSourceId = value;
    if (changed) {
        invalidateHomeCache();
        markHomeReload(document.bodyView, homeInitDone);
    }
}

// ---------- 测试用例 ----------
let pass = 0, fail = 0;
function assert(name, cond) {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗ 失败:', name, '| 调用序列:', calls.join(' → ')); }
}

// 场景1:用户在首页,切换默认源 → 应立即重载(缓存失效 + loadCategory)
console.log('[场景1] 停留首页时切换默认源');
calls.length = 0;
document.bodyView = 'view-home'; homeInitDone = true;
setDefaultSourceId('srcB');
assert('切换后立即触发 loadCategory', calls.includes('loadCategory'));
assert('调用顺序为 缓存失效→重载', calls.indexOf('invalidate') < calls.indexOf('loadCategory'));
assert('未遗留待重载标记(已立即消费)', homeReloadPending === false);

// 场景2:用户在源配置页,切换默认源 → 只标记待重载,不立即打扰;切回首页时强制重载
console.log('[场景2] 停留在源配置页切换默认源,再切回首页');
calls.length = 0;
document.bodyView = 'view-sources'; homeInitDone = true;
setDefaultSourceId('srcC');
assert('未立即重载', !calls.includes('loadCategory'));
assert('已标记待重载', homeReloadPending === true);
switchView('view-home');
assert('切回首页时强制重载并消费标记', calls.some(c => c.includes('switchView')) && homeReloadPending === false);

// 场景3:初始化阶段(未完成首页初始化)发生默认源调整 → 不得重载,避免与首屏加载竞态
console.log('[场景3] 初始化阶段的默认源调整(如降级)');
calls.length = 0;
document.bodyView = 'view-home'; homeInitDone = false;
setDefaultSourceId('srcD');
assert('初始化阶段不触发立即重载', !calls.includes('loadCategory'));
assert('初始化阶段的标记在首次 loadCategory 时被消费(不双重加载)', homeReloadPending === true);
calls.length = 0;
loadCategoryEntry(); // 模拟 initHomePage 的首次 loadCategory
assert('首次加载消费标记且仅一次缓存失效', calls.filter(c => c === 'invalidate').length === 1 && homeReloadPending === false);

// 场景4:重复选择同一默认源 → 不触发任何重载(change 不重复刷新)
console.log('[场景4] 选择与当前相同的默认源');
calls.length = 0;
document.bodyView = 'view-home'; homeInitDone = true;
const before = defaultSourceId;
setDefaultSourceId(before);
assert('同值不触发重载', calls.length === 0);

// 场景5:搜索模式切换(setSearchMode 等价的失效+标记)后切回首页 → 强制重载
console.log('[场景5] 搜索模式切换');
calls.length = 0;
document.bodyView = 'view-sources'; homeInitDone = true;
invalidHomePattern(); // 等价 setSearchMode: 失效 + markHomeReload
assert('模式切换后待重载标记生效', homeReloadPending === true);
switchView('view-home');
assert('切回首页强制重载', calls.filter(c => c === 'loadCategory').length === 1);

function invalidHomePattern() { invalidateHomeCache(); markHomeReload(document.bodyView, homeInitDone); }

console.log('\n结果:', pass, '通过,', fail, '失败');
process.exit(fail ? 1 : 0);
