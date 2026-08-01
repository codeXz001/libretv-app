// 应用内置配置（仅 Capacitor 打包版使用）
// 在 Capacitor 应用中，没有服务端注入 PASSWORD，所以在这里硬编码 SHA-256 哈希
// 留空字符串 '' = 不需要密码，直接进入应用
// 设置哈希 = 必须输入对应密码才能使用
//
// 如何生成密码哈希（任选一种）：
//   方式1（浏览器）：打开 https://emn178.github.io/online-tools/sha256.html 输入密码
//   方式2（命令行）：node -e "console.log(require('crypto').createHash('sha256').update('你的密码').digest('hex'))"
//   方式3（浏览器控制台）：crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的密码')).then(h => console.log(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('')))

const APP_PASSWORD_HASH = '937377f056160fc4b15e0b770c67136a5f03c15205b4d3bf918268fefa2c6d0a';  // = '999999'

// 暴露到全局
window.APP_PASSWORD_HASH = APP_PASSWORD_HASH;