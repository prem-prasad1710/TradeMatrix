/**
 * Market Structure Analyzer
 *
 * Detects the underlying price structure of NIFTY intraday movement:
 *
 * 1. TREND DIRECTION
 *    - Uptrend:    Series of Higher Highs (HH) and Higher Lows (HL)
 *    - Downtrend:  Series of Lower Highs (LH) and Lower Lows (LL)
 *    - Sideways:   No consistent sequence of HH/HL or LH/LL
 *
 * 2. BREAK OF STRUCTURE (BOS)
 *    - Bullish BOS: First time price closes ABOVE a previous swing HIGH
 *      → signals potential trend reversal from down to up
 *    - Bearish BOS: First time price closes BELOW a previous swing LOW
 *      → signals potential trend reversal from up to down
 *
 * 3. CHANGE OF CHARACTER (CHoCH)
 *    - Immediate shift from one directional leg to the opposite.
 *    - More aggressive than BOS — often first signal of reversal.
 *
 * 4. CONSOLIDATION ZONES
 *    - Price range where volatility is compressed (candles within narrow range).
 *    - Often precedes an expansion breakout.
 *
 * 5. RANGE EXPANSION
 *    - Candle(s) with significantly above-average range.
 *    - Signals institutional participation or momentum surge.
 *
 * These concepts are core to Smart Money Concepts (SMC) trading used by
 * institutional-style traders.
 */

/**
 * Find swing highs and lows from a candle array.
 * A swing high = local maximum within ±lookback candles.
 * A swing low  = local minimum within ±lookback candles.
 *
 * @param {OHLCCandle[]} candles
 * @param {number}       lookback  - number of candles on each side to compare
 * @returns {{ swingHighs: SwingPoint[], swingLows: SwingPoint[] }}
 */
function findSwingPoints(candles, lookback = 3) {
  const swingHighs = [];
  const swingLows  = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];

    // Swing High: current high > all surrounding candle highs
    const isSwingHigh =
      candles.slice(i - lookback, i).every(x => x.high  <= c.high) &&
      candles.slice(i + 1, i + lookback + 1).every(x => x.high  <= c.high);

    // Swing Low: current low < all surrounding candle lows
    const isSwingLow =
      candles.slice(i - lookback, i).every(x => x.low   >= c.low) &&
      candles.slice(i + 1, i + lookback + 1).every(x => x.low   >= c.low);

    if (isSwingHigh) {
      swingHighs.push({ price: c.high,  index: i, time: c.time, type: 'SWING_HIGH' });
    }
    if (isSwingLow) {
      swingLows.push({ price: c.low,    index: i, time: c.time, type: 'SWING_LOW'  });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Determine trend direction from the sequence of swing highs and lows.
 *
 * Logic:
 *   - Need at least 2 consecutive swing highs + 2 swing lows to classify.
 *   - HH + HL → UPTREND
 *   - LH + LL → DOWNTREND
 *   - Anything else → SIDEWAYS
 *
 * @param {SwingPoint[]} swingHighs
 * @param {SwingPoint[]} swingLows
 * @returns {{ trend: string, strength: string, description: string }}
 */
function detectTrend(swingHighs, swingLows) {
  if (swingHighs.length < 2 || swingLows.length < 2) {
    return { trend: 'SIDEWAYS', strength: 'WEAK', description: 'Insufficient swing points' };
  }

  // Take the last 3 swings of each type to assess recent structure
  const recentHighs = swingHighs.slice(-3);
  const recentLows  = swingLows.slice(-3);

  // Check for HH: each high is higher than the previous
  const hasHH = recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;

  // Check for HL: each low is higher than the previous
  const hasHL = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;

  // Check for LH: each high is lower than the previous
  const hasLH = recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;

  // Check for LL: each low is lower than the previous
  const hasLL = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;

  // Also check extra confirmation (3 points)
  const strongHH = recentHighs.length >= 3 &&
    recentHighs[2].price > recentHighs[1].price && recentHighs[1].price > recentHighs[0].price;
  const strongHL = recentLows.length >= 3 &&
    recentLows[2].price > recentLows[1].price && recentLows[1].price > recentLows[0].price;
  const strongLH = recentHighs.length >= 3 &&
    recentHighs[2].price < recentHighs[1].price && recentHighs[1].price < recentHighs[0].price;
  const strongLL = recentLows.length >= 3 &&
    recentLows[2].price < recentLows[1].price && recentLows[1].price < recentLows[0].price;

  if (strongHH && strongHL) {
    return {
      trend: 'UPTREND', strength: 'STRONG',
      description: 'Strong uptrend: Higher Highs + Higher Lows (3-point confirmation)',
    };
  }
  if (strongLH && strongLL) {
    return {
      trend: 'DOWNTREND', strength: 'STRONG',
      description: 'Strong downtrend: Lower Highs + Lower Lows (3-point confirmation)',
    };
  }
  if (hasHH && hasHL) {
    return {
      trend: 'UPTREND', strength: 'MODERATE',
      description: 'Uptrend: Higher Highs + Higher Lows forming',
    };
  }
  if (hasLH && hasLL) {
    return {
      trend: 'DOWNTREND', strength: 'MODERATE',
      description: 'Downtrend: Lower Highs + Lower Lows forming',
    };
  }

  return {
    trend: 'SIDEWAYS', strength: 'WEAK',
    description: 'No clear trend — mixed swing structure, sideways price action',
  };
}

/**
 * Detect Break of Structure (BOS) events.
 * A BOS occurs when price closes beyond the most recent significant swing point.
 *
 * @param {OHLCCandle[]} candles
 * @param {SwingPoint[]} swingHighs
 * @param {SwingPoint[]} swingLows
 * @returns {BOSEvent[]}
 */
function detectBOS(candles, swingHighs, swingLows) {
  const bosEvents = [];
  if (!candles || candles.length < 10) return bosEvents;

  // Check the last 20 candles for BOS against recent swings
  const recentCandles = candles.slice(-20);
  const lastN         = candles.length;

  // Bullish BOS: close above the most recent swing high that is at least 5 candles back
  const eligibleHighs = swingHighs.filter(sh => sh.index < lastN - 5);
  if (eligibleHighs.length > 0) {
    const mostRecentSwingHigh = eligibleHighs[eligibleHighs.length - 1];
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && lastCandle.close > mostRecentSwingHigh.price) {
      bosEvents.push({
        type:    'BULLISH_BOS',
        label:   '🟢 Bullish BOS',
        price:   mostRecentSwingHigh.price,
        candle:  lastN - 1,
        time:    lastCandle.time,
        description: `Price closed above swing high of ${mostRecentSwingHigh.price.toFixed(0)} — bullish structure break`,
        bias:    'bullish',
        isRecent: true,
      });
    }
  }

  // Bearish BOS: close below the most recent swing low that is at least 5 candles back
  const eligibleLows = swingLows.filter(sl => sl.index < lastN - 5);
  if (eligibleLows.length > 0) {
    const mostRecentSwingLow = eligibleLows[eligibleLows.length - 1];
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && lastCandle.close < mostRecentSwingLow.price) {
      bosEvents.push({
        type:    'BEARISH_BOS',
        label:   '🔴 Bearish BOS',
        price:   mostRecentSwingLow.price,
        candle:  lastN - 1,
        time:    lastCandle.time,
        description: `Price closed below swing low of ${mostRecentSwingLow.price.toFixed(0)} — bearish structure break`,
        bias:    'bearish',
        isRecent: true,
      });
    }
  }

  return bosEvents;
}

