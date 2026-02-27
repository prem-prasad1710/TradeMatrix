/**
 * NSE Data Fetcher Service
 *
 * Fetches NIFTY option chain from NSE India API every 10 seconds.
 * NSE uses Akamai bot protection — proper warm-up sequence required:
 *   1. Visit nseindia.com homepage  → get AKA_A2, _abck, bm_sz cookies
 *   2. Visit /option-chain page     → get nsit, nseappid session cookies
 *   3. Hit the API endpoint         → now allowed
 *
 * Also fetches NIFTY spot price from Yahoo Finance.
 */

const axios = require('axios');
const https = require('https');
const cron = require('node-cron');
const { parseOptionChain, computeOIAnalysis } = require('../utils/oiParser');

// ── SSL Fix for macOS / corporate proxies ────────────────────────────────────
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const { generateSignals } = require('../signals/signalEngine');
const { computeVWAP, computePivotPoints } = require('../utils/technicals');
const { addSnapshot, getOIPattern, getTradeSetup } = require('../utils/oiTracker');
const {
  saveOptionChainSnapshot,
  savePriceSnapshot,
  saveSignal,
  cleanupOldData,
} = require('./database');
const { broadcastToClients } = require('./websocket');

// ── In-memory cache ────────────────────────────────────────────────────────────
const cache = {
  optionChain: null,
  priceData: null,
  giftNifty: null,
  signals: [],
  oiPattern: null,
  tradeSetup: null,
  lastFetch: null,
  isMarketOpen: false,
  priceHistory: [],
  // Live OI state — evolves each cycle so pattern detection always has changing data
  liveOI: null,         // { callOI, putOI } — updated every cycle
  prevPrice: null,      // used to compute price delta for OI evolution
  patternStreak: 0,     // consecutive cycles with same pattern (for confirmation)
  lastConfirmedPattern: 'NEUTRAL',
};

// Rolling OI snapshots for pattern detection (180 × 10s = 30 min)
const oiHistory = [];

// ── Browser-like headers ───────────────────────────────────────────────────────
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const NSE_API_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'Referer': 'https://www.nseindia.com/option-chain',
  'X-Requested-With': 'XMLHttpRequest',
};

// Session state
let nseCookies = '';
let nseSessionExpiry = 0;
let sessionRefreshing = false;
let consecutiveFailures = 0;
let nseBackoffUntil = 0;         // Don't retry NSE until this timestamp
const NSE_BACKOFF_MS = [0, 30000, 60000, 120000, 300000]; // 0s,30s,1m,2m,5m

// ── Cookie utilities ───────────────────────────────────────────────────────────

/**
 * Parse Set-Cookie headers into a flat cookie string, merging with existing.
 */
function mergeCookies(existing, setCookieHeaders) {
  const map = new Map();
  // Parse existing
  (existing || '').split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) map.set(k.trim(), v.join('=').trim());
  });
  // Merge new cookies
  (setCookieHeaders || []).forEach(header => {
    const raw = header.split(';')[0].trim();
    const eqIdx = raw.indexOf('=');
    if (eqIdx > 0) {
      const k = raw.substring(0, eqIdx).trim();
      const v = raw.substring(eqIdx + 1).trim();
      if (k) map.set(k, v);
    }
  });
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── NSE Session Management ─────────────────────────────────────────────────────

/**
 * Full Akamai-aware warm-up:
 *   Step 1: GET nseindia.com/ → collect AKA_A2, _abck, bm_sz
 *   Step 2: GET nseindia.com/option-chain → collect nsit, nseappid
 * After these two requests the API accepts AJAX calls.
 */
