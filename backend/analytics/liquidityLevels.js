/**
 * Liquidity Levels Detector
 *
 * Identifies price levels where large amounts of stop orders accumulate:
 *
 * 1. Previous Day High / Low (PDH / PDL)
 *    - Most traders place stops just beyond these levels.
 *    - A bounce or rejection here is a high-probability entry zone.
 *    - A clean break through signals genuine momentum.
 *
 * 2. Equal Highs / Equal Lows
 *    - Two or more swing highs/lows at the same price level.
 *    - Retail traders see these as resistance/support.
 *    - Institutional traders see them as liquidity pools (stop hunt targets).
 *
 * 3. Stop Hunt Zones (Liquidity Grabs)
 *    - A brief spike beyond a key level that immediately reverses.
 *    - Classic pattern: price sweeps PDH, takes out stops, then drops sharply.
 *    - High-probability reversal signal when confirmed.
 *
 * 4. Current Day Extremes
 *    - Today's high and low act as first resistance / support.
 *    - Break of these levels confirms directional momentum.
 */

/**
 * Compute all liquidity levels from intraday candle data.
 *
 * @param {OHLCCandle[]} candles         - Today's intraday candles (oldest first)
 * @param {number}       prevDayHigh     - Previous trading day high (from price data)
 * @param {number}       prevDayLow      - Previous trading day low (from price data)
 * @param {number}       spot            - Current NIFTY spot price
 * @returns {LiquidityLevelsResult}
 */
function detectLiquidityLevels(candles, prevDayHigh, prevDayLow, spot) {
  if (!candles || candles.length === 0) {
    return {
      prevDayHigh:  prevDayHigh || null,
      prevDayLow:   prevDayLow  || null,
      todayHigh:    null,
      todayLow:     null,
      equalHighs:   [],
      equalLows:    [],
      stopHunts:    [],
      keyLevels:    [],
      nearestLevel: null,
      summary:      'Insufficient candle data',
    };
  }

  // ── Today's extreme prices ────────────────────────────────────────────────
  const todayHigh = Math.max(...candles.map(c => c.high));
  const todayLow  = Math.min(...candles.map(c => c.low));

  // ── Equal Highs & Equal Lows Detection ───────────────────────────────────
  const TOLERANCE_PCT = 0.0008; // 0.08% tolerance — about 20 pts on NIFTY 25000

  const equalHighs = findEqualLevels(candles, 'high', TOLERANCE_PCT, spot);
  const equalLows  = findEqualLevels(candles, 'low',  TOLERANCE_PCT, spot);

  // ── Stop Hunt Detection ───────────────────────────────────────────────────
  const stopHunts = detectStopHunts(candles, prevDayHigh, prevDayLow, TOLERANCE_PCT);

  // ── Aggregate Key Levels ──────────────────────────────────────────────────
  const keyLevels = buildKeyLevelsList({
    prevDayHigh,
    prevDayLow,
    todayHigh,
    todayLow,
    equalHighs,
    equalLows,
    stopHunts,
    spot,
  });

  // ── Nearest Level to Spot ─────────────────────────────────────────────────
  const nearestLevel = keyLevels
    .filter(l => l.price !== null && l.price !== undefined)
    .reduce((nearest, level) => {
      const dist = Math.abs(level.price - spot);
      return !nearest || dist < nearest.distance
        ? { ...level, distance: dist }
        : nearest;
    }, null);

  return {
    prevDayHigh:  prevDayHigh || null,
    prevDayLow:   prevDayLow  || null,
    todayHigh,
    todayLow,
    equalHighs,
    equalLows,
    stopHunts,
    keyLevels,
    nearestLevel,
    spot,
    summary: buildSummary(spot, prevDayHigh, prevDayLow, todayHigh, todayLow, stopHunts),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Find equal levels in candle data (equal highs or equal lows).
 * Multiple candles touching the same price level = liquidity pool.
 *
 * @param {OHLCCandle[]} candles     - Intraday candles
 * @param {'high'|'low'} field       - Which candle field to check
 * @param {number}       tolerance   - Percentage tolerance for "equal"
 * @param {number}       spot        - Current price (for relevance filtering)
 * @returns {EqualLevel[]}
 */
function findEqualLevels(candles, field, tolerance, spot) {
  if (!candles || candles.length < 3) return [];

  const levels = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const price = candles[i][field];
    if (!price) continue;

    // Check if this is a local extreme (swing high or swing low)
    const isSwingHigh = field === 'high' &&
      candles[i - 1].high <= price && candles[i + 1]?.high <= price;
    const isSwingLow  = field === 'low' &&
      candles[i - 1].low  >= price && candles[i + 1]?.low  >= price;

    if (!isSwingHigh && !isSwingLow) continue;

    // Look for matching levels (within tolerance)
    const matches = [i]; // always include self
    for (let j = i + 2; j < candles.length; j++) {
      const candidate = candles[j][field];
      if (candidate && Math.abs(candidate - price) / price <= tolerance) {
        matches.push(j);
      }
    }

    if (matches.length >= 2) {
      // Check not already captured in a nearby level (deduplicate)
      const alreadyCaptured = levels.some(l =>
        Math.abs(l.price - price) / price <= tolerance * 2
      );

      if (!alreadyCaptured) {
        levels.push({
          price:    parseFloat(price.toFixed(2)),
          type:     field === 'high' ? 'EQUAL_HIGH' : 'EQUAL_LOW',
          label:    field === 'high' ? 'Equal Highs (Stop Hunt Target)' : 'Equal Lows (Stop Hunt Target)',
          count:    matches.length,           // how many times touched
          strength: matches.length >= 3 ? 'STRONG' : 'MODERATE',
          candles:  matches,                  // candle indices
          distance: parseFloat((Math.abs(price - spot)).toFixed(0)),
          bias:     field === 'high' ? 'resistance' : 'support',
        });
      }
    }
  }

  // Sort by distance from spot
  return levels
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5); // top 5 closest equal levels
}

