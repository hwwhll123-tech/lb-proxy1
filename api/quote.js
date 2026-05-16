const crypto = require('crypto')

const LB_BASE = 'https://openapi.longbridgeapp.com'

function buildLBHeaders(method, path, bodyStr) {
  const appKey      = process.env.LB_APP_KEY
  const appSecret   = process.env.LB_APP_SECRET
  const accessToken = process.env.LB_ACCESS_TOKEN

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce     = crypto.randomBytes(8).toString('hex')

  const signPayload = [timestamp, nonce, method.toUpperCase(), path, '', bodyStr].join('\n')
  const signature   = crypto.createHmac('sha256', appSecret).update(signPayload).digest('hex')

  return {
    'Content-Type':  'application/json; charset=utf-8',
    'Authorization': `Bearer ${accessToken}`,
    'X-Api-Key':     appKey,
    'X-Timestamp':   timestamp,
    'X-Nonce':       nonce,
    'X-Signature':   signature
  }
}

function extractBySession(quote, session) {
  const last       = parseFloat(quote.last_done        || '0')
  const changeRate = parseFloat(quote.change_rate      || '0') * 100
  const prePrice   = parseFloat(quote.pre_price        || quote.last_done || '0')
  const preRate    = parseFloat(quote.pre_change_rate  || quote.change_rate || '0') * 100
  const afterPrice = parseFloat(quote.after_hours_price       || quote.last_done || '0')
  const afterRate  = parseFloat(quote.after_hours_change_rate || quote.change_rate || '0') * 100

  switch (session) {
    case 'pre':  return { current_price: prePrice,   change_rate: preRate   }
    case 'post': return { current_price: afterPrice, change_rate: afterRate }
    default:     return { current_price: last,       change_rate: changeRate }
  }
}

async function fetchRealQuote(symbols, session) {
  const path    = '/v1/quote/real'
  const bodyStr = JSON.stringify({ symbols })
  const headers = buildLBHeaders('POST', path, bodyStr)

  const resp = await fetch(LB_BASE + path, {
    method: 'POST', headers, body: bodyStr,
    signal: AbortSignal.timeout(8000)
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`长桥返回 ${resp.status}: ${errText}`)
  }

  const data   = await resp.json()
  const result = {}
  const quotes = data.secu_quotes || []

  quotes.forEach(q => {
    const ticker = (q.symbol || '').replace(/\.(US|HK|SH|SZ)$/, '')
    result[ticker] = {
      ...extractBySession(q, session),
      symbol: q.symbol,
      high:   parseFloat(q.high || '0'),
      low:    parseFloat(q.low  || '0'),
      open:   parseFloat(q.open || '0'),
    }
  })
  return result
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ code: -1, error: 'Method Not Allowed' })

  const { symbols, session = 'intra' } = req.body || {}

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ code: -1, error: 'symbols 不能为空' })
  }

  try {
    const data = await fetchRealQuote(symbols, session)
    return res.status(200).json({ code: 0, session, data, server_ts: Date.now() })
  } catch (err) {
    console.error('[quote] error:', err.message)
    return res.status(500).json({ code: -1, error: err.message })
  }
}