async function refreshNSESession() {
  if (sessionRefreshing) return false;
  sessionRefreshing = true;
  try {
    // ── Step 1: Homepage ─────────────────────────────────────────────────────
    const homeResp = await axios.get('https://www.nseindia.com/', {
      httpsAgent,
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': NSE_API_HEADERS['sec-ch-ua'],
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
      },
    });
    nseCookies = mergeCookies('', homeResp.headers['set-cookie']);

    // Short delay — simulate browser rendering time
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    // ── Step 2: Option chain page ─────────────────────────────────────────────
    const ocPageResp = await axios.get('https://www.nseindia.com/option-chain', {
      httpsAgent,
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.nseindia.com/',
        'sec-ch-ua': NSE_API_HEADERS['sec-ch-ua'],
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Cookie': nseCookies,
      },
    });
    nseCookies = mergeCookies(nseCookies, ocPageResp.headers['set-cookie']);

    nseSessionExpiry = Date.now() + 4.5 * 60 * 1000;
    consecutiveFailures = 0;
    console.log('[NSE] Session warm-up complete. Cookies:', nseCookies.slice(0, 100) + '...');
    return true;
  } catch (err) {
    console.error('[NSE] Session warm-up failed:', err.message);
    return false;
  } finally {
    sessionRefreshing = false;
  }
}

async function ensureNSESession() {
  if (!nseCookies || Date.now() > nseSessionExpiry) {
    await refreshNSESession();
  }
}

// ── Data Fetching Functions ───────────────────────────────────────────────────

/**
 * Fetch NIFTY option chain from NSE.
 * Validates response has records.data array before returning.
 * Implements exponential backoff when NSE blocks us.
 */
async function fetchNSEOptionChain() {
  // Honour backoff — don't hammer NSE when it's blocking us
  if (Date.now() < nseBackoffUntil) {
    const remainS = Math.ceil((nseBackoffUntil - Date.now()) / 1000);
    throw new Error(`NSE backoff active (${remainS}s remaining)`);
  }

  await ensureNSESession();

  const url = 'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY';

  const doFetch = () => axios.get(url, {
    httpsAgent,
    timeout: 12000,
    headers: { ...NSE_API_HEADERS, 'Cookie': nseCookies },
  });

  try {
    const response = await doFetch();

    // NSE sometimes returns {} or an HTML page (bot block)
    const data = response.data;
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      consecutiveFailures++;
      // Apply backoff — don't re-warm every 10 seconds
      const backoffIdx = Math.min(consecutiveFailures, NSE_BACKOFF_MS.length - 1);
      nseBackoffUntil = Date.now() + NSE_BACKOFF_MS[backoffIdx];
      // Force session refresh after backoff period
      nseCookies = '';
      nseSessionExpiry = 0;
      throw new Error(`NSE returned empty object (Akamai block) — backoff ${NSE_BACKOFF_MS[backoffIdx] / 1000}s`);
    }

    if (!data.records) {
      throw new Error(`Unexpected NSE response keys: ${Object.keys(data).join(',')}`);
    }

    consecutiveFailures = 0;
    nseBackoffUntil = 0;
    return data;
  } catch (err) {
    if (!err.message.includes('backoff')) {
      consecutiveFailures++;
      const backoffIdx = Math.min(consecutiveFailures, NSE_BACKOFF_MS.length - 1);
      nseBackoffUntil = Date.now() + NSE_BACKOFF_MS[backoffIdx];
    }
    // On repeated 401/403, force session refresh after backoff
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.log('[NSE] Auth error — will refresh session after backoff');
      nseCookies = '';
      nseSessionExpiry = 0;
    }
    throw err;
  }
}

/**
 * Fetch NIFTY spot price from Yahoo Finance.
 * Tries query1 first, then query2 as fallback.
 */
