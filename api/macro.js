// macro.js - 串行请求避免超时
const FINNHUB_BASE = 'https://finnhub.io/api/v1'

const MACRO_LIST = [
  { code: 'NDX',    symbol: 'QQQ',  name: 'NASDAQ'    },
  { code: 'SPX',    symbol: 'SPY',  name: 'S&P 500'   },
  { code: 'DJI',    symbol: 'DIA',  name: '道琼斯'     },
  { code: 'GOLD',   symbol: 'GLD',  name: '黄金'       },
  { code: 'USDCNY', symbol: 'UUP',  name: '美元指数'   },
  { code: 'BTC',    symbol: 'BITO', name: '比特币ETF'  }
]

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchOne(symbol) {
  const token = process.env.FINNHUB_KEY
  const url   = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${token}`
  const resp  = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!resp.ok) throw new Error(`${resp.status}`)
  return await resp.json()
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const data = []
    for (const m of MACRO_LIST) {
      try {
        const q      = await fetchOne(m.symbol)
        const change = q.dp || 0
        data.push({
          code:        m.code,
          name:        m.name,
          price:       (q.c || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          change,
          changeStr:   Math.abs(change).toFixed(2),
          sparkHeight: Math.min(Math.abs(change) * 5 + 6, 24)
        })
      } catch (e) {
        data.push({ code: m.code, name: m.name, price: '--', change: 0, changeStr: '0.00', sparkHeight: 6 })
      }
      await sleep(120) // 每个请求间隔120ms，避免超限
    }
    res.status(200).json({ code: 0, data, server_ts: Date.now() })
  } catch (err) {
    console.error('[macro]', err.message)
    res.status(500).json({ code: -1, error: err.message })
  }
}
