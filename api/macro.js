// macro.js - 使用 Finnhub 免费接口获取宏观指数
const FINNHUB_BASE = 'https://finnhub.io/api/v1'

// 宏观指数对应的 Finnhub 代码
const MACRO_LIST = [
  { code: 'NDX',    symbol: 'QQQ',  name: 'NASDAQ'      },
  { code: 'SPX',    symbol: 'SPY',  name: 'S&P 500'     },
  { code: 'DJI',    symbol: 'DIA',  name: '道琼斯'       },
  { code: 'VIX',    symbol: 'VIXY', name: 'VIX恐慌'     },
  { code: 'GOLD',   symbol: 'GLD',  name: '黄金'         },
  { code: 'USDCNY', symbol: 'UUP',  name: '美元指数'     },
  { code: 'BTC',    symbol: 'BITO', name: '比特币ETF'    }
]

async function fetchQuote(symbol) {
  const token = process.env.FINNHUB_KEY
  const url   = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${token}`
  const resp  = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!resp.ok) throw new Error(`Finnhub 返回 ${resp.status}`)
  return await resp.json()
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const results = await Promise.allSettled(
      MACRO_LIST.map(m => fetchQuote(m.symbol))
    )

    const data = MACRO_LIST.map((m, i) => {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value && r.value.c) {
        const q      = r.value
        const change = q.dp || 0
        return {
          code:        m.code,
          name:        m.name,
          price:       q.c.toLocaleString('en-US', { maximumFractionDigits: 2 }),
          change,
          changeStr:   Math.abs(change).toFixed(2),
          sparkHeight: Math.min(Math.abs(change) * 5 + 6, 24)
        }
      }
      // 请求失败时用备用数据
      return {
        code:        m.code,
        name:        m.name,
        price:       '--',
        change:      0,
        changeStr:   '0.00',
        sparkHeight: 6
      }
    })

    res.status(200).json({ code: 0, data, server_ts: Date.now() })
  } catch (err) {
    console.error('[macro/finnhub]', err.message)
    res.status(500).json({ code: -1, error: err.message })
  }
}
