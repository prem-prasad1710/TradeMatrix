/**
 * Opening Range (OR) Tracker
 *
 * The Opening Range Breakout (ORB) strategy is one of the most reliable
 * intraday setups. It works because:
 *
 * - The first 15 minutes (9:15–9:30 IST) of market trading attract the
 *   maximum institutional and retail participation.
 * - The high and low of this window establish the day's reference range.
 * - A close ABOVE the OR High with volume = strong bullish conviction.
 * - A close BELOW the OR Low with volume = strong bearish conviction.
 *
 * Classic ORB logic:
 *   Entry:    First candle that closes above OR High (bullish) / below OR Low (bearish)
 *   Target:   OR Range × 1.5 projected from breakout point
 *   Stop:     Opposite side of OR, or midpoint
 *
 * Extended range: 9:15–9:45 for a 30-minute OR (more reliable, fewer false breaks).
 */

const MARKET_OPEN_HOUR  = 9;
const MARKET_OPEN_MIN   = 15;
const OR_CLOSE_MIN      = 30; // 9:30 = 15 min OR
const OR_EXTENDED_MIN   = 45; // 9:45 = 30 min OR (more reliable)
const IST_OFFSET_MS     = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Convert a Unix millisecond timestamp to IST time components.
 */
function toIST(timestampMs) {
  const d = new Date(timestampMs + IST_OFFSET_MS);
  return {
    hour:   d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    totalMins: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/**
 * Compute the Opening Range from intraday candles.
 *
 * The OR is determined by all candles that fall within the 9:15–9:30 window.
 *
 * @param {OHLCCandle[]} candles - Intraday OHLC candles with time in Unix ms (UTC)
 * @param {number}       spot   - Current NIFTY spot price
 * @returns {OpeningRangeResult}
 */
function computeOpeningRange(candles, spot) {
  if (!candles || candles.length === 0) {
    return {
      high: null, low: null, mid: null, range: null,
      status: 'NO_DATA',
      label: 'No candle data available',
      extended: null,
      breakout: null,
      score: 0,
    };
  }

  const MARKET_OPEN_TOTAL_MINS = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MIN;
  const OR_CLOSE_TOTAL_MINS    = MARKET_OPEN_HOUR * 60 + OR_CLOSE_MIN;
  const OR_EXT_CLOSE_MINS      = MARKET_OPEN_HOUR * 60 + OR_EXTENDED_MIN;

  // Filter candles inside OR window (9:15 – 9:30)
  const orCandles = candles.filter(c => {
    const t = toIST(c.time);
    return t.totalMins >= MARKET_OPEN_TOTAL_MINS && t.totalMins < OR_CLOSE_TOTAL_MINS;
  });

  // Filter candles inside extended OR window (9:15 – 9:45)
  const orExtCandles = candles.filter(c => {
    const t = toIST(c.time);
    return t.totalMins >= MARKET_OPEN_TOTAL_MINS && t.totalMins < OR_EXT_CLOSE_MINS;
  });

  if (orCandles.length === 0) {
    // Market may not have opened yet, or data is off-hours
    return {
      high: null, low: null, mid: null, range: null,
      status: 'MARKET_NOT_OPEN',
      label: 'Market not yet open or no data for OR window',
      extended: null,
      breakout: null,
      score: 0,
    };
  }

  // ── OR Levels ─────────────────────────────────────────────────────────────
  const orHigh = Math.max(...orCandles.map(c => c.high));
  const orLow  = Math.min(...orCandles.map(c => c.low));
  const orMid  = (orHigh + orLow) / 2;
  const orRange = orHigh - orLow;

  // Extended OR (30 min)
  let extHigh = null, extLow = null, extMid = null, extRange = null;
  if (orExtCandles.length > orCandles.length) {
    extHigh  = Math.max(...orExtCandles.map(c => c.high));
    extLow   = Math.min(...orExtCandles.map(c => c.low));
    extMid   = (extHigh + extLow) / 2;
    extRange = extHigh - extLow;
  }

  // ── Current Status ────────────────────────────────────────────────────────
  let status = 'INSIDE_OR';
  if (spot > orHigh) status = 'ABOVE_OR';
  else if (spot < orLow) status = 'BELOW_OR';

  // ── Breakout Analysis ────────────────────────────────────────────────────
  // Look at candles AFTER the OR window for breakout events
  const postORCandles = candles.filter(c => {
    const t = toIST(c.time);
    return t.totalMins >= OR_CLOSE_TOTAL_MINS;
  });

  const breakout = analyzeBreakout(postORCandles, orHigh, orLow, orRange);

  // ── Project Targets from Breakout ────────────────────────────────────────
  let target1 = null, target2 = null, stop = null;
  if (breakout) {
    if (breakout.direction === 'BULLISH') {
      target1 = parseFloat((orHigh + orRange * 1.0).toFixed(2));
      target2 = parseFloat((orHigh + orRange * 2.0).toFixed(2));
      stop    = parseFloat(orLow.toFixed(2));
    } else if (breakout.direction === 'BEARISH') {
      target1 = parseFloat((orLow - orRange * 1.0).toFixed(2));
      target2 = parseFloat((orLow - orRange * 2.0).toFixed(2));
      stop    = parseFloat(orHigh.toFixed(2));
    }
  }

  // ── OR Scoring (0-100) for signal engine ─────────────────────────────────
  // Wider OR range relative to ATR → less reliable ORB (too wide SL)
  // Tighter OR range → more reliable ORB setup
  const rangePct = spot > 0 ? (orRange / spot) * 100 : 0;
  let score = 0;
  if (breakout) {
    score = breakout.strength === 'STRONG' ? 80 : breakout.strength === 'MODERATE' ? 60 : 40;
    if (rangePct < 0.3) score += 15; // tight OR → better setup
  } else if (spot > orHigh * 0.9999) {
    score = 30; // approaching OR high
  } else if (spot < orLow * 1.0001) {
    score = 30; // approaching OR low
  }

  const label = buildORLabel(status, breakout, orHigh, orLow);

  return {
    high:   parseFloat(orHigh.toFixed(2)),
    low:    parseFloat(orLow.toFixed(2)),
    mid:    parseFloat(orMid.toFixed(2)),
    range:  parseFloat(orRange.toFixed(2)),
    rangePct: parseFloat(rangePct.toFixed(3)),
    status,
    label,
    extended: extHigh !== null ? {
      high: parseFloat(extHigh.toFixed(2)),
      low:  parseFloat(extLow.toFixed(2)),
      mid:  parseFloat(extMid.toFixed(2)),
      range: parseFloat(extRange.toFixed(2)),
    } : null,
    breakout,
    target1,
    target2,
    stop,
    score,
    candleCount: orCandles.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Analyze post-OR candles for breakout events.
 *
 * @param {OHLCCandle[]} postORCandles
 * @param {number}       orHigh
 * @param {number}       orLow
 * @param {number}       orRange
 * @returns {BreakoutEvent | null}
 */
function analyzeBreakout(postORCandles, orHigh, orLow, orRange) {
  if (!postORCandles || postORCandles.length === 0) return null;

  let firstBullBreak = null;
  let firstBearBreak = null;

  for (const c of postORCandles) {
    // Bullish breakout: candle CLOSES above OR High
    if (!firstBullBreak && c.close > orHigh) {
      const penetration = c.close - orHigh;
      const strength = penetration > orRange * 0.5 ? 'STRONG' :
                       penetration > orRange * 0.2 ? 'MODERATE' : 'WEAK';
      firstBullBreak = {
        direction:   'BULLISH',
        breakLevel:  parseFloat(orHigh.toFixed(2)),
        closePrice:  parseFloat(c.close.toFixed(2)),
        penetration: parseFloat(penetration.toFixed(2)),
        time:        c.time,
        strength,
        volume:      c.volume,
        label:       `Bullish ORB: Close ${c.close.toFixed(0)} above ${orHigh.toFixed(0)} (+${penetration.toFixed(0)} pts)`,
      };
    }

    // Bearish breakdown: candle CLOSES below OR Low
    if (!firstBearBreak && c.close < orLow) {
      const penetration = orLow - c.close;
      const strength = penetration > orRange * 0.5 ? 'STRONG' :
                       penetration > orRange * 0.2 ? 'MODERATE' : 'WEAK';
      firstBearBreak = {
        direction:   'BEARISH',
        breakLevel:  parseFloat(orLow.toFixed(2)),
        closePrice:  parseFloat(c.close.toFixed(2)),
        penetration: parseFloat(penetration.toFixed(2)),
        time:        c.time,
        strength,
        volume:      c.volume,
        label:       `Bearish ORB: Close ${c.close.toFixed(0)} below ${orLow.toFixed(0)} (-${penetration.toFixed(0)} pts)`,
      };
    }
  }

  // Return the more recent / stronger breakout
  if (firstBullBreak && firstBearBreak) {
    return firstBullBreak.time > firstBearBreak.time ? firstBullBreak : firstBearBreak;
  }
  return firstBullBreak || firstBearBreak;
}

function buildORLabel(status, breakout, orHigh, orLow) {
  if (breakout) return breakout.label;
  if (status === 'ABOVE_OR') return `Price above OR High (${orHigh.toFixed(0)}) — bullish bias`;
  if (status === 'BELOW_OR') return `Price below OR Low (${orLow.toFixed(0)}) — bearish bias`;
  return `Price inside Opening Range [${orLow.toFixed(0)}–${orHigh.toFixed(0)}] — wait for break`;
}

module.exports = { computeOpeningRange };
