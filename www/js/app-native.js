// app-native.js —— Capacitor 原生增强（Android 返回键智能处理 / 内容分享）
// 仅 App 环境（window.Capacitor.isNativePlatform()）生效；Web 环境安全降级为复制链接。
(function () {
  'use strict';

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var appPlugin = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  var sharePlugin = isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;

  // ---- 分享当前内容（App 用系统分享面板；Web 用 navigator.share 或复制链接）----
  window.shareVideo = async function (url, title) {
    var link = url || window.location.href;
    var name = title || document.title || 'LibreTV';
    if (sharePlugin) {
      try {
        await sharePlugin.share({ title: name, text: name, url: link, dialogTitle: '分享' });
        return;
      } catch (e) {
        // 用户取消或失败，继续降级
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url: link });
        return;
      } catch (e) { /* 忽略 */ }
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(link);
        if (typeof showToast === 'function') showToast('链接已复制', 'success');
        else alert('链接已复制');
      } catch (e) { /* 忽略 */ }
    }
  };

  if (!isNative || !appPlugin) return;

  // ---- Android 返回键：按层级依次处理 ----
  appPlugin.addListener('backButton', function () {
    var path = window.location.pathname || '';

    // 1. 关闭最上层的弹窗/面板
    var modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) {
      if (typeof closeModal === 'function') closeModal();
      return;
    }
    var settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel && settingsPanel.classList.contains('show')) {
      if (typeof toggleSettings === 'function') toggleSettings();
      return;
    }
    var historyPanel = document.getElementById('historyPanel');
    if (historyPanel && historyPanel.classList.contains('show')) {
      if (typeof toggleHistory === 'function') toggleHistory();
      return;
    }
    var passwordModal = document.getElementById('passwordModal');
    if (passwordModal && !passwordModal.classList.contains('hidden')) {
      passwordModal.classList.add('hidden');
      return;
    }
    var disclaimerModal = document.getElementById('disclaimerModal');
    if (disclaimerModal && !disclaimerModal.classList.contains('hidden')) {
      disclaimerModal.classList.add('hidden');
      return;
    }

    // 2. 播放/中转页：返回上一页
    if (path.indexOf('player.html') !== -1 || path.indexOf('watch.html') !== -1) {
      if (typeof goBack === 'function') { goBack(); return; }
      if (window.history.length > 1) { window.history.back(); return; }
    }

    // 3. 首页搜索态：回到首页
    var resultsArea = document.getElementById('resultsArea');
    if (resultsArea && !resultsArea.classList.contains('hidden')) {
      if (typeof resetSearchArea === 'function') { resetSearchArea(); return; }
    }

    // 4. 兜底：最小化 App
    appPlugin.minimizeApp();
  });
})();
