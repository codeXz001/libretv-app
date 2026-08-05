// 验证本次性能优化的核心逻辑(从实际代码提取的等价状态机)
// 覆盖:详情缓存 TTL/FIFO/并发去重、搜索 outerSignal 取消、refillPool 防重入、persist 去抖
// 运行:node scripts/verify-perf-opt.mjs

// ---------- 模拟环境 ----------
const store = new Map(); // localStorage 模拟
const localStorageMock = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] || null,
    get length() { return store.size; },
};
let now = 0; // 可控时间
const realDateNow = Date.now;
Date.now = () => now;

// ---------- 等价实现:api.js 详情缓存层 ----------
const DETAIL_CACHE_TTL = 30 * 60 * 1000;
const DETAIL_PERSIST_MAX = 40;
const DETAIL_PERSIST_PREFIX = 'detailCache_v1:';
const DETAIL_PERSIST_MAX_BYTES = 60 * 1024;
const detailMemCache = new Map();
const detailPendingMap = new Map();
const getDetailCacheKey = (id, sc) => DETAIL_PERSIST_PREFIX + sc + ':' + id;

function getCachedDetailData(id, sourceCode) {
    const key = getDetailCacheKey(id, sourceCode);
    const mem = detailMemCache.get(key);
    if (mem && Date.now() - mem.ts < DETAIL_CACHE_TTL) return mem.data;
    if (mem) detailMemCache.delete(key);
    try {
        const raw = localStorageMock.getItem(key);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached || !cached.ts || Date.now() - cached.ts >= DETAIL_CACHE_TTL || !cached.data) {
            localStorageMock.removeItem(key);
            return null;
        }
        detailMemCache.set(key, { ts: cached.ts, data: cached.data });
        return cached.data;
    } catch { return null; }
}

function setCachedDetailData(id, sourceCode, data) {
    const key = getDetailCacheKey(id, sourceCode);
    detailMemCache.set(key, { ts: Date.now(), data });
    try {
        const payload = JSON.stringify({ ts: Date.now(), data });
        if (payload.length > DETAIL_PERSIST_MAX_BYTES) return;
        localStorageMock.setItem(key, payload);
        const prefixKeys = [];
        for (let i = 0; i < localStorageMock.length; i++) {
            const k = localStorageMock.key(i);
            if (k && k.startsWith(DETAIL_PERSIST_PREFIX)) prefixKeys.push(k);
        }
        if (prefixKeys.length > DETAIL_PERSIST_MAX) {
            const withTs = prefixKeys.map(k => {
                try { return { k, ts: JSON.parse(localStorageMock.getItem(k) || '{}').ts || 0 }; }
                catch { return { k, ts: 0 }; }
            });
            withTs.sort((a, b) => a.ts - b.ts);
            withTs.slice(0, withTs.length - DETAIL_PERSIST_MAX)
                .forEach(({ k }) => localStorageMock.removeItem(k));
        }
    } catch (e) { console.warn('[详情缓存] 持久化失败:', e.message); }
}

let fetchCount = 0; // 上游请求计数
async function fetchDetailDataShared(id, sourceCode) {
    if (!id || !sourceCode) return null;
    const cached = getCachedDetailData(id, sourceCode);
    if (cached) return cached;
    const key = getDetailCacheKey(id, sourceCode);
    if (detailPendingMap.has(key)) return detailPendingMap.get(key);
    const promise = (async () => {
        fetchCount++;
        await new Promise(r => setTimeout(r, 10)); // 模拟网络
        const data = { code: 200, episodes: ['https://a.m3u8'], vod_name: '测试' };
        setCachedDetailData(id, sourceCode, data);
        return data;
    })();
    detailPendingMap.set(key, promise);
    try { return await promise; } finally { detailPendingMap.delete(key); }
}

// ---------- 等价实现:search outerSignal ----------
function searchByAPIAndKeyWordWithSignal(apiId, query, outerSignal) {
    return new Promise((resolve) => {
        let aborted = false;
        const controller = { abort: () => { aborted = true; } };
        if (outerSignal) {
            if (outerSignal.aborted) controller.abort();
            else outerSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        setTimeout(() => {
            resolve(aborted ? 'ABORTED' : apiId + ':results');
        }, 20);
    });
}
const fakeEventTarget = () => {
    const listeners = {}; // 支持多个监听器(真实 AbortSignal 语义)
    return {
        aborted: false,
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        abort() { this.aborted = true; (listeners.abort || []).forEach(fn => fn()); },
    };
};

// ---------- 等价实现:refillPool 防重入 + persist 去抖 ----------
function makePool() {
    return { items: [], refilling: false };
}
let persistWriteCount = 0;
let persistTimer = null;
let persistSig = '';
function schedulePersistHomePool(pool) {
    const sig = pool.items.length;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        if (sig === persistSig) return;
        persistSig = sig;
        persistWriteCount++;
    }, 1000);
}
async function refillPool(pool) {
    if (pool.refilling) return false; // 防重入:直接跳过
    pool.refilling = true;
    try {
        await new Promise(r => setTimeout(r, 5));
        pool.items.push('item');
        schedulePersistHomePool(pool);
        return true;
    } finally { pool.refilling = false; }
}

