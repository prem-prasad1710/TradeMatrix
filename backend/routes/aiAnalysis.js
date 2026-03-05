/**
 * AI Analysis Routes — powered by Ollama local LLM
 *
 * GET  /api/ai/status          — Ollama health + available models
 * GET  /api/ai/analyze/stream  — SSE: streaming market analysis (tokens in real-time)
 * POST /api/ai/chat/stream     — SSE: streaming chat reply
 * POST /api/ai/explain         — Non-streaming: quick term explainer
 */

const express = require('express');
const router  = express.Router();
const { getCachedData } = require('../services/dataFetcher');
const {
  isOllamaRunning,
  listModels,
  streamMarketAnalysis,
  streamChat,
  generateMarketAnalysis,
  DEFAULT_MODEL,
} = require('../services/ollamaService');

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function initSSE(res) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders();
}

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const running = await isOllamaRunning();
    const models  = running ? await listModels() : [];
    res.json({
      success: true,
      data: { ollamaRunning: running, models, defaultModel: DEFAULT_MODEL, endpoint: process.env.OLLAMA_URL || 'http://localhost:11434' },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/ai/analyze/stream — SSE streaming analysis ──────────────────────
// Query params: ?model=<name>  &prompt=<custom>
router.get('/analyze/stream', async (req, res) => {
  const running = await isOllamaRunning();
  if (!running) {
    return res.status(503).json({ success: false, error: 'Ollama is not running. Start with: ollama serve' });
  }

  const marketData = getCachedData();
  if (!marketData?.priceData && !marketData?.optionChain) {
    return res.status(503).json({ success: false, error: 'No market data available yet.' });
  }

  initSSE(res);
  sseWrite(res, 'start', { model: req.query.model || DEFAULT_MODEL, ts: new Date().toISOString() });

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  try {
    await streamMarketAnalysis(
      marketData,
      req.query.model || undefined,
      (token) => sseWrite(res, 'token', { text: token }),
      ac.signal,
      req.query.prompt || undefined,
    );
    sseWrite(res, 'done', { ts: new Date().toISOString() });
  } catch (err) {
    if (!ac.signal.aborted) sseWrite(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── POST /api/ai/chat/stream — SSE streaming chat ────────────────────────────
// Body: { messages: [{role, content}], model? }
router.post('/chat/stream', async (req, res) => {
  const running = await isOllamaRunning();
  if (!running) {
    return res.status(503).json({ success: false, error: 'Ollama is not running.' });
  }

  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ success: false, error: 'messages[] is required' });
  }

  const marketData = getCachedData();

  initSSE(res);
  sseWrite(res, 'start', { model: model || DEFAULT_MODEL, ts: new Date().toISOString() });

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  try {
    await streamChat(
      messages,
      marketData,
      model || undefined,
      (token) => sseWrite(res, 'token', { text: token }),
      ac.signal,
    );
    sseWrite(res, 'done', { ts: new Date().toISOString() });
  } catch (err) {
    if (!ac.signal.aborted) sseWrite(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── POST /api/ai/explain — quick one-shot term explainer ─────────────────────
// Body: { term: string, model?: string }
router.post('/explain', async (req, res) => {
  try {
    const running = await isOllamaRunning();
    if (!running) return res.status(503).json({ success: false, error: 'Ollama is not running.' });

    const { term, model } = req.body || {};
    if (!term) return res.status(400).json({ success: false, error: '"term" is required' });

    const marketData = getCachedData();
    const prompt = `Explain "${term}" in 3-4 sentences for a beginner NIFTY options trader. Be specific and practical. Use current market numbers if relevant.`;

    const result = await generateMarketAnalysis(marketData, model, prompt);
    res.json({ success: true, data: { term, explanation: result.analysis, model: result.model } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