/**
 * Detect Change of Character (CHoCH) — first break in the opposite direction
 * to the prevailing trend. More aggressive signal than BOS.
 *
 * @param {string}      currentTrend  - 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'
 * @param {BOSEvent[]}  bosEvents     - Already detected BOS events
 * @returns {CHoCHEvent | null}
 */
function detectCHoCH(currentTrend, bosEvents) {
  if (!bosEvents.length) return null;

  const latest = bosEvents[bosEvents.length - 1];
  if (currentTrend === 'UPTREND' && latest.type === 'BEARISH_BOS') {
    return {
      type:    'BEARISH_CHOCH',
      label:   '⚠️ CHoCH (Bearish)',
      price:   latest.price,
      description: `Structure changed from Uptrend — possible reversal starting`,
      bias:    'bearish',
    };
  }
  if (currentTrend === 'DOWNTREND' && latest.type === 'BULLISH_BOS') {
    return {
      type:    'BULLISH_CHOCH',
      label:   '⚠️ CHoCH (Bullish)',
      price:   latest.price,
      description: `Structure changed from Downtrend — possible reversal starting`,
      bias:    'bullish',
    };
  }

  return null;
}

/**
 * Detect consolidation zones.
 * A consolidation is when the last N candles stay within a narrow range.
 *
 * @param {OHLCCandle[]} candles
 * @param {number}       windowSize      - candles to look back
 * @param {number}       maxRangePct     - max range as % of price for "consolidation"
 * @returns {ConsolidationZone | null}
 */
