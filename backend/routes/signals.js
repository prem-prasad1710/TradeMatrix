/**
 * Trading Signals REST API Routes
 */

const express = require('express');
const router = express.Router();
const { getCachedData } = require('../services/dataFetcher');
const { getSignalHistory, getMarketSentiment } = require('../signals/signalEngine');
const { getRecentSignals } = require('../services/database');

// GET /api/signals/current
// Returns currently active signals
router.get('/current', (req, res) => {
  try {
    const { signals, optionChain, priceData } = getCachedData();
    const sentiment = getMarketSentiment(signals);

    res.json({
      success: true,
      data: {
        signals: signals || [],
        sentiment,
        pcr: optionChain?.pcr,
        pcrSentiment: optionChain?.pcrSentiment,
        price: priceData?.price,
        vwap: priceData?.vwap,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/signals/history?limit=50
// Returns historical signal log
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getSignalHistory(limit);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/signals/momentum
// Momentum detector: current buildup signals
router.get('/momentum', (req, res) => {
  try {
    const { optionChain, priceData } = getCachedData();
    if (!optionChain) return res.status(503).json({ success: false, error: 'No data' });

    const price = priceData?.price;
    const strikes = optionChain.strikes || [];

    // Find strikes with significant OI changes
    const significantBuildups = strikes
      .filter(s => Math.abs(s.call.oiChange) > 15000 || Math.abs(s.put.oiChange) > 15000)
      .map(s => ({
        strikePrice: s.strikePrice,
        callOIChange: s.call.oiChange,
        putOIChange: s.put.oiChange,
        callBuildup: s.callBuildup,
        putBuildup: s.putBuildup,
        distanceFromPrice: price ? Math.round(s.strikePrice - price) : null,
      }))
      .sort((a, b) => Math.abs(b.callOIChange + b.putOIChange) - Math.abs(a.callOIChange + a.putOIChange))
      .slice(0, 15);

    res.json({ success: true, data: significantBuildups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/signals/support-resistance
// Computed support and resistance levels
router.get('/support-resistance', (req, res) => {
  try {
    const { optionChain, priceData } = getCachedData();

    const levels = {
      resistances: optionChain?.resistanceLevels || [],
      supports: optionChain?.supportLevels || [],
      maxPain: optionChain?.maxPain,
      highestCallStrike: optionChain?.highestCallStrike,
      highestPutStrike: optionChain?.highestPutStrike,
      pivots: priceData?.pivots,
      dayHigh: priceData?.high,
      dayLow: priceData?.low,
      prevClose: priceData?.prevClose,
    };

    res.json({ success: true, data: levels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
