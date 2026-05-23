// api/holdings.js v2 — 动态处理未知股票
const crypto = require('crypto')

// ── 已知代码映射（A股/港股 → 美股Finnhub代码）──────
const CODE_MAP = {
  // 美股
  'NVDA':'NVDA','AAPL':'AAPL','MSFT':'MSFT','GOOGL':'GOOGL',
  'GOOG':'GOOGL','META':'META','AMZN':'AMZN','TSLA':'TSLA',
  'AVGO':'AVGO','AMD':'AMD','TSM':'TSM','QCOM':'QCOM',
  'INTC':'INTC','CRM':'CRM','NFLX':'NFLX','ASML':'ASML',
  'NIO':'NIO','LI':'LI','XPEV':'XPEV','BIDU':'BIDU',
  'QQQ':'QQQ','SPY':'SPY','BABA':'BABA','JD':'JD',
  'NTES':'NTES','PDD':'PDD','UBER':'UBER','LYFT':'LYFT',
  'SNAP':'SNAP','PINS':'PINS','TWTR':'TWTR','SPOT':'SPOT',
  'SHOP':'SHOP','SQ':'SQ','PYPL':'PYPL','COIN':'COIN',
  'RIVN':'RIVN','LCID':'LCID','F':'F','GM':'GM',
  'ORCL':'ORCL','IBM':'IBM','HPQ':'HPQ','DELL':'DELL',
  'MU':'MU','AMAT':'AMAT','LRCX':'LRCX','KLAC':'KLAC',
  'NOW':'NOW','ADBE':'ADBE','INTU':'INTU','PANW':'PANW',
  'CRWD':'CRWD','ZS':'ZS','DDOG':'DDOG','NET':'NET',
  'ARM':'ARM','SMCI':'SMCI','MRVL':'MRVL','XLNX':'XLNX',
  // 台积电
  '2330':'TSM','TSM.TW':'TSM',
  // 港股ADR
  '09988':'BABA','09618':'JD','09999':'NTES','00700':'TCEHY',
  '09888':'BIDU','03690':'MPNGF','01810':'XIACY',
  // A股（无对应美股，暂跳过）
  '600519':'',  // 茅台
  '000858':'',  // 五粮液
}

// ── 中文名映射 ─────────────────────────────────────
const NAME_MAP = {
  'NVDA':'英伟达','AAPL':'苹果','MSFT':'微软','GOOGL':'谷歌',
  'META':'Meta','AMZN':'亚马逊','TSLA':'特斯拉','AVGO':'博通',
  'AMD':'超威半导体','TSM':'台积电','QCOM':'高通','INTC':'英特尔',
  'CRM':'Salesforce','NFLX':'奈飞','ASML':'阿斯麦','NIO':'蔚来',
  'LI':'理想汽车','XPEV':'小鹏汽车','BIDU':'百度','QQQ':'纳指ETF',
  'BABA':'阿里巴巴','JD':'京东','NTES':'网易','PDD':'拼多多',
  'SPY':'标普ETF','TCEHY':'腾讯','RIVN':'Rivian','LCID':'Lucid',
  'MU':'美光科技','AMAT':'应用材料','NOW':'ServiceNow',
  'ADBE':'Adobe','INTU':'Intuit','PANW':'Palo Alto',
  'ARM':'ARM Holdings','SMCI':'超微电脑','MRVL':'迈威尔',
  'SHOP':'Shopify','PYPL':'PayPal','COIN':'Coinbase',
}

async function fetchFundHoldings(fundCode) {
  const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition` +
    `?FCODE=${fundCode}&deviceid=Wap&plat=Wap&product=EFund&version=6.3.8&Ident=`

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer':    'https://fund.eastmoney.com/',
      'Accept':     'application/json, text/plain, */*'
    },
    signal: AbortSignal.timeout(8000)
  })
  if (!resp.ok) throw new Error(`东方财富返回 ${resp.status}`)

  const json     = await resp.json()
  const positions = json?.Data?.fundSharesPositions || []
  if (positions.length === 0) throw new Error('无持仓数据')

  const holdings = []

  for (const pos of positions) {
    const rawCode  = (pos.ZQDM || '').trim().toUpperCase()
    const cnName   = pos.GPJC || rawCode
    const weight   = parseFloat(pos.JZBL || '0')
    if (weight <= 0) continue

    // 1. 已知映射
    let mappedCode = CODE_MAP[rawCode]

    // 2. 未知但看起来是美股代码（纯字母1-5位）→ 直接使用
    if (mappedCode === undefined && /^[A-Z]{1,5}$/.test(rawCode)) {
      mappedCode = rawCode
    }

    // 3. 明确标记为空（如A股）或无法映射 → 跳过
    if (!mappedCode) continue

    holdings.push({
      code:   mappedCode,
      // 优先用已知中文名，其次用东方财富返回的中文名，最后用代码
      name:   NAME_MAP[mappedCode] || cnName || mappedCode,
      weight: Math.round(weight * 10) / 10,
      // 把原始代码也带回去，方便前端扩展
      rawCode
    })
  }

  return holdings
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes } = req.body || {}
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ code:-1, error:'codes 不能为空' })
  }

  const result = {}, errors = {}

  for (const fundCode of codes) {
    try {
      const holdings = await fetchFundHoldings(fundCode)
      if (holdings.length > 0) result[fundCode] = holdings
      else errors[fundCode] = '持仓为空'
    } catch(e) {
      errors[fundCode] = e.message
      console.error(`[holdings] ${fundCode}:`, e.message)
    }
    await new Promise(r => setTimeout(r, 200))
  }

  // 汇总所有出现的股票代码（方便前端知道需要查哪些价格）
  const allCodes = [...new Set(
    Object.values(result).flat().map(h => h.code)
  )]

  return res.status(200).json({
    code: 0, data: result, errors,
    allCodes,   // ← 前端用这个动态构建 quote 请求
    server_ts: Date.now()
  })
}