function detectConsolidation(candles, windowSize = 8, maxRangePct = 0.005) {
  if (!candles || candles.length < windowSize) return null;

  const window = candles.slice(-windowSize);
  const high = Math.max(...window.map(c => c.high));
  const low  = Math.min(...window.map(c => c.low));
  const mid  = (high + low) / 2;
  const rangePct = (high - low) / mid;

  if (rangePct <= maxRangePct) {
    return {
      high:     parseFloat(high.toFixed(2)),
      low:      parseFloat(low.toFixed(2)),
      mid:      parseFloat(mid.toFixed(2)),
      rangePct: parseFloat((rangePct * 100).toFixed(3)),
      candles:  windowSize,
      label:    `Consolidation Zone (${(rangePct * 100).toFixed(2)}% range over ${windowSize} candles)`,
      breakoutLevel: parseFloat(high.toFixed(2)),
      breakdownLevel: parseFloat(low.toFixed(2)),
      isActive: true,
    };
  }

  return null;
}

/**
 * Detect range expansion — candles with significantly above-average range.
 * Signals institutional involvement or momentum surge.
 *
 * @param {OHLCCandle[]} candles
 * @returns {RangeExpansionEvent[]}
 */
function detectRangeExpansion(candles) {
  if (!candles || candles.length < 10) return [];

  // Compute average range of last 20 candles
  const sample  = candles.slice(-20);
  const avgRange = sample.reduce((sum, c) => sum + (c.high - c.low), 0) / sample.length;
  const threshold = avgRange * 2.0; // 2× average = expansion candle

  const expansions = [];
  const recentCandles = candles.slice(-5); // look at last 5 candles

  recentCandles.forEach((c, i) => {
    const range = c.high - c.low;
    if (range >= threshold) {
      expansions.push({
        time:     c.time,
        range:    parseFloat(range.toFixed(2)),
        avgRange: parseFloat(avgRange.toFixed(2)),
        ratio:    parseFloat((range / avgRange).toFixed(2)),
        bias:     c.close > c.open ? 'bullish' : 'bearish',
        label:    `Range Expansion (${(range / avgRange).toFixed(1)}× avg) — ${c.close > c.open ? 'Bullish' : 'Bearish'} impulse`,
        high:     c.high,
        low:      c.low,
        close:    c.close,
      });
    }
  });

  return expansions;
}

/**
 * Main market structure analysis function.
 *
 * @param {OHLCCandle[]} candles - Intraday OHLC candles
 * @param {number}       spot   - Current NIFTY spot price
 * @returns {MarketStructureResult}
 */
function analyzeMarketStructure(candles, spot) {
  if (!candles || candles.length < 10) {
    return {
      trend:          { trend: 'SIDEWAYS', strength: 'WEAK', description: 'Insufficient data' },
      swingHighs:     [],
      swingLows:      [],
      bosEvents:      [],
      choch:          null,
      consolidation:  null,
      rangeExpansion: [],
      summary:        'Need more candle data for structure analysis',
      bias:           'NEUTRAL',
      timestamp:      new Date().toISOString(),
    };
  }

  const { swingHighs, swingLows } = findSwingPoints(candles, 3);
  const trend         = detectTrend(swingHighs, swingLows);
  const bosEvents     = detectBOS(candles, swingHighs, swingLows);
  const choch         = detectCHoCH(trend.trend, bosEvents);
  const consolidation = detectConsolidation(candles);
  const rangeExpansion= detectRangeExpansion(candles);

  // ── Overall structural bias ───────────────────────────────────────────────
  let bias = 'NEUTRAL';
  if (trend.trend === 'UPTREND') bias = 'BULLISH';
  if (trend.trend === 'DOWNTREND') bias = 'BEARISH';
  if (choch?.bias === 'bearish') bias = 'BEARISH'; // CHoCH overrides trend
  if (choch?.bias === 'bullish') bias = 'BULLISH';

  const summary = buildStructureSummary(trend, bosEvents, choch, consolidation, rangeExpansion);

  return {
    trend,
    swingHighs: swingHighs.slice(-5),
    swingLows:  swingLows.slice(-5),
    bosEvents:  bosEvents.slice(-3),
    choch,
    consolidation,
    rangeExpansion: rangeExpansion.slice(-3),
    summary,
    bias,
    trendStrength: trend.strength,
    timestamp: new Date().toISOString(),
  };
}

function buildStructureSummary(trend, bosEvents, choch, consolidation, rangeExpansion) {
  const parts = [];

  parts.push(trend.description);

  if (choch) {
    parts.push(choch.description);
  } else if (bosEvents.length > 0) {
    parts.push(bosEvents[bosEvents.length - 1].description);
  }

  if (consolidation) {
    parts.push(`${consolidation.label} — breakout above ${consolidation.breakoutLevel} or breakdown below ${consolidation.breakdownLevel}`);
  }

  if (rangeExpansion.length > 0) {
    const re = rangeExpansion[rangeExpansion.length - 1];
    parts.push(re.label);
  }

  return parts.join('. ');
}

module.exports = { analyzeMarketStructure };