async function fetchNiftyPrice() {
  const YAHOO_HEADERS = {
    'User-Agent': BROWSER_UA,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const tryYahoo = async (host) => {
    const url = `https://${host}/v8/finance/chart/%5ENSEI`;
    const response = await axios.get(url, {
      headers: YAHOO_HEADERS,
      params: { interval: '5m', range: '1d', includePrePost: false },
      httpsAgent,
      timeout: 5000, // reduced from 10s so 3s cron doesn't pile up
    });
    return response;
  };

  try {
    let response;
    try {
      response = await tryYahoo('query1.finance.yahoo.com');
    } catch (_) {
      response = await tryYahoo('query2.finance.yahoo.com');
    }

    const chart = response.data?.chart?.result?.[0];
    if (!chart) throw new Error('Yahoo Finance: No chart data');

    const meta = chart.meta;
    const timestamps = chart.timestamp || [];
    const ohlcv = chart.indicators?.quote?.[0] || {};

    // Compute VWAP from intraday data
    const vwap = computeVWAP(timestamps, ohlcv);

    // Build OHLC candles for chart
    const candles = timestamps.map((ts, i) => ({
      time: ts * 1000,
      open: ohlcv.open?.[i],
      high: ohlcv.high?.[i],
      low: ohlcv.low?.[i],
      close: ohlcv.close?.[i],
      volume: ohlcv.volume?.[i],
    })).filter(c => c.open != null);

    // Compute pivot points from today's data
    const todayHigh = Math.max(...(ohlcv.high?.filter(Boolean) || [meta.regularMarketPrice]));
    const todayLow = Math.min(...(ohlcv.low?.filter(Boolean) || [meta.regularMarketPrice]));
    const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
    const pivots = computePivotPoints(todayHigh, todayLow, prevClose);

    const price = meta.regularMarketPrice;
    console.log(`[Yahoo] Price fetched: ₹${price}`);

    return {
      symbol: '^NSEI',
      price,
      open: meta.regularMarketOpen || ohlcv.open?.[0],
      high: todayHigh,
      low: todayLow,
      prevClose,
      vwap,
      pivots,
      candles: candles.slice(-78), // Last ~6.5 hours in 5m candles
      change: price - (meta.chartPreviousClose || meta.previousClose || price),
      changePct: meta.regularMarketChangePercent || 0,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error('[Yahoo] Price fetch error:', err.message);
    // Return last known price or a mock so dashboard is not blank
    if (cache.priceData) return cache.priceData;

    // Generate mock price data
    const spot = 24500;
    const pivots = computePivotPoints(spot + 120, spot - 80, spot - 30);
    const now = Date.now();
    const mockCandles = Array.from({ length: 50 }, (_, i) => ({
      time: now - (50 - i) * 5 * 60 * 1000,
      open: spot + Math.round((Math.random() - 0.5) * 100),
      high: spot + Math.round(Math.random() * 80 + 20),
      low: spot - Math.round(Math.random() * 80 + 20),
      close: spot + Math.round((Math.random() - 0.5) * 80),
      volume: Math.round(Math.random() * 500000 + 100000),
    }));
    return {
      symbol: '^NSEI',
      price: spot,
      open: spot - 50,
      high: spot + 120,
      low: spot - 80,
      prevClose: spot - 30,
      vwap: spot + 10,
      pivots,
      candles: mockCandles,
      change: 30,
      changePct: 0.12,
      timestamp: now,
      isMock: true,
    };
  }
}

/**
 * Fetch GIFT NIFTY proxy from Yahoo Finance (1-min for fresher price)
 */
async function fetchGiftNifty() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json',
      },
      params: { interval: '1m', range: '1d' },
      httpsAgent,
      timeout: 8000,
    });

    const meta = response.data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose,
      change: meta.regularMarketPrice - (meta.chartPreviousClose || meta.regularMarketPrice),
      changePct: meta.regularMarketChangePercent || 0,
      direction: meta.regularMarketPrice >= (meta.chartPreviousClose || meta.regularMarketPrice) ? 'UP' : 'DOWN',
    };
  } catch (err) {
    return null;
  }
}

// ── Mock / Fallback Data ──────────────────────────────────────────────────────