// ---------- 测试用例 ----------
let pass = 0, fail = 0;
function assert(name, cond) {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗ 失败:', name); }
}

console.log('[T1] 详情缓存:命中 0 请求 + 并发去重');
async function t1() {
    now = 1000;
    fetchCount = 0;
    await fetchDetailDataShared('v1', 'srcA'); // 第一次:发请求
    assert('首次请求计数为 1', fetchCount === 1);
    await fetchDetailDataShared('v1', 'srcA'); // 缓存命中:0 请求
    assert('缓存命中 0 请求', fetchCount === 1);

    // 并发去重:同 key 同时两个调用只发一次
    fetchCount = 0;
    const [r1, r2] = await Promise.all([
        fetchDetailDataShared('v2', 'srcB'),
        fetchDetailDataShared('v2', 'srcB'),
    ]);
    assert('并发同 key 只发一次请求', fetchCount === 1);
    assert('两个调用都拿到数据', r1 && r2 && r1.code === 200);
}

console.log('[T2] 详情缓存:TTL 过期 + FIFO 淘汰 + 大对象不落盘');
async function t2() {
    // TTL 过期
    now = 1000;
    await fetchDetailDataShared('v3', 'srcC');
    now = 1000 + 31 * 60 * 1000; // 31 分钟后
    fetchCount = 0;
    await fetchDetailDataShared('v3', 'srcC');
    assert('TTL 过期后重新请求', fetchCount === 1);

    // FIFO 淘汰:写入超过上限,最旧的被删
    now = 2000;
    for (let i = 0; i < DETAIL_PERSIST_MAX + 5; i++) {
        fetchCount = 0;
        await fetchDetailDataShared('f' + i, 'srcF');
    }
    let persistKeys = 0;
    for (let i = 0; i < localStorageMock.length; i++) {
        const k = localStorageMock.key(i);
        if (k && k.startsWith(DETAIL_PERSIST_PREFIX)) persistKeys++;
    }
    assert('持久缓存不超过上限(' + DETAIL_PERSIST_MAX + '),实际 ' + persistKeys, persistKeys <= DETAIL_PERSIST_MAX);
    assert('最旧条目(f0)已被淘汰', localStorageMock.getItem(getDetailCacheKey('f0', 'srcF')) === null);

    // 大对象只写内存
    const bigData = { code: 200, episodes: [], vod_name: 'x'.repeat(DETAIL_PERSIST_MAX_BYTES) };
    setCachedDetailData('big', 'srcB', bigData);
    assert('大对象不落盘(仅内存)', localStorageMock.getItem(getDetailCacheKey('big', 'srcB')) === null);
    assert('大对象内存可命中', getCachedDetailData('big', 'srcB') === bigData);
}

console.log('[T3] 搜索 outerSignal:外部取消传播');
async function t3() {
    const signal = fakeEventTarget();
    const p1 = searchByAPIAndKeyWordWithSignal('a', 'q', signal);
    const p2 = searchByAPIAndKeyWordWithSignal('b', 'q', signal);
    signal.abort(); // 触发取消
    const [r1, r2] = await Promise.all([p1, p2]);
    assert('abort 后请求被标记取消', r1 === 'ABORTED' && r2 === 'ABORTED');
    const p3 = searchByAPIAndKeyWordWithSignal('c', 'q', null);
    assert('无 outerSignal 时行为不变', (await p3) === 'c:results');
}

console.log('[T4] refillPool 防重入 + persist 去抖');
async function t4() {
    persistWriteCount = 0;
    const pool = makePool();
    // 三路并发调用,只有一路真正拉页
    const results = await Promise.all([refillPool(pool), refillPool(pool), refillPool(pool)]);
    assert('三路并发只有一路执行', results.filter(Boolean).length === 1);
    assert('防重入后 items 只追加一次', pool.items.length === 1);

    // 去抖:连续 3 次 refill(间隔 <1s)只写一次持久化
    persistWriteCount = 0; persistSig = '';
    const pool2 = makePool();
    await refillPool(pool2);
    await new Promise(r => setTimeout(r, 50));
    await refillPool(pool2); // 内容变化(items 2)
    await new Promise(r => setTimeout(r, 50));
    await refillPool(pool2); // items 3
    await new Promise(r => setTimeout(r, 1100)); // 等待去抖窗口
    assert('3 次 refill 去抖后只写 1 次', persistWriteCount === 1);
    // 内容未变再触发,不重复写
    persistWriteCount = 0;
    schedulePersistHomePool(pool2);
    await new Promise(r => setTimeout(r, 1100));
    assert('内容未变化跳过冗余写', persistWriteCount === 0);
}

(async () => {
    await t1();
    await t2();
    await t3();
    await t4();
    Date.now = realDateNow;
    console.log('\n结果:', pass, '通过,', fail, '失败');
    process.exit(fail ? 1 : 0);
})();
