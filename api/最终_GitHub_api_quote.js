// api/quote.js — Finnhub 实时股价接口
const FINNHUB_BASE = 'https://finnhub.io/api/v1'

const SESSION_ADJUST = { pre:1.15, intra:1.0, post:0.85, night:0.95 }

async function fetchOne(symbol) {
  const url  = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${process.env.FINNHUB_KEY}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!resp.ok) throw new Error(`Finnhub ${resp.status}`)
  return await resp.json()
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ code:-1, error:'Method Not Allowed' })

  const { symbols, session = 'intra' } = req.body || {}
  if (!Array.isArray(symbols) || symbols.length === 0)
    return res.status(400).json({ code:-1, error:'symbols 不能为空' })

  try {
    const tickers = symbols.map(s => s.replace(/\.(US|HK|SH|SZ)$/i, ''))
    const adjust  = SESSION_ADJUST[session] || 1.0

    const results = await Promise.allSettled(tickers.map(t => fetchOne(t)))

    const data = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value && r.value.c) {
        const q = r.value
        data[tickers[i]] = {
          current_price: q.c,
          change_rate:   (q.dp || 0) * adjust,
          open: q.o, high: q.h, low: q.l, prev_close: q.pc
        }
      }
    })

    res.status(200).json({ code:0, session, data, source:'finnhub', server_ts:Date.now() })
  } catch (err) {
    console.error('[quote]', err.message)
    res.status(500).json({ code:-1, error: err.message })
  }
}
