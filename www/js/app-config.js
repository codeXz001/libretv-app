// 应用内置配置（仅 Capacitor 打包版使用）
// 在 Capacitor 应用中，没有服务端注入 PASSWORD，所以在这里硬编码 SHA-256 哈希。
// 默认两套内置密码：999999（普通用户）/ 147258（管理员）。
// 通过环境变量可覆盖任一套（服务端注入的 __ENV__.PASSWORD / __ENV__.ADMIN_PASSWORD）。
//
// 如何生成密码哈希：
//   方式1（命令行）：node -e "console.log(require('crypto').createHash('sha256').update('你的密码').digest('hex'))"
//   方式2（浏览器控制台）：
//     crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的密码')).then(h =>
//       console.log(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join(''))
//     )

// 保留旧字段：默认用户密码哈希 = sha256('999999')
const APP_PASSWORD_HASH = '937377f056160fc4b15e0b770c67136a5f03c15205b4d3bf918268fefa2c6d0a';

// 管理员密码哈希 = sha256('147258')
const APP_ADMIN_PASSWORD_HASH = '';  // 运行时由 password.js 通过 ACCESS_PASSWORD_CONFIG 计算填充

// 暴露到全局
window.APP_PASSWORD_HASH = APP_PASSWORD_HASH;
window.APP_ADMIN_PASSWORD_HASH = APP_ADMIN_PASSWORD_HASH;

// 显式声明内置密码明文（仅 Capacitor 打包版可见）：
// password.js 会基于 ACCESS_PASSWORD_CONFIG.builtinUserPassword / builtinAdminPassword
// 实时计算 SHA-256，因此管理员密码哈希无需在此硬编码。
// userHash / adminHash 为预计算好的 SHA-256 常量：即使 js-sha256 与 Web Crypto
// 都不可用，内置密码条目依然存在（验证输入仍由 js/sha256-fallback.js 保证同步可用）。
window.ACCESS_PASSWORD_CONFIG = {
    builtinUserPassword: '999999',   // 普通访问密码
    builtinAdminPassword: '147258',  // 管理员访问密码
    userHash: '937377f056160fc4b15e0b770c67136a5f03c15205b4d3bf918268fefa2c6d0a',  // = sha256('999999')
    adminHash: '7a2ec40ff8a1247c532309355f798a779e00acff579c63eec3636ffb2902c1ac',  // = sha256('147258')
};