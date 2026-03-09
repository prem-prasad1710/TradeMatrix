/**
 * NSE Data Fetcher Service
 *
 * Fetches NIFTY option chain from NSE India API every 10 seconds.
 * NSE uses Akamai bot protection — session is now warmed up via a real
 * headless Chrome browser (puppeteer-core) so the JS challenge is solved.
 *
 * Also fetches NIFTY spot price from Yahoo Finance.
 */

const axios = require('axios');
const https = require('https');
const cron = require('node-cron');
const { parseOptionChain, computeOIAnalysis } = require('../utils/oiParser');

// ── SSL Fix for macOS / corporate proxies ────────────────────────────────────
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Puppeteer-backed NSE session (solves Akamai JS challenge) ─────────────────
const nseSession = require('./nseSession');

const { generateSignals } = require('../signals/signalEngine');
const { computeVWAP, computePivotPoints, computeAllIndicators } = require('../utils/technicals');
const { addSnapshot, getOIPattern, getTradeSetup } = require('../utils/oiTracker');
const { computeGammaExposure } = require('../analytics/gammaExposure');
const { detectLiquidityLevels } = require('../analytics/liquidityLevels');
const { analyzeMarketStructure } = require('../analytics/marketStructure');
const { computeOpeningRange } = require('../analytics/openingRange');
const { fetchFIIDIIData } = require('../analytics/fiiDii');
const { computeSignalScore } = require('../signals/scoringEngine');
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
  gammaExposure: null,
  liquidityLevels: null,
  marketStructure: null,
  openingRange: null,
  fiiDii: null,
  signalScore: null,
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
let consecutiveFailures = 0;
let nseBackoffUntil = 0;         // Don't retry NSE until this timestamp
const NSE_BACKOFF_MS = [0, 30000, 60000, 120000, 300000]; // 0s,30s,1m,2m,5m

// NSE HTTP session — used when Chrome is not available (e.g. on Render)
let nseCookies = '';
let nseSessionExpiry = 0;

async function refreshNSESessionHTTP() {
  try {
    const homeResp = await axios.get('https://www.nseindia.com/', {
      httpsAgent, timeout: 15000, maxRedirects: 5,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
      },
    });
    nseCookies = (homeResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    await new Promise(r => setTimeout(r, 1500));

    const ocResp = await axios.get('https://www.nseindia.com/option-chain', {
      httpsAgent, timeout: 15000, maxRedirects: 5,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.nseindia.com/',
        'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document', 'Cookie': nseCookies,
      },
    });
    const moreCookies = (ocResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    if (moreCookies) nseCookies = `${nseCookies}; ${moreCookies}`;
    nseSessionExpiry = Date.now() + 4 * 60 * 1000;
    console.log('[NSE][HTTP] Session refreshed');
    return true;
  } catch (err) {
    console.warn('[NSE][HTTP] Session refresh failed:', err.message);
    return false;
  }
}

// ── Data Fetching Functions ───────────────────────────────────────────────────

/**
 * Fetch NIFTY option chain.
 * On machines with Chrome: uses Puppeteer stealth browser (bypasses Akamai).
 * On machines without Chrome (e.g. Render): falls back to HTTP warm-up + axios.
 * Implements exponential backoff on repeated failures.
 */
async function fetchNSEOptionChain() {
  if (Date.now() < nseBackoffUntil) {
    const remainS = Math.ceil((nseBackoffUntil - Date.now()) / 1000);
    throw new Error(`NSE backoff active (${remainS}s remaining)`);
  }

  try {
    let data;
    if (nseSession.CHROME_AVAILABLE !== false) {
      // Try browser-based approach first (works locally)
      try {
        data = await nseSession.getOptionChain();
      } catch (browserErr) {
        if (!browserErr.message.includes('cooldown') && !browserErr.message.includes('in progress')) {
          console.warn('[OC] Browser fetch failed, trying HTTP fallback:', browserErr.message);
        }
        // Fall through to HTTP approach
        data = null;
      }
    }

    // HTTP fallback — works on clean IPs (cloud servers, fresh installs)
    if (!data) {
      if (!nseCookies || Date.now() > nseSessionExpiry) await refreshNSESessionHTTP();
      const response = await axios.get(
        'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY',
        { httpsAgent, timeout: 12000, headers: { ...NSE_API_HEADERS, 'Cookie': nseCookies } }
      );
      data = response.data;
    }

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      // Akamai returned {} — force session refresh
      nseCookies = ''; nseSessionExpiry = 0;
      throw new Error('NSE returned empty response (Akamai block)');
    }
    if (!data.records) {
      throw new Error(`Unexpected NSE response keys: ${Object.keys(data).join(',')}`);
    }

    consecutiveFailures = 0;
    nseBackoffUntil = 0;
    return data;
  } catch (err) {
    if (!err.message.includes('backoff') && !err.message.includes('cooldown') && !err.message.includes('in progress')) {
      consecutiveFailures++;
      const backoffIdx = Math.min(consecutiveFailures, NSE_BACKOFF_MS.length - 1);
      nseBackoffUntil = Date.now() + NSE_BACKOFF_MS[backoffIdx];
      if (!err.message.includes('Akamai')) {
        console.error(`[OC] Fetch failed (${consecutiveFailures}x) — backoff ${NSE_BACKOFF_MS[backoffIdx] / 1000}s`);
      }
    }
    throw err;
  }
}

