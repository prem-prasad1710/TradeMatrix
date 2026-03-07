/**
 * FII / DII Institutional Flow Fetcher
 *
 * Fetches daily institutional buying and selling data from NSE India.
 *
 * Data Sources:
 *   - NSE FII/DII Trade React API: https://www.nseindia.com/api/fiidiiTradeReact
 *   - Returns cash + derivatives segment data for FII and DII
 *
 * Why it matters:
 *   - FII (Foreign Institutional Investors) drive large directional moves.
 *     FII net buyers → bullish long-term flows, rally sustains.
 *     FII net sellers → distribution phase, rally fades or reverses.
 *   - DII (Domestic Institutional Investors) often buy on FII selling (support).
 *     Mutual funds / insurance tend to be contrarian — buy dips.
 *   - When FII AND DII both buy → very strong bullish signal.
 *   - When FII sells but DII buys → market supported but cap on upside.
 *
 * Update frequency: NSE updates after market close daily.
 * Caching: 60 minute TTL (no point refreshing intraday).
 */

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const NSE_FII_DII_URL = 'https://www.nseindia.com/api/fiidiiTradeReact';

// Simple in-memory cache with TTL
let fiiDiiCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch FII/DII data from NSE.
 * Falls back to stale cache or mock data if NSE is unavailable.
 *
 * @param {string} nseCookies - Current NSE session cookies
 * @returns {FIIDIIData}
 */
