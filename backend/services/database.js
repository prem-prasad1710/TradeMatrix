/**
 * SQLite Database Service
 * Caches option chain snapshots and price data locally
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/nifty.db');

let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // Ensure data directory exists
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      db = new Database(DB_PATH);

      // Enable WAL mode for better concurrent read performance
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');

      // ── Create tables ──────────────────────────────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS option_chain_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          underlying_value REAL,
          pcr REAL,
          max_pain REAL,
          highest_call_oi INTEGER,
          highest_call_strike REAL,
          highest_put_oi INTEGER,
          highest_put_strike REAL,
          total_call_oi INTEGER,
          total_put_oi INTEGER,
          raw_json TEXT
        );

        CREATE TABLE IF NOT EXISTS price_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume INTEGER,
          vwap REAL
        );

        CREATE TABLE IF NOT EXISTS signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          signal_type TEXT NOT NULL,
          signal_label TEXT NOT NULL,
          confidence REAL,
          metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_oc_timestamp ON option_chain_snapshots(timestamp);
        CREATE INDEX IF NOT EXISTS idx_price_timestamp ON price_snapshots(timestamp);
        CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
      `);

      resolve(db);
    } catch (err) {
      reject(err);
    }
  });
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ── Option Chain Operations ──────────────────────────────────────────────────

function saveOptionChainSnapshot(data) {
  const stmt = getDb().prepare(`
    INSERT INTO option_chain_snapshots
      (timestamp, underlying_value, pcr, max_pain, highest_call_oi, highest_call_strike,
       highest_put_oi, highest_put_strike, total_call_oi, total_put_oi, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    new Date().toISOString(),
    data.underlyingValue,
    data.pcr,
    data.maxPain,
    data.highestCallOI,
    data.highestCallStrike,
    data.highestPutOI,
    data.highestPutStrike,
    data.totalCallOI,
    data.totalPutOI,
    JSON.stringify(data.strikes?.slice(0, 30)) // Store top 30 strikes only
  );
}

function getLatestOptionChain() {
  return getDb()
    .prepare('SELECT * FROM option_chain_snapshots ORDER BY id DESC LIMIT 1')
    .get();
}

function getOptionChainHistory(limit = 20) {
  return getDb()
    .prepare('SELECT * FROM option_chain_snapshots ORDER BY id DESC LIMIT ?')
    .all(limit);
}

// ── Price Operations ──────────────────────────────────────────────────────────

function savePriceSnapshot(data) {
  const stmt = getDb().prepare(`
    INSERT INTO price_snapshots (timestamp, open, high, low, close, volume, vwap)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    new Date().toISOString(),
    data.open, data.high, data.low, data.close, data.volume, data.vwap
  );
}

function getPriceHistory(limit = 100) {
  return getDb()
    .prepare('SELECT * FROM price_snapshots ORDER BY id DESC LIMIT ?')
    .all(limit)
    .reverse();
}

// ── Signal Operations ─────────────────────────────────────────────────────────

function saveSignal(signal) {
  const stmt = getDb().prepare(`
    INSERT INTO signals (timestamp, signal_type, signal_label, confidence, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    new Date().toISOString(),
    signal.type,
    signal.label,
    signal.confidence,
    JSON.stringify(signal.metadata || {})
  );
}

function getRecentSignals(limit = 50) {
  return getDb()
    .prepare('SELECT * FROM signals ORDER BY id DESC LIMIT ?')
    .all(limit);
}

// Cleanup old data older than 1 day to keep DB small
function cleanupOldData() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare('DELETE FROM option_chain_snapshots WHERE timestamp < ?').run(oneDayAgo);
  getDb().prepare('DELETE FROM price_snapshots WHERE timestamp < ?').run(oneDayAgo);
  getDb().prepare('DELETE FROM signals WHERE timestamp < ?').run(oneDayAgo);
}

module.exports = {
  initDatabase,
  getDb,
  saveOptionChainSnapshot,
  getLatestOptionChain,
  getOptionChainHistory,
  savePriceSnapshot,
  getPriceHistory,
  saveSignal,
  getRecentSignals,
  cleanupOldData,
};
