/**
 * Option Chain REST API Routes
 */

const express = require('express');
const router = express.Router();
const { getCachedData } = require('../services/dataFetcher');
const { getLatestOptionChain, getOptionChainHistory } = require('../services/database');

// GET /api/option-chain/latest
// Returns the latest analyzed option chain snapshot
router.get('/latest', (req, res) => {
  try {
    const cache = getCachedData();

    if (cache.optionChain) {
      return res.json({
        success: true,
        data: cache.optionChain,
        lastFetch: cache.lastFetch,
        isMarketOpen: cache.isMarketOpen,
      });
    }

    // Fallback to DB if cache not warm
    const dbData = getLatestOptionChain();
    if (dbData) {
      return res.json({ success: true, data: dbData, source: 'db' });
    }

    res.status(503).json({ success: false, error: 'Option chain data not yet available' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/option-chain/strikes
// Returns strikes around ATM (±10 strikes) for heatmap
router.get('/strikes', (req, res) => {
  try {
    const cache = getCachedData();

    if (!cache.optionChain) {
      return res.status(503).json({ success: false, error: 'Data not available yet' });
    }

    const { strikes, underlyingValue, atmStrike } = cache.optionChain;
    const atmIndex = strikes?.findIndex(s => s.strikePrice === atmStrike) || 0;

    // Return ±15 strikes around ATM for heatmap display
    const start = Math.max(0, atmIndex - 15);
    const end = Math.min(strikes?.length || 0, atmIndex + 15);
    const filteredStrikes = strikes?.slice(start, end) || [];

    res.json({
      success: true,
      data: {
        strikes: filteredStrikes,
        underlyingValue,
        atmStrike,
        pcr: cache.optionChain.pcr,
        maxPain: cache.optionChain.maxPain,
        resistanceLevels: cache.optionChain.resistanceLevels,
        supportLevels: cache.optionChain.supportLevels,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/option-chain/oi-summary
// Returns OI summary: highest OI strikes, PCR, max pain
router.get('/oi-summary', (req, res) => {
  try {
    const cache = getCachedData();
    if (!cache.optionChain) return res.status(503).json({ success: false, error: 'No data' });

    const oc = cache.optionChain;
    res.json({
      success: true,
      data: {
        pcr: oc.pcr,
        pcrSentiment: oc.pcrSentiment,
        maxPain: oc.maxPain,
        highestCallOI: oc.highestCallOI,
        highestCallStrike: oc.highestCallStrike,
        highestPutOI: oc.highestPutOI,
        highestPutStrike: oc.highestPutStrike,
        totalCallOI: oc.totalCallOI,
        totalPutOI: oc.totalPutOI,
        resistanceLevels: oc.resistanceLevels,
        supportLevels: oc.supportLevels,
        underlyingValue: oc.underlyingValue,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/option-chain/history?limit=20
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = getOptionChainHistory(Math.min(limit, 100));
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