/**
 * Evolve mock OI realistically each 10-second cycle.
 *
 * Real market OI dynamics:
 *  - Rising market: Put writers add (Put OI ↑ = bullish hedge), Call OI also ↑ (speculative)
 *  - Falling market: Call writers add (Call OI ↑ = bearish hedge), Put OI also ↑ (protection)
 *  - 5% chance of institutional block (large OI spike)
 *  - Gradual drift ~0.15-0.40% of total OI per 10s
 *
 * @param {number} prevCallOI
 * @param {number} prevPutOI
 * @param {number} priceChange  — price delta since last cycle (can be 0)
 * @returns {{ callOI, putOI }}
 */
function evolveMockOI(prevCallOI, prevPutOI, priceChange) {
  const totalOI = prevCallOI + prevPutOI;

  // Base flow: 0.15%–0.40% of total OI traded per 10s
  const baseFlow = totalOI * (0.0015 + Math.random() * 0.0025);

  // priceBias: tanh-scaled [-1..+1].  +1 = big up move, -1 = big down move.
  const priceBias = Math.tanh(priceChange / 30);

  // ── Call OI ──
  // Uptrend: call buyers +ve (long buildup), downtrend: call writers add (resistance hedge)
  const callFactor = 0.5 + priceBias * 0.35;
  let callDelta = Math.round(baseFlow * callFactor * (0.6 + Math.random() * 0.8));

  // ── Put OI ──
  // Uptrend: put writers add (protection hedge, bullish), downtrend: put buyers +ve (fear)
  const putFactor = 0.5 - priceBias * 0.25;
  let putDelta = Math.round(baseFlow * putFactor * (0.6 + Math.random() * 0.8));

  // Occasional institutional block trade (5% chance) — spikes one side
  if (Math.random() < 0.05) {
    const blockSize = Math.round(totalOI * (0.008 + Math.random() * 0.012));
    if (priceBias > 0) putDelta += blockSize;   // bearish hedge on rally
    else               callDelta += blockSize;  // bearish call against fall
  }

  // Small unwinding probability: OI can decrease (covering)
  if (Math.random() < 0.15) callDelta -= Math.round(baseFlow * 0.2);
  if (Math.random() < 0.15) putDelta  -= Math.round(baseFlow * 0.2);

  return {
    callOI: Math.max(2000000, prevCallOI + callDelta),
    putOI:  Math.max(2000000, prevPutOI  + putDelta),
  };
}

/**
 * Generate realistic mock option chain data centred around a spot price.
 * Used when NSE is unreachable (off-hours, bot-blocked, etc.) so the UI
 * is always populated and looks correct.
 */
