/**
 * Ollama Local LLM Service
 *
 * Integrates with a locally running Ollama instance to provide:
 *  - Real-time AI market analysis using live NIFTY data
 *  - Conversational Q&A about current market conditions
 *  - Trade setup explanations in plain language
 *
 * Ollama must be running locally: https://ollama.ai
 * Default endpoint: http://localhost:11434
 *
 * Recommended models (pull before use):
 *   ollama pull mistral        (fast, good for trading analysis)
 *   ollama pull llama3.2       (balanced speed/quality)
 *   ollama pull deepseek-r1:7b (good reasoning)
 */

const axios = require('axios');
const http  = require('http');
const https = require('https');
const { URL } = require('url');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL   = process.env.OLLAMA_MODEL || 'mistral';
const REQUEST_TIMEOUT = 60_000; // 60s — LLMs can be slow on CPU

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * Returns true if Ollama is reachable.
 */
async function isOllamaRunning() {
  try {
    await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns list of locally available model names.
 */
async function listModels() {
  try {
    const { data } = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds a structured system prompt that gives the model full market context.
 * Called every time fresh context is available.
 */
function buildSystemPrompt() {
  return `You are an expert Indian stock market analyst specialising in NIFTY 50 options trading.
You analyse real-time option chain data, price action, technical indicators, and open interest (OI) patterns.
You help intraday traders — especially those with small capital (₹10,000) — make informed decisions.

RULES:
- Always base your analysis on the live market data provided in the user message.
- Be concise and actionable. Use bullet points where possible.
- Mention specific price levels, strikes, and PCR values from the data.
- Always include a risk disclaimer: "This is analytical commentary, not investment advice."
- Use INR (₹) for prices. Format large OI numbers as lakhs (e.g. 12.5L).
- If the market is closed (simulation mode), clearly state that.`;
}

/**
 * Converts live market snapshot from getCachedData() into a structured
 * text block the LLM can reason about.
 */
function buildMarketContext(marketData) {
  const { priceData, optionChain, signals, tradeSetup, oiPattern } = marketData || {};

  const lines = [];

  // ── Price ──────────────────────────────────────────────────────────────────
  if (priceData) {
    const { price, vwap, change, changePct, high, low, open, prevClose } = priceData;
    lines.push('=== NIFTY SPOT PRICE ===');
    lines.push(`Current: ₹${price?.toFixed(2)}`);
    lines.push(`VWAP: ₹${vwap?.toFixed(2) ?? 'N/A'}`);
    lines.push(`Change: ${change?.toFixed(2)} (${changePct?.toFixed(2)}%)`);
    lines.push(`Day Range: ₹${low?.toFixed(2)} – ₹${high?.toFixed(2)}`);
    lines.push(`Open: ₹${open?.toFixed(2)}  Prev Close: ₹${prevClose?.toFixed(2)}`);
    if (priceData.pivots) {
      const { PP, R1, R2, S1, S2 } = priceData.pivots;
      lines.push(`Pivot Points: PP=${PP?.toFixed(0)} | R1=${R1?.toFixed(0)} R2=${R2?.toFixed(0)} | S1=${S1?.toFixed(0)} S2=${S2?.toFixed(0)}`);
    }
    lines.push('');
  }

  // ── Option Chain ──────────────────────────────────────────────────────────
  if (optionChain) {
    const {
      pcr, pcrSentiment, maxPain, atmStrike,
      totalCallOI, totalPutOI,
      highestCallStrike, highestPutStrike,
      atmIV, ivSkew, ivSkewLabel,
      straddlePrice,
      top5CallWalls = [], top5PutWalls = [],
    } = optionChain;

    lines.push('=== OPTION CHAIN ANALYSIS ===');
    lines.push(`ATM Strike: ${atmStrike}`);
    lines.push(`PCR: ${pcr?.toFixed(3)} (${pcrSentiment})`);
    lines.push(`Max Pain: ₹${maxPain}`);
    lines.push(`Total Call OI: ${(totalCallOI / 1e5).toFixed(2)}L | Total Put OI: ${(totalPutOI / 1e5).toFixed(2)}L`);
    lines.push(`Highest Call OI at: ${highestCallStrike} (resistance)`);
    lines.push(`Highest Put OI at: ${highestPutStrike} (support)`);
    if (atmIV) lines.push(`ATM IV: ${atmIV?.toFixed(2)}%`);
    if (ivSkew) lines.push(`IV Skew: ${ivSkew?.toFixed(2)} (${ivSkewLabel})`);
    if (straddlePrice) lines.push(`Straddle Price: ₹${straddlePrice?.toFixed(2)}`);

    if (top5CallWalls.length) {
      lines.push(`Top Call Walls (resistance): ${top5CallWalls.map(w => `${w.strike}(${(w.oi / 1e5).toFixed(1)}L)`).join(', ')}`);
    }
    if (top5PutWalls.length) {
      lines.push(`Top Put Walls (support): ${top5PutWalls.map(w => `${w.strike}(${(w.oi / 1e5).toFixed(1)}L)`).join(', ')}`);
    }
    lines.push('');
  }

  // ── OI Pattern ────────────────────────────────────────────────────────────
  if (oiPattern) {
    lines.push('=== OI BUILDUP PATTERN ===');
    lines.push(`Pattern: ${oiPattern.pattern} (${oiPattern.bias})`);
    lines.push(`Description: ${oiPattern.description}`);
    lines.push(`Price Change (5m): ${oiPattern.priceChange?.toFixed(1)} pts (${oiPattern.priceChangePct?.toFixed(2)}%)`);
    lines.push(`OI Change (5m): ${(oiPattern.oiChange / 1e5)?.toFixed(2)}L (${oiPattern.oiChangePct?.toFixed(2)}%)`);
    if (oiPattern.isSimulation) lines.push('⚠️  Market is CLOSED — simulation mode active');
    if (oiPattern.isConfirmed) lines.push(`Pattern confirmed for ${oiPattern.confirmedCycles} consecutive cycles`);
    lines.push('');
  }

  // ── Active Signals ────────────────────────────────────────────────────────
  if (signals?.length) {
    lines.push('=== ACTIVE TRADING SIGNALS ===');
    signals.slice(0, 8).forEach(s => {
      lines.push(`[${s.indicator?.toUpperCase()}] ${s.label} (Confidence: ${s.confidence}%) — ${s.description}`);
    });
    lines.push('');
  }

  // ── Trade Setup ───────────────────────────────────────────────────────────
  if (tradeSetup && tradeSetup.bias !== 'WAIT') {
    const ts = tradeSetup;
    lines.push('=== SYSTEM TRADE SETUP ===');
    lines.push(`Bias: ${ts.bias}  |  Strike: ${ts.strike}${ts.type}  |  LTP: ₹${ts.ltp}`);
    lines.push(`Entry: ₹${ts.entry}  |  Target: ₹${ts.target}  |  SL: ₹${ts.stopLoss}`);
    lines.push(`Lots: ${ts.lots} (₹${ts.investment} capital)  |  R:R = ${ts.rewardRisk}`);
    lines.push(`P&L Target: +₹${ts.pnlTarget}  |  P&L SL: -₹${ts.pnlSL}`);
    lines.push(`Confidence: ${ts.confidence}%`);
    if (ts.reasons?.length) lines.push(`Reasons: ${ts.reasons.join('; ')}`);
    if (ts.warnings?.length) lines.push(`Warnings: ${ts.warnings.join('; ')}`);
  } else if (tradeSetup?.bias === 'WAIT') {
    lines.push('=== SYSTEM TRADE SETUP ===');
    lines.push('Bias: WAIT — No clear setup currently. Reasons: ' + (tradeSetup.reasons?.join('; ') || 'N/A'));
  }

  return lines.join('\n');
}

// ── Streaming helper ─────────────────────────────────────────────────────────

/**
 * Streams an Ollama API call, calling onToken(text) for every generated token.
 * Uses Node's native http/https so we can honour AbortSignal without axios.
 *
 * @param {object}   payload   - JSON body to POST to Ollama
 * @param {string}   path      - Ollama API path, e.g. '/api/generate'
 * @param {function} onToken   - called with each text fragment as it arrives
 * @param {AbortSignal} [signal] - optional signal to cancel the request
 */
function streamOllama(payload, path, onToken, signal) {
  return new Promise((resolve, reject) => {
    const base = new URL(OLLAMA_BASE_URL);
    const lib  = base.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);

    // Prevent double-settle (resolve/reject can only fire once)
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = lib.request({
      hostname : base.hostname,
      port     : parseInt(base.port, 10) || (base.protocol === 'https:' ? 443 : 80),
      path,
      method   : 'POST',
      headers  : {
        'Content-Type'   : 'application/json',
        'Content-Length' : Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';

      res.on('data', (chunk) => {
        if (signal?.aborted) return;
        buf += chunk.toString();
        // Ollama streams one JSON object per line (NDJSON)
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete trailing fragment
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            // /api/generate → obj.response; /api/chat → obj.message.content
            const token = obj.response ?? obj.message?.content ?? '';
            if (token) onToken(token);
            if (obj.done) { settle(resolve); return; }
          } catch { /* ignore malformed line */ }
        }
      });

      res.on('end', () => {
        // Flush any remaining buffer fragment
        if (buf.trim()) {
          try {
            const obj = JSON.parse(buf);
            const token = obj.response ?? obj.message?.content ?? '';
            if (token) onToken(token);
          } catch { /* ignore */ }
        }
        settle(resolve);
      });

      res.on('error', (err) => settle(reject, err));
    });

    // Treat ECONNRESET from req.destroy() as a clean end, not an error
    req.on('error', (err) => {
      if (signal?.aborted || err.code === 'ECONNRESET') return settle(resolve);
      settle(reject, err);
    });

    // AbortSignal support — destroy the socket; the error handler above swallows it
    const onAbort = () => { req.destroy(); settle(resolve); };
    if (signal) {
      if (signal.aborted) { req.destroy(); return settle(resolve); }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    req.write(body);
    req.end();
  });
}

/**
 * Stream a market analysis. Calls onToken for each text fragment.
 */
async function streamMarketAnalysis(marketData, model = DEFAULT_MODEL, onToken, signal, customPrompt = null) {
  const context = buildMarketContext(marketData);
  const userPrompt = customPrompt
    ? `${customPrompt}\n\nCurrent Market Data:\n${context}`
    : `Please provide a comprehensive market analysis based on the following live NIFTY data.
Include: (1) overall market bias, (2) key support/resistance levels, (3) option chain insights,
(4) what the OI buildup pattern signals, (5) active signals interpretation,
(6) a brief trade suggestion if conditions are favourable.\n\nCurrent Market Data:\n${context}`;

  await streamOllama(
    {
      model,
      system  : buildSystemPrompt(),
      prompt  : userPrompt,
      stream  : true,
      options : { temperature: 0.3, top_p: 0.9, num_predict: 800 },
    },
    '/api/generate',
    onToken,
    signal,
  );
}

/**
 * Stream a chat reply. Calls onToken for each text fragment.
 */
async function streamChat(messages, marketData, model = DEFAULT_MODEL, onToken, signal) {
  const context = buildMarketContext(marketData);

  const contextMessage = {
    role    : 'user',
    content : `[LIVE MARKET CONTEXT — updated every 10s]\n${context}\n\n[END OF MARKET DATA]\nYou can now answer my questions about this market data.`,
  };
  const contextAck = {
    role    : 'assistant',
    content : 'Understood. I have the latest NIFTY market data loaded. What would you like to know?',
  };

  await streamOllama(
    {
      model,
      system   : buildSystemPrompt(),
      messages : [contextMessage, contextAck, ...messages],
      stream   : true,
      options  : { temperature: 0.4, top_p: 0.9, num_predict: 500 },
    },
    '/api/chat',
    onToken,
    signal,
  );
}

// ── Ollama API calls (non-streaming) ─────────────────────────────────────────

/**
 * Generate a one-shot market analysis using /api/generate.
 * Returns the full analysis text.
 */
async function generateMarketAnalysis(marketData, model = DEFAULT_MODEL, customPrompt = null) {
  const context = buildMarketContext(marketData);
  const userPrompt = customPrompt
    ? `${customPrompt}\n\nCurrent Market Data:\n${context}`
    : `Please provide a comprehensive market analysis based on the following live NIFTY data. 
Include: (1) overall market bias, (2) key support/resistance levels, (3) option chain insights, 
(4) what the OI buildup pattern signals, (5) active signals interpretation, 
(6) a brief trade suggestion if conditions are favourable.\n\nCurrent Market Data:\n${context}`;

  const response = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model,
      system: buildSystemPrompt(),
      prompt: userPrompt,
      stream: false,
      options: {
        temperature: 0.3,   // low temp for factual financial analysis
        top_p: 0.9,
        num_predict: 800,   // ~600-800 token response
      },
    },
    { timeout: REQUEST_TIMEOUT }
  );

  return {
    analysis: response.data.response,
    model: response.data.model,
    evalDuration: response.data.eval_duration,
    promptTokens: response.data.prompt_eval_count,
    responseTokens: response.data.eval_count,
  };
}

/**
 * Multi-turn chat with persistent market context injected as the first message.
 * `messages` is an array of { role: 'user'|'assistant', content: string }.
 */
async function chatWithContext(messages, marketData, model = DEFAULT_MODEL) {
  const context = buildMarketContext(marketData);

  // Prepend a system-level context message so the model always has live data
  const contextMessage = {
    role: 'user',
    content: `[LIVE MARKET CONTEXT — updated every 10s]\n${context}\n\n[END OF MARKET DATA]\nYou can now answer my questions about this market data.`,
  };
  const contextAck = {
    role: 'assistant',
    content: 'Understood. I have the latest NIFTY market data loaded. What would you like to know?',
  };

  const fullMessages = [contextMessage, contextAck, ...messages];

  const response = await axios.post(
    `${OLLAMA_BASE_URL}/api/chat`,
    {
      model,
      system: buildSystemPrompt(),
      messages: fullMessages,
      stream: false,
      options: {
        temperature: 0.4,
        top_p: 0.9,
        num_predict: 500,
      },
    },
    { timeout: REQUEST_TIMEOUT }
  );

  return {
    reply: response.data.message?.content,
    model: response.data.model,
    evalDuration: response.data.eval_duration,
  };
}

module.exports = {
  isOllamaRunning,
  listModels,
  generateMarketAnalysis,
  chatWithContext,
  streamMarketAnalysis,
  streamChat,
  buildMarketContext,
  DEFAULT_MODEL,
};
