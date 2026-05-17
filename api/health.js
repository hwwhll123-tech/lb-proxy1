module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const ok = !!process.env.FINNHUB_KEY
  res.status(ok ? 200 : 500).json({
    status:       ok ? '✅ 配置正确，可以使用' : '❌ 环境变量未配置',
    FINNHUB_KEY:  process.env.FINNHUB_KEY ? '✅ 已配置' : '❌ 缺少',
    time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  })
}