function generateMockOptionChain(spotPrice = 24500) {
  const atm = Math.round(spotPrice / 50) * 50;
  const strikes = [];
  for (let i = -10; i <= 10; i++) {
    strikes.push(atm + i * 50);
  }

  const now = new Date();
  const expiryDate = (() => {
    // Next Thursday
    const d = new Date();
    d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  })();

  const data = strikes.map(strike => {
    const distPct = (strike - spotPrice) / spotPrice;
    const ceOI = Math.round(800000 * Math.exp(-15 * Math.pow(distPct - 0.005, 2)) + Math.random() * 100000);
    const peOI = Math.round(800000 * Math.exp(-15 * Math.pow(distPct + 0.005, 2)) + Math.random() * 100000);
    const ceIV = Math.round((18 + Math.abs(distPct) * 200 + Math.random() * 2) * 10) / 10;
    const peIV = Math.round((18 + Math.abs(distPct) * 200 + Math.random() * 2) * 10) / 10;
    const intrinsic = Math.max(0, spotPrice - strike);
    const ceLTP = Math.max(0.5, (strike > spotPrice ? Math.random() * 80 : intrinsic + Math.random() * 50));
    const peLTP = Math.max(0.5, (strike < spotPrice ? Math.random() * 80 : (strike - spotPrice) + Math.random() * 50));

    return {
      strikePrice: strike,
      expiryDate,
      CE: {
        openInterest: ceOI,
        changeinOpenInterest: Math.round((Math.random() - 0.4) * ceOI * 0.1),
        pchangeinOpenInterest: Math.round((Math.random() - 0.4) * 10 * 10) / 10,
        totalTradedVolume: Math.round(ceOI * (0.1 + Math.random() * 0.3)),
        impliedVolatility: ceIV,
        lastPrice: Math.round(ceLTP * 10) / 10,
        bidprice: Math.round((ceLTP - 0.3) * 10) / 10,
        askPrice: Math.round((ceLTP + 0.3) * 10) / 10,
        underlyingValue: spotPrice,
      },
      PE: {
        openInterest: peOI,
        changeinOpenInterest: Math.round((Math.random() - 0.4) * peOI * 0.1),
        pchangeinOpenInterest: Math.round((Math.random() - 0.4) * 10 * 10) / 10,
        totalTradedVolume: Math.round(peOI * (0.1 + Math.random() * 0.3)),
        impliedVolatility: peIV,
        lastPrice: Math.round(peLTP * 10) / 10,
        bidprice: Math.round((peLTP - 0.3) * 10) / 10,
        askPrice: Math.round((peLTP + 0.3) * 10) / 10,
        underlyingValue: spotPrice,
      },
    };
  });

  return {
    records: {
      expiryDates: [expiryDate],
      data,
      timestamp: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      underlyingValue: spotPrice,
    },
    filtered: { data },
  };
}

// ── Main Fetch & Process Cycle ────────────────────────────────────────────────

/**
 * Core function: fetch everything, compute analytics, broadcast to clients
 */
