const crypto = require('crypto')
const LB_BASE = 'https://openapi.longbridgeapp.com'

const MACRO_SYMBOLS = {
  '.IXIC':  { name: 'NASDAQ'      },
  '.SPX':   { name: 'S&P 500'     },
  '.DJI':   { name: '道琼斯'       },
  'VIX.US': { name: 'VIX恐慌'     },
  'XAUUSD': { name: '黄金'         },
  'USDCNH': { name: '美元/人民币'  },
}

function buildLBHeaders(method, path, bodyStr) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce     = crypto.randomBytes(8).toString('hex')
  const payload   = [timestamp, nonce, method.toUpperCase(), path, '', bodyStr].join('\n')
  const signature = crypto.createHmac('sha256', process.env.LB_APP_SECRET).update(payload).digest('hex')
  return {
    'Content-Type':  'application/json; charset=utf-8',
    'Authorization': `Bearer ${process.env.LB_ACCESS_TOKEN}`,
    'X-Api-Key':     process.env.LB_APP_KEY,
    'X-Timestamp':   timestamp,
    'X-Nonce':       nonce,
    'X-Signature':   signature
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const symbols = Object.keys(MACRO_SYMBOLS)
    const path    = '/v1/quote/real'
    const bodyStr = JSON.stringify({ symbols })
    const resp    = await fetch(LB_BASE + path, {
      method: 'POST', headers: buildLBHeaders('POST', path, bodyStr), body: bodyStr,
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) throw new Error(`长桥返回 ${resp.status}`)

    const raw    = await resp.json()
    const quotes = raw.secu_quotes || []
    const data   = quotes.map(q => {
      const meta   = MACRO_SYMBOLS[q.symbol] || {}
      const change = parseFloat(q.change_rate || '0') * 100
      const price  = parseFloat(q.last_done   || '0')
      return {
        code:        q.symbol,
        name:        meta.name || q.symbol,
        price:       price.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        change,
        changeStr:   Math.abs(change).toFixed(2),
        sparkHeight: Math.min(Math.abs(change) * 5 + 6, 24)
      }
    })
    res.status(200).json({ code: 0, data, server_ts: Date.now() })
  } catch (err) {
    console.error('[macro]', err.message)
    res.status(500).json({ code: -1, error: err.message })
  }
}
