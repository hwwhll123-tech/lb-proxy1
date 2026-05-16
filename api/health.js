module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const ok = !!process.env.LB_APP_KEY && !!process.env.LB_APP_SECRET && !!process.env.LB_ACCESS_TOKEN
  res.status(ok ? 200 : 500).json({
    status:          ok ? '✅ 配置正确，可以使用' : '❌ 环境变量未配置',
    LB_APP_KEY:      process.env.LB_APP_KEY      ? '✅ 已配置' : '❌ 缺少',
    LB_APP_SECRET:   process.env.LB_APP_SECRET   ? '✅ 已配置' : '❌ 缺少',
    LB_ACCESS_TOKEN: process.env.LB_ACCESS_TOKEN ? '✅ 已配置' : '❌ 缺少',
    time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  })
}
