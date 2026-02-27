/**
 * Market Data REST API Routes
 */

const express = require('express');
const router = express.Router();
const { getCachedData } = require('../services/dataFetcher');
const { getPriceHistory } = require('../services/database');

// GET /api/market/snapshot
// Complete market snapshot: price + gift nifty + sentiment
router.get('/snapshot', (req, res) => {
  try {
    const cache = getCachedData();
    res.json({
      success: true,
      data: {
        nifty: cache.priceData,
        giftNifty: cache.giftNifty,
        isMarketOpen: cache.isMarketOpen,
        lastFetch: cache.lastFetch,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/price
// Just the current NIFTY price
router.get('/price', (req, res) => {
  try {
    const { priceData } = getCachedData();
    if (!priceData) return res.status(503).json({ success: false, error: 'Price data not available' });
    res.json({ success: true, data: priceData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/candles
// Returns OHLC candles for charting
router.get('/candles', (req, res) => {
  try {
    const { priceData } = getCachedData();
    if (!priceData?.candles) return res.status(503).json({ success: false, error: 'Candle data not available' });

    res.json({
      success: true,
      data: {
        candles: priceData.candles,
        vwap: priceData.vwap,
        pivots: priceData.pivots,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/price-history?limit=100
// Historical price data from DB
router.get('/price-history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = getPriceHistory(Math.min(limit, 500));
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
