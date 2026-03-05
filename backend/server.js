/**
 * Nifty Options Intelligence Dashboard - Main Backend Server
 * Handles REST API + WebSocket for real-time option chain data
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { initWebSocketServer } = require('./services/websocket');
const { startDataFetcher } = require('./services/dataFetcher');
const { initDatabase } = require('./services/database');

const optionChainRoutes = require('./routes/optionChain');
const marketDataRoutes = require('./routes/marketData');
const signalsRoutes = require('./routes/signals');
const aiAnalysisRoutes = require('./routes/aiAnalysis');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// Rate limiting - generous for trading use case
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300,
  message: { error: 'Too many requests, slow down.' },
});
app.use('/api', limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/option-chain', optionChainRoutes);
app.use('/api/market', marketDataRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/ai', aiAnalysisRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    // Initialize SQLite database
    await initDatabase();
    console.log('[DB] Database initialized');

    // Initialize WebSocket server (shares HTTP server)
    initWebSocketServer(server);
    console.log('[WS] WebSocket server ready');

    // Start background data fetcher (polls NSE every 10 seconds)
    startDataFetcher();
    console.log('[FETCHER] Data fetcher started');

    // Start HTTP server
    // Log Ollama status
    const { isOllamaRunning, listModels } = require('./services/ollamaService');
    const ollamaUp = await isOllamaRunning();
    if (ollamaUp) {
      const models = await listModels();
      console.log(`[OLLAMA] Running ✓  Available models: ${models.join(', ') || 'none — run: ollama pull mistral'}`);
    } else {
      console.log('[OLLAMA] Not running — AI analysis disabled. Start with: ollama serve');
    }

    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════╗
║  Nifty Options Intelligence Backend  ║
║  http://localhost:${PORT}               ║
║  WebSocket: ws://localhost:${PORT}      ║
║  AI (Ollama): ${ollamaUp ? '✓ Active           ' : '✗ Offline          '} ║
╚══════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('[FATAL] Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();

module.exports = app;