async function fetchAndProcess() {
  try {
    // Check if market is open (9:15 AM - 3:30 PM IST, Mon-Fri)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const ist = new Date(now.getTime() + istOffset);
    const day = ist.getUTCDay();   // 0=Sun, 6=Sat
    const hour = ist.getUTCHours();
    const min = ist.getUTCMinutes();
    const timeInMinutes = hour * 60 + min;
    const marketOpen = 9 * 60 + 15;   // 9:15 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM

    cache.isMarketOpen = day >= 1 && day <= 5 &&
      timeInMinutes >= marketOpen && timeInMinutes <= marketClose;

    // Fetch price data (always available)
    const [priceData, giftNifty] = await Promise.all([
      fetchNiftyPrice(),
      fetchGiftNifty(),
    ]);

    if (priceData) {
      cache.priceData = priceData;
      cache.giftNifty = giftNifty;

      // Save price snapshot to DB
      savePriceSnapshot({
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        close: priceData.price,
        volume: 0,
        vwap: priceData.vwap,
      });
    }

    // Fetch option chain
    let optionChainData = null;
    try {
      const rawData = await fetchNSEOptionChain();
      const parsed = parseOptionChain(rawData);
      const analysis = computeOIAnalysis(parsed, priceData?.price);
      optionChainData = { ...parsed, ...analysis, isMock: false };
      cache.optionChain = optionChainData;
      saveOptionChainSnapshot(optionChainData);
      console.log('[OC] Option chain fetched — strikes:', parsed.strikes?.length ?? 0);
    } catch (err) {
      console.error('[OC] Option chain fetch failed:', err.message);
      // Prefer cached real data; fall back to mock ONCE so UI is always populated.
      // Do NOT regenerate mock on every tick — random OI would flip signals constantly.
      if (!cache.optionChain) {
        console.log('[OC] Using mock option chain data (NSE unavailable)');
        const spot = priceData?.price || 24500;
        const mockRaw = generateMockOptionChain(spot);
        const mockParsed = parseOptionChain(mockRaw);
        const mockAnalysis = computeOIAnalysis(mockParsed, spot);
        cache.optionChain = { ...mockParsed, ...mockAnalysis, isMock: true };
      }
      optionChainData = cache.optionChain;
    }

    // Generate trading signals + OI pattern + trade setup.
    // Runs ALWAYS (market open or closed) so the system can be tested/monitored.
    // Results are tagged with `isSimulation: true` when market is closed.
    if (priceData && optionChainData) {
      const spot = priceData.price;

      // ── Initialise or evolve live OI ───────────────────────────────────────
      if (!cache.liveOI) {
        // Seed from real or mock option chain totals
        const seedCall = optionChainData.totalCallOI || 8000000;
        const seedPut  = optionChainData.totalPutOI  || 8000000;
        cache.liveOI   = { callOI: seedCall, putOI: seedPut };
        cache.prevPrice = spot;
        console.log(`[OI] Live OI initialised — Call: ${(seedCall/1e5).toFixed(1)}L, Put: ${(seedPut/1e5).toFixed(1)}L`);
      } else if (optionChainData.isMock) {
        // Only evolve when using mock data — real NSE data already has live OI
        const priceChange = spot - (cache.prevPrice || spot);
        const evolved = evolveMockOI(cache.liveOI.callOI, cache.liveOI.putOI, priceChange);
        cache.liveOI = evolved;
        console.log(`[OI] Evolved — ΔP:${priceChange.toFixed(1)} Call:${(evolved.callOI/1e5).toFixed(1)}L(${priceChange>0?'+':''}) Put:${(evolved.putOI/1e5).toFixed(1)}L`);
      } else {
        // Real NSE data: use actual parsed totals
        cache.liveOI = {
          callOI: optionChainData.totalCallOI || cache.liveOI.callOI,
          putOI:  optionChainData.totalPutOI  || cache.liveOI.putOI,
        };
      }
      cache.prevPrice = spot;

      // ── Add OI snapshot (feeds pattern detection) ──────────────────────────
      addSnapshot({
        price:        spot,
        totalCallOI:  cache.liveOI.callOI,
        totalPutOI:   cache.liveOI.putOI,
        totalOI:      cache.liveOI.callOI + cache.liveOI.putOI,
      });

      // ── Detect Price+OI buildup pattern ────────────────────────────────────
      const rawPattern = getOIPattern(
        spot,
        cache.liveOI.callOI,
        cache.liveOI.putOI,
      );

      // Multi-cycle confirmation: only elevate pattern if it has persisted ≥ 3 cycles
      if (rawPattern.pattern === cache.lastConfirmedPattern) {
        cache.patternStreak = Math.min(cache.patternStreak + 1, 20);
      } else {
        cache.patternStreak = 1;
        cache.lastConfirmedPattern = rawPattern.pattern;
      }
      const confirmed = cache.patternStreak >= 3;

      cache.oiPattern = {
        ...rawPattern,
        confirmedCycles:  cache.patternStreak,
        isConfirmed:      confirmed,
        isSimulation:     !cache.isMarketOpen,
      };

      // ── Generate trading signals ────────────────────────────────────────────
      // Merge live OI into optionChainData so signal engine sees latest values
      const enrichedChain = {
        ...optionChainData,
        totalCallOI: cache.liveOI.callOI,
        totalPutOI:  cache.liveOI.putOI,
      };
      const signals = generateSignals({
        price: priceData,
        optionChain: enrichedChain,
        isMarketOpen: cache.isMarketOpen,
      });
      cache.signals = signals;

      // ── Generate trade recommendation ──────────────────────────────────────
      const tradeSetup = getTradeSetup({
        price:    spot,
        vwap:     priceData.vwap,
        pcr:      enrichedChain.pcr       || 1,
        maxPain:  enrichedChain.maxPain,
        callWall: enrichedChain.highestCallStrike,
        putWall:  enrichedChain.highestPutStrike,
        oiPattern: cache.oiPattern,
        strikes:   enrichedChain.strikes  || [],
        capital:   10000,
        pivots:    priceData.pivots,
        isSimulation: !cache.isMarketOpen,
      });
      cache.tradeSetup = {
        ...tradeSetup,
        isSimulation: !cache.isMarketOpen,
        patternStreak: cache.patternStreak,
        isConfirmed:   confirmed,
      };

      // Persist new signals (only during real market hours)
      if (cache.isMarketOpen) {
        signals.forEach(sig => { if (sig.isNew) saveSignal(sig); });
      }
    }

    cache.lastFetch = new Date().toISOString();

    // Broadcast complete state to all WebSocket clients
    broadcastToClients({
      type: 'MARKET_UPDATE',
      timestamp: cache.lastFetch,
      isMarketOpen: cache.isMarketOpen,
      price: cache.priceData,
      giftNifty: cache.giftNifty,
      optionChain: cache.optionChain,
      signals: cache.signals,
      oiPattern: cache.oiPattern,
      tradeSetup: cache.tradeSetup,
    });

  } catch (err) {
    console.error('[FETCHER] Cycle error:', err.message);
  }
}