/**
 * Fetch NIFTY spot price.
 * Source priority (first success wins):
 *   1. Yahoo Finance query1 / query2 (fast, 5-min candles)
 *   2. Stooq.com (free, works from cloud IPs, no auth)
 *   3. Last cached price (staleness OK — prevents blank dashboard)
 */
async function fetchNiftyPrice() {
  // ── Source 1: Yahoo Finance ───────────────────────────────────────────────
  const YAHOO_HEADERS = {
    'User-Agent': BROWSER_UA,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  };

  const tryYahoo = async (host) => {
    const url = `https://${host}/v8/finance/chart/%5ENSEI`;
    const response = await axios.get(url, {
      headers: YAHOO_HEADERS,
      params: { interval: '5m', range: '1d', includePrePost: false },
      httpsAgent,
      timeout: 6000,
    });
    return response;
  };

  // ── Source 2: NSE allIndices ────────────────────────────────────────────
  // NSE's own indices API — no session cookie needed, works from cloud IPs
  const tryNSEAllIndices = async () => {
    const response = await axios.get('https://www.nseindia.com/api/allIndices', {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      },
      httpsAgent,
      timeout: 8000,
    });
    const idx = (response.data?.data || []).find(x => x.index === 'NIFTY 50');
    if (!idx || !idx.last) throw new Error('NSE allIndices: no NIFTY 50 data');
    const price    = parseFloat(idx.last);
    const open     = parseFloat(idx.open)          || price;
    const high     = parseFloat(idx.high)          || price;
    const low      = parseFloat(idx.low)           || price;
    const prevClose = parseFloat(idx.previousClose) || price;
    const pivots = computePivotPoints(high, low, prevClose);
    const now = Date.now();
    const existingCandles = (cache.priceData?.candles || []).slice(-77);
    const newCandle = { time: now, open, high, low, close: price, volume: 0 };
    const candles = [...existingCandles, newCandle];
    const vwap = computeVWAP(
      candles.map(c => c.time / 1000),
      { open: candles.map(c => c.open), high: candles.map(c => c.high),
        low: candles.map(c => c.low),   close: candles.map(c => c.close),
        volume: candles.map(c => c.volume || 0) }
    );
    console.log(`[NSE allIndices] Price fetched: ₹${price}`);
    return {
      symbol: '^NSEI', price, open, high, low, prevClose, vwap, pivots, candles,
      change: price - prevClose,
      changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      timestamp: now,
    };
  };

  try {
    let response;
    try {
      response = await tryYahoo('query1.finance.yahoo.com');
    } catch (_) {
      try {
        response = await tryYahoo('query2.finance.yahoo.com');
      } catch (__) {
        // Yahoo Finance blocked from this IP — try NSE allIndices
        console.warn('[Yahoo] Both endpoints failed — trying NSE allIndices...');
        return await tryNSEAllIndices();
      }
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
    // NSE allIndices fallback
    try { return await tryNSEAllIndices(); } catch (nseErr) {
      console.error('[NSE allIndices] Price fetch error:', nseErr.message);
    }
    // Return last known price or a mock so dashboard is not blank
    if (cache.priceData && !cache.priceData.isMock) return { ...cache.priceData, timestamp: Date.now() };
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
 * Fetch GIFT NIFTY proxy — Yahoo Finance with NSE allIndices fallback.
 */
async function fetchGiftNifty() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      },
      params: { interval: '1m', range: '1d' },
      httpsAgent,
      timeout: 6000,
    });

    const meta = response.data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('Yahoo: no meta');

    return {
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose,
      change: meta.regularMarketPrice - (meta.chartPreviousClose || meta.regularMarketPrice),
      changePct: meta.regularMarketChangePercent || 0,
      direction: meta.regularMarketPrice >= (meta.chartPreviousClose || meta.regularMarketPrice) ? 'UP' : 'DOWN',
    };
  } catch (_yahooErr) {
    // NSE allIndices fallback — works from cloud IPs without session cookies
    try {
      const resp = await axios.get('https://www.nseindia.com/api/allIndices', {
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json', 'Referer': 'https://www.nseindia.com/' },
        httpsAgent,
        timeout: 8000,
      });
      const idx = (resp.data?.data || []).find(x => x.index === 'NIFTY 50');
      if (!idx?.last) return null;
      const price = parseFloat(idx.last);
      const prevClose = parseFloat(idx.previousClose) || cache.priceData?.prevClose || price;
      return {
        price,
        prevClose,
        change: price - prevClose,
        changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
        direction: price >= prevClose ? 'UP' : 'DOWN',
      };
    } catch (_) {
      return null;
    }
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

      // ── Patch cache.optionChain with live OI/PCR so frontend always gets fresh data ──
      const livePCR = cache.liveOI.callOI > 0
        ? cache.liveOI.putOI / cache.liveOI.callOI : 1;
      const livePCRSentiment = livePCR >= 1.5 ? 'EXTREMELY_BULLISH'
        : livePCR >= 1.2 ? 'BULLISH'
        : livePCR >= 0.9 ? 'NEUTRAL'
        : livePCR >= 0.7 ? 'BEARISH' : 'EXTREMELY_BEARISH';

      cache.optionChain = {
        ...enrichedChain,
        pcr: parseFloat(livePCR.toFixed(3)),
        pcrSentiment: livePCRSentiment,
      };

      // Compute all technical indicators from candle history
      const candles = priceData.candles || [];
      const technicals = computeAllIndicators(candles);

      const signals = generateSignals({
        price: priceData,
        optionChain: cache.optionChain,  // always live now
        isMarketOpen: cache.isMarketOpen,
        candles,
        technicals,
      });
      cache.signals = signals;

      // ── Generate trade recommendation ──────────────────────────────────────
      const tradeSetup = getTradeSetup({
        price:    spot,
        vwap:     priceData.vwap,
        pcr:      cache.optionChain.pcr       || 1,
        maxPain:  cache.optionChain.maxPain,
        callWall: cache.optionChain.highestCallStrike,
        putWall:  cache.optionChain.highestPutStrike,
        oiPattern: cache.oiPattern,
        strikes:   cache.optionChain.strikes  || [],
        capital:   10000,
        pivots:    priceData.pivots,
        isSimulation: !cache.isMarketOpen,
        technicals,
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

      // ── Extended Analytics (run every cycle) ──────────────────────────────
      try {
        // Gamma Exposure from option chain Greeks approximation
        cache.gammaExposure = computeGammaExposure(cache.optionChain, spot);
      } catch (e) { console.warn('[GEX] Failed:', e.message); }

      try {
        // Liquidity levels: previous day H/L from price data
        const pdHigh = priceData.prevClose ? priceData.high  : null; // estimate from today's high
        const pdLow  = priceData.prevClose ? priceData.low   : null;
        // For real PDH/PDL we use prevClose as approximation when no explicit fields
        cache.liquidityLevels = detectLiquidityLevels(
          candles,
          priceData.prevDayHigh ?? priceData.high,   // PDH (if available)
          priceData.prevDayLow  ?? priceData.low,    // PDL (if available)
          spot
        );
      } catch (e) { console.warn('[LIQ] Failed:', e.message); }

      try {
        cache.marketStructure = analyzeMarketStructure(candles, spot);
      } catch (e) { console.warn('[MS] Failed:', e.message); }

      try {
        cache.openingRange = computeOpeningRange(candles, spot);
      } catch (e) { console.warn('[OR] Failed:', e.message); }

      // FII/DII — fetched with a low TTL (60 min), won't spam NSE
      try {
        cache.fiiDii = await fetchFIIDIIData(nseCookies || nseSession.getCookieString());
      } catch (e) { console.warn('[FII/DII] Fetch skipped:', e.message); }

      // Signal Score — aggregates all analytics into a 0-100 probability
      try {
        cache.signalScore = computeSignalScore({
          priceData:       cache.priceData,
          optionChain:     cache.optionChain,
          oiPattern:       cache.oiPattern,
          technicals,
          openingRange:    cache.openingRange,
          marketStructure: cache.marketStructure,
          liquidityLevels: cache.liquidityLevels,
          gammaExposure:   cache.gammaExposure,
          fiiDii:          cache.fiiDii,
        });
      } catch (e) { console.warn('[SCORE] Failed:', e.message); }
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
      // Extended analytics — new
      gammaExposure:  cache.gammaExposure,
      liquidityLevels: cache.liquidityLevels,
      marketStructure: cache.marketStructure,
      openingRange:   cache.openingRange,
      fiiDii:         cache.fiiDii,
      signalScore:    cache.signalScore,
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

  // On servers without Chrome, warm up the NSE HTTP session at startup
  if (!nseSession.CHROME_AVAILABLE) {
    console.log('[FETCHER] Chrome not found — using HTTP-only mode for NSE');
    refreshNSESessionHTTP().catch(() => {});
    // Re-warm every 4 minutes
    cron.schedule('*/4 * * * *', () => refreshNSESessionHTTP().catch(() => {}));
  }

  // Start the price + analytics fetch loop immediately
  fetchAndProcess();

  // Fetch every 3 seconds
  cron.schedule('*/3 * * * * *', fetchAndProcess);

  // Cleanup DB daily at midnight
  cron.schedule('0 0 * * *', cleanupOldData);
}

/**
 * Get current cache state (used by REST endpoints)
 */
function getCachedData() {
  return { ...cache, oiHistory: oiHistory.slice(-30) };
}

module.exports = { startDataFetcher, getCachedData, fetchNSEOptionChain };