/**
 * Detect stop hunt (liquidity grab) events in candle history.
 * Pattern: price briefly exceeds a key level then closes back inside.
 *
 * @param {OHLCCandle[]} candles
 * @param {number}       pdHigh  - Previous day high
 * @param {number}       pdLow   - Previous day low
 * @param {number}       tolerance
 * @returns {StopHunt[]}
 */
function detectStopHunts(candles, pdHigh, pdLow, tolerance = 0.001) {
  const hunts = [];
  if (!candles || candles.length < 3) return hunts;

  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];
    const next = candles[i + 1];
    if (!c || !next) continue;

    // ── Bullish Stop Hunt (sweep lows then close higher) ───────────────────
    // Price wick below previous candle's low then closed above it
    const prevLow = candles[i - 1].low;
    if (c.low < prevLow * (1 - tolerance) && c.close > prevLow) {
      hunts.push({
        type:     'LOW_SWEEP',
        label:    'Bearish Stop Hunt (Lows swept)',
        sweepAt:  parseFloat(c.low.toFixed(2)),
        closeAt:  parseFloat(c.close.toFixed(2)),
        recovery: parseFloat((c.close - c.low).toFixed(2)),
        candle:   i,
        time:     c.time,
        bias:     'bullish', // price swept lows → weakened hands cleared → reversal up likely
        strength: c.close > c.open ? 'CONFIRMED' : 'WEAK',
      });
    }

    // ── Bearish Stop Hunt (sweep highs then close lower) ───────────────────
    const prevHigh = candles[i - 1].high;
    if (c.high > prevHigh * (1 + tolerance) && c.close < prevHigh) {
      hunts.push({
        type:     'HIGH_SWEEP',
        label:    'Bullish Stop Hunt (Highs swept)',
        sweepAt:  parseFloat(c.high.toFixed(2)),
        closeAt:  parseFloat(c.close.toFixed(2)),
        recovery: parseFloat((c.high - c.close).toFixed(2)),
        candle:   i,
        time:     c.time,
        bias:     'bearish', // price swept highs → weakened long stops cleared → reversal down likely
        strength: c.close < c.open ? 'CONFIRMED' : 'WEAK',
      });
    }

    // ── Previous Day High sweep ────────────────────────────────────────────
    if (pdHigh && c.high > pdHigh && c.close < pdHigh) {
      hunts.push({
        type:      'PDH_SWEEP',
        label:     'PDH Stop Hunt',
        sweepAt:   parseFloat(c.high.toFixed(2)),
        closeAt:   parseFloat(c.close.toFixed(2)),
        recovery:  parseFloat((c.high - c.close).toFixed(2)),
        candle:    i,
        time:      c.time,
        bias:      'bearish', // failed to hold above PDH → likely reversal lower
        strength:  c.close < c.open ? 'CONFIRMED' : 'WEAK',
      });
    }

    // ── Previous Day Low sweep ────────────────────────────────────────────
    if (pdLow && c.low < pdLow && c.close > pdLow) {
      hunts.push({
        type:      'PDL_SWEEP',
        label:     'PDL Stop Hunt',
        sweepAt:   parseFloat(c.low.toFixed(2)),
        closeAt:   parseFloat(c.close.toFixed(2)),
        recovery:  parseFloat((c.close - c.low).toFixed(2)),
        candle:    i,
        time:      c.time,
        bias:      'bullish', // recovered above PDL → likely reversal higher
        strength:  c.close > c.open ? 'CONFIRMED' : 'WEAK',
      });
    }
  }

  // Return most recent confirmed hunts (last 5)
  return hunts
    .filter(h => h.strength === 'CONFIRMED')
    .slice(-5);
}