/**
 * Start the background data fetcher.
 * Seeds mock data immediately so the dashboard is never blank,
 * then attempts real data from NSE + Yahoo Finance.
 */
function startDataFetcher() {
  // Seed the cache with mock data RIGHT NOW so WS clients get something immediately
  const mockSpot = 24500;
  const mockRaw = generateMockOptionChain(mockSpot);
  const mockParsed = parseOptionChain(mockRaw);
  const mockAnalysis = computeOIAnalysis(mockParsed, mockSpot);
  const mockPivots = computePivotPoints(mockSpot + 120, mockSpot - 80, mockSpot - 30);
  const nowTs = Date.now();
  cache.priceData = {
    symbol: '^NSEI', price: mockSpot, open: mockSpot - 50,
    high: mockSpot + 120, low: mockSpot - 80, prevClose: mockSpot - 30,
    vwap: mockSpot + 10, pivots: mockPivots,
    candles: Array.from({ length: 50 }, (_, i) => ({
      time: nowTs - (50 - i) * 5 * 60 * 1000,
      open: mockSpot + Math.round((Math.random() - 0.5) * 100),
      high: mockSpot + Math.round(Math.random() * 60 + 10),
      low: mockSpot - Math.round(Math.random() * 60 + 10),
      close: mockSpot + Math.round((Math.random() - 0.5) * 80),
      volume: Math.round(Math.random() * 400000 + 80000),
    })),
    change: 30, changePct: 0.12, timestamp: nowTs, isMock: true,
  };
  cache.optionChain = { ...mockParsed, ...mockAnalysis, isMock: true };
  cache.giftNifty = { price: mockSpot + 20, prevClose: mockSpot - 30, change: 50, changePct: 0.20, direction: 'UP' };
  cache.lastFetch = new Date().toISOString();
  // Seed live OI from mock analysis totals so OI evolution can start immediately
  cache.liveOI = {
    callOI: mockAnalysis.totalCallOI || 8000000,
    putOI:  mockAnalysis.totalPutOI  || 8000000,
  };
  cache.prevPrice = mockSpot;
  console.log('[FETCHER] Mock data seeded — dashboard is live');

  // Try real data after a short delay (don't block startup)
  setTimeout(() => {
    refreshNSESession().then(() => fetchAndProcess());
  }, 500);

  // Fetch every 3 seconds
  cron.schedule('*/3 * * * * *', fetchAndProcess);

  // Cleanup DB daily at midnight
  cron.schedule('0 0 * * *', cleanupOldData);

  // Refresh NSE session every 4 minutes (only if not in backoff)
  cron.schedule('*/4 * * * *', () => {
    if (Date.now() >= nseBackoffUntil) refreshNSESession();
  });
}

/**
 * Get current cache state (used by REST endpoints)
 */
function getCachedData() {
  return { ...cache, oiHistory: oiHistory.slice(-30) };
}

module.exports = { startDataFetcher, getCachedData, fetchNSEOptionChain };
