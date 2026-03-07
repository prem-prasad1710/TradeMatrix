/**
 * Analytics REST API Routes
 *
 * Exposes all extended analytical modules:
 *   GET /api/analytics/gamma        — Gamma Exposure profile
 *   GET /api/analytics/structure    — Market Structure (BOS, trend, consolidation)
 *   GET /api/analytics/liquidity    — Liquidity levels (PDH/PDL, equal H/L, stop hunts)
 *   GET /api/analytics/opening-range — Opening Range Breakout status
 *   GET /api/analytics/fii-dii      — FII/DII institutional flow
 *   GET /api/analytics/score        — Signal probability score (0-100)
 *   GET /api/analytics/all          — All analytics in one call
 */

const express = require('express');
const router  = express.Router();
const { getCachedData } = require('../services/dataFetcher');

// GET /api/analytics/gamma
router.get('/gamma', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.gammaExposure) {
      return res.status(503).json({ success: false, error: 'Gamma data not yet computed' });
    }
    res.json({ success: true, data: cache.gammaExposure });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/structure
router.get('/structure', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.marketStructure) {
      return res.status(503).json({ success: false, error: 'Market structure not yet computed' });
    }
    res.json({ success: true, data: cache.marketStructure });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/liquidity
router.get('/liquidity', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.liquidityLevels) {
      return res.status(503).json({ success: false, error: 'Liquidity levels not yet computed' });
    }
    res.json({ success: true, data: cache.liquidityLevels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/opening-range
router.get('/opening-range', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.openingRange) {
      return res.status(503).json({ success: false, error: 'Opening range not yet computed' });
    }
    res.json({ success: true, data: cache.openingRange });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/fii-dii
router.get('/fii-dii', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.fiiDii) {
      return res.status(503).json({ success: false, error: 'FII/DII data not yet available' });
    }
    res.json({ success: true, data: cache.fiiDii });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/score
router.get('/score', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.signalScore) {
      return res.status(503).json({ success: false, error: 'Signal score not yet computed' });
    }
    res.json({ success: true, data: cache.signalScore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/all
// Returns all analytics in a single response (efficient for initial page load)
router.get('/all', (req, res) => {
  try {
    const cache = getCachedData();
    res.json({
      success: true,
      data: {
        gammaExposure:  cache.gammaExposure  || null,
        marketStructure: cache.marketStructure || null,
        liquidityLevels: cache.liquidityLevels || null,
        openingRange:   cache.openingRange   || null,
        fiiDii:         cache.fiiDii         || null,
        signalScore:    cache.signalScore    || null,
        timestamp:      cache.lastFetch,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