/**
 * Build a unified sorted list of all key liquidity levels for display.
 */
function buildKeyLevelsList({ prevDayHigh, prevDayLow, todayHigh, todayLow,
                              equalHighs, equalLows, stopHunts, spot }) {
  const levels = [];

  if (prevDayHigh) levels.push({
    price: prevDayHigh, type: 'PDH', label: 'Prev Day High',
    importance: 'HIGH', bias: 'resistance',
    distance: Math.abs(prevDayHigh - spot),
  });

  if (prevDayLow) levels.push({
    price: prevDayLow,  type: 'PDL', label: 'Prev Day Low',
    importance: 'HIGH', bias: 'support',
    distance: Math.abs(prevDayLow - spot),
  });

  if (todayHigh) levels.push({
    price: todayHigh, type: 'TODAY_HIGH', label: 'Today\'s High',
    importance: 'MEDIUM', bias: 'resistance',
    distance: Math.abs(todayHigh - spot),
  });

  if (todayLow) levels.push({
    price: todayLow,  type: 'TODAY_LOW', label: 'Today\'s Low',
    importance: 'MEDIUM', bias: 'support',
    distance: Math.abs(todayLow - spot),
  });

  equalHighs.forEach(l => levels.push({
    price: l.price, type: l.type, label: `${l.label} ×${l.count}`,
    importance: l.strength === 'STRONG' ? 'HIGH' : 'MEDIUM',
    bias: 'resistance', distance: l.distance,
  }));

  equalLows.forEach(l => levels.push({
    price: l.price, type: l.type, label: `${l.label} ×${l.count}`,
    importance: l.strength === 'STRONG' ? 'HIGH' : 'MEDIUM',
    bias: 'support', distance: l.distance,
  }));

  // Recent stop hunt zones act as support/resistance
  stopHunts.slice(-3).forEach(h => levels.push({
    price: h.sweepAt, type: h.type, label: h.label,
    importance: h.strength === 'CONFIRMED' ? 'HIGH' : 'LOW',
    bias: h.bias === 'bullish' ? 'support' : 'resistance',
    distance: Math.abs(h.sweepAt - spot),
    time: h.time,
  }));

  return levels
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12); // top 12 closest levels
}

/**
 * Generate a plain-language summary of the current liquidity situation.
 */
function buildSummary(spot, pdHigh, pdLow, todayHigh, todayLow, stopHunts) {
  const parts = [];

  if (pdHigh && spot > pdHigh) {
    parts.push(`Price broken above PDH (${pdHigh}) — bullish momentum`);
  } else if (pdHigh && Math.abs(spot - pdHigh) < 30) {
    parts.push(`Price testing PDH (${pdHigh}) — watch for rejection or breakout`);
  }

  if (pdLow && spot < pdLow) {
    parts.push(`Price broken below PDL (${pdLow}) — bearish pressure`);
  } else if (pdLow && Math.abs(spot - pdLow) < 30) {
    parts.push(`Price testing PDL (${pdLow}) — watch for bounce or breakdown`);
  }

  const recentHunts = stopHunts.slice(-2);
  if (recentHunts.length > 0) {
    const latest = recentHunts[recentHunts.length - 1];
    parts.push(`Recent ${latest.label} — potential reversal zone near ${latest.sweepAt}`);
  }

  if (parts.length === 0) parts.push('Price in no-man\'s land — monitor PDH/PDL for direction');

  return parts.join('. ');
}

module.exports = { detectLiquidityLevels };