async function fetchFIIDIIData(nseCookies = '') {
  // Return cached data if still valid
  if (fiiDiiCache && Date.now() < cacheExpiry) {
    return fiiDiiCache;
  }

  try {
    const resp = await axios.get(NSE_FII_DII_URL, {
      httpsAgent,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nseindia.com/',
        'Cookie': nseCookies,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const data = resp.data;
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid FII/DII response format');
    }

    const result = parseFIIDIIResponse(data);
    fiiDiiCache = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    console.log('[FII/DII] Fetched — FII net:', result.fii.netValue, 'DII net:', result.dii.netValue);
    return result;

  } catch (err) {
    console.warn('[FII/DII] Fetch failed:', err.message, '— using fallback');

    // Return stale cache if available
    if (fiiDiiCache) {
      return { ...fiiDiiCache, isStale: true };
    }

    // Return mock / placeholder data
    return generateMockFIIDII();
  }
}

/**
 * Parse the NSE FII/DII API response array.
 *
 * NSE response is an array of objects with `fiiData` and `diiData` fields,
 * or a flat array with `name` field indicating FII or DII.
 * The structure can vary — we handle both common formats.
 *
 * @param {Object[]} data
 * @returns {FIIDIIData}
 */
function parseFIIDIIResponse(data) {
  let fiiRow = null;
  let diiRow = null;

  // Format 1: array of {fiiData, diiData} objects
  if (data[0] && data[0].fiiData) {
    const latest = data[0]; // most recent entry
    fiiRow = latest.fiiData;
    diiRow = latest.diiData;
  } else {
    // Format 2: flat array with category field
    for (const row of data) {
      const name = (row.category || row.name || '').toUpperCase();
      if (name.includes('FII') || name.includes('FPI')) fiiRow = row;
      if (name.includes('DII')) diiRow = row;
    }
  }

  const fii = parseInstitutionRow(fiiRow);
  const dii = parseInstitutionRow(diiRow);

  const netCombined = fii.netValue + dii.netValue;
  const bias = computeFlowBias(fii, dii);

  return {
    fii,
    dii,
    netCombined:         parseFloat(netCombined.toFixed(2)),
    netCombinedCr:       croreStr(netCombined),
    bias,
    isMock:       false,
    isStale:      false,
    date:         extractDate(data),
    fetchTime:    new Date().toISOString(),
  };
}

function parseInstitutionRow(row) {
  if (!row) {
    return { buyValue: 0, sellValue: 0, netValue: 0, netValueCr: '₹0Cr', direction: 'FLAT' };
  }

  // Handle multiple possible field names from NSE
  const buy  = parseFloat(row.buyValue  ?? row.buy_value  ?? row.grossPurchase ?? '0') || 0;
  const sell = parseFloat(row.sellValue ?? row.sell_value ?? row.grossSales     ?? '0') || 0;
  const net  = parseFloat(row.netValue  ?? row.net_value  ?? row.netPurchase    ?? (buy - sell).toString()) || (buy - sell);

  return {
    buyValue:   parseFloat(buy.toFixed(2)),
    sellValue:  parseFloat(sell.toFixed(2)),
    netValue:   parseFloat(net.toFixed(2)),
    netValueCr: croreStr(net),
    direction:  net > 100 ? 'BUYER' : net < -100 ? 'SELLER' : 'FLAT',
    isBuyer:    net > 0,
    isSeller:   net < 0,
  };
}

function computeFlowBias(fii, dii) {
  const fiiBuying = fii.netValue > 100;
  const fiiSelling = fii.netValue < -100;
  const diiBuying  = dii.netValue > 100;

  if (fiiBuying && diiBuying) {
    return { label: 'BOTH BUYING', bias: 'STRONGLY_BULLISH', color: 'bullish',
             description: 'FII + DII both buying — strong institutional demand' };
  }
  if (fiiBuying) {
    return { label: 'FII BUYING', bias: 'BULLISH', color: 'bullish',
             description: 'FII buying — foreign capital inflows supportive' };
  }
  if (fiiSelling && diiBuying) {
    return { label: 'FII SELL / DII BUY', bias: 'NEUTRAL', color: 'neutral',
             description: 'FII selling absorbed by DII — market supported but capped' };
  }
  if (fiiSelling) {
    return { label: 'FII SELLING', bias: 'BEARISH', color: 'bearish',
             description: 'FII net sellers — foreign outflows, negative for market' };
  }
  return { label: 'NEUTRAL', bias: 'NEUTRAL', color: 'neutral',
           description: 'Neither FII nor DII showing strong conviction' };
}

function croreStr(value) {
  const inCr = value / 100; // NSE values appear to be in crores (varies)
  // Most commonly NSE gives values in crores directly
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  if (abs >= 10000) return `${sign}₹${(Math.abs(value) / 10000).toFixed(2)}K Cr`;
  return `${sign}₹${Math.abs(value).toFixed(0)} Cr`;
}

function extractDate(data) {
  try {
    const row = data[0];
    const d = row?.date || row?.tradeDate || row?.trade_date;
    if (d) return d;
  } catch (_) {}
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate realistic mock FII/DII data for off-hours or when NSE is unavailable.
 */
function generateMockFIIDII() {
  const fiiNet = Math.round((Math.random() - 0.45) * 3000); // slight bearish bias for realism
  const diiNet = Math.round((Math.random() - 0.3)  * 2000);
  const fiiRow = { netValue: fiiNet.toString(), buyValue: (8000 + Math.random() * 2000).toFixed(2), sellValue: (8000 - fiiNet + Math.random()*2000).toFixed(2) };
  const diiRow = { netValue: diiNet.toString(), buyValue: (5000 + Math.random() * 1000).toFixed(2), sellValue: (5000 - diiNet + Math.random()*1000).toFixed(2) };

  const fii = parseInstitutionRow(fiiRow);
  const dii = parseInstitutionRow(diiRow);

  return {
    fii,
    dii,
    netCombined:   parseFloat((fii.netValue + dii.netValue).toFixed(2)),
    netCombinedCr: croreStr(fii.netValue + dii.netValue),
    bias:          computeFlowBias(fii, dii),
    isMock:        true,
    isStale:       false,
    date:          new Date().toISOString().split('T')[0],
    fetchTime:     new Date().toISOString(),
  };
}

/**
 * 5-day rolling FII/DII trend — shows if smart money has been net buying/selling.
 * Generates approximate trend from current data (real API only gives latest day).
 *
 * @param {FIIDIIData} current - Most recent FII/DII data
 * @returns {FlowTrend}
 */
function computeFlowTrend(current) {
  if (!current) return { bias: 'UNKNOWN', label: 'No data' };

  const fiiNet = current.fii.netValue;

  if (fiiNet > 2000) {
    return { bias: 'STRONGLY_BULLISH', label: 'FII aggressive buyers (>₹2000Cr)' };
  }
  if (fiiNet > 500) {
    return { bias: 'BULLISH', label: 'FII moderate buyers (₹500–2000Cr)' };
  }
  if (fiiNet > -500) {
    return { bias: 'NEUTRAL', label: 'FII near flat (₹-500–500Cr)' };
  }
  if (fiiNet > -2000) {
    return { bias: 'BEARISH', label: 'FII moderate sellers (₹-2000– -500Cr)' };
  }
  return { bias: 'STRONGLY_BEARISH', label: 'FII aggressive sellers (>₹2000Cr)' };
}

module.exports = { fetchFIIDIIData, computeFlowTrend };
