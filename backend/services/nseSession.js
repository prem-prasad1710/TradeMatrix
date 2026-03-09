/**
 * NSE Session Manager using Puppeteer + Stealth
 *
 * Uses puppeteer-extra with puppeteer-extra-plugin-stealth to bypass Akamai's
 * JavaScript bot-detection. The option chain data is fetched from INSIDE the
 * browser context so all session cookies are valid when the request is made.
 *
 * The result is cached for 4.5 minutes to avoid launching Chrome every cycle.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
puppeteer.use(StealthPlugin());

const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// If Chrome is not installed, skip the browser approach entirely
const CHROME_AVAILABLE = fs.existsSync(CHROME_PATH);

const OC_API = 'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY';

// Cached raw option-chain JSON and its expiry
let cachedData = null;
let dataExpiry = 0;
let fetching = false;
// Rate-limit browser launches — at most once every 5 minutes
let nextBrowserAllowed = 0;

/**
 * Launch Chrome with stealth, warm up the NSE session, then call the
 * option-chain API FROM INSIDE the browser so Akamai sees a validated request.
 * Returns the raw parsed JSON or throws on failure.
 */
async function fetchOptionChainViaBrowser() {
  if (!CHROME_AVAILABLE) {
    throw new Error('Chrome not available on this server — skipping browser fetch');
  }
  if (fetching) {
    await new Promise(r => setTimeout(r, 500));
    if (cachedData) return cachedData;
    throw new Error('NSE browser fetch in progress');
  }
  // Don't launch Chrome more than once every 5 minutes
  if (Date.now() < nextBrowserAllowed) {
    const waitS = Math.ceil((nextBrowserAllowed - Date.now()) / 1000);
    throw new Error(`NSE browser cooldown (${waitS}s remaining)`);
  }
  fetching = true;
  nextBrowserAllowed = Date.now() + 5 * 60 * 1000;
  console.log(`[NSE][Browser] Launching Chrome at ${CHROME_PATH}...`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ── Step 1: Homepage warm-up ──────────────────────────────────────────────
    await page.goto('https://www.nseindia.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // ── Step 2: Navigate to option-chain and INTERCEPT the page's own API call ──
    // The NSE page's JavaScript automatically calls the option-chain API.
    // We intercept THAT response — it's made by real browser JS, so Akamai
    // treats it as fully validated.
    let interceptedData = null;

    const responseInterceptor = async (response) => {
      if (response.url().includes('option-chain-indices') && response.status() === 200) {
        try {
          const json = await response.json();
          if (json && json.records) {
            interceptedData = json;
          }
        } catch (_) {}
      }
    };
    page.on('response', responseInterceptor);

    await page.goto('https://www.nseindia.com/option-chain', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait up to 20 seconds for the page's own API call to complete
    const deadline = Date.now() + 20000;
    while (!interceptedData && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    page.off('response', responseInterceptor);

    if (!interceptedData) {
      // Fallback: call the API from within the browser context as last resort
      console.log('[NSE][Browser] Page API call not intercepted — trying in-page fetch...');
      const result = await page.evaluate(async (apiUrl) => {
        const resp = await fetch(apiUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.nseindia.com/option-chain',
          },
        });
        const text = await resp.text();
        return {
          status: resp.status,
          snippet: text.slice(0, 200),
          parsed: (() => { try { return JSON.parse(text); } catch (e) { return null; } })(),
        };
      }, OC_API);
      console.log(`[NSE][Browser] In-page fetch: status=${result.status} snippet: ${result.snippet.slice(0, 100)}`);
      if (result.parsed?.records) interceptedData = result.parsed;
    }

    if (!interceptedData) {
      throw new Error('NSE option chain data not available via browser (Akamai IP block active)');
    }

    cachedData = interceptedData;
    dataExpiry = Date.now() + 4.5 * 60 * 1000;
    console.log('[NSE][Browser] Option chain fetched — strikes:', interceptedData.records?.data?.length ?? 0);
    return interceptedData;
  } catch (err) {
    console.error('[NSE][Browser] Fetch failed:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
    fetching = false;
  }
}

/**
 * Returns cached data if still fresh, otherwise triggers a new browser fetch.
 */
async function getOptionChain() {
  if (cachedData && Date.now() < dataExpiry) return cachedData;
  return fetchOptionChainViaBrowser();
}

// Stubs for legacy call-sites
async function refreshNSESession() { return true; }
async function ensureSession() {}
function getCookieString() { return ''; }

module.exports = { refreshNSESession, ensureSession, getCookieString, getOptionChain, CHROME_AVAILABLE };
