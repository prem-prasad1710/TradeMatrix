/**
 * Technical Analysis Utilities
 *
 * Provides:
 *   - VWAP (Volume Weighted Average Price)
 *   - Pivot Points (Standard, Camarilla)
 *   - Support/Resistance levels
 *   - Simple momentum indicators
 */

/**
 * Compute VWAP (Volume Weighted Average Price) from intraday OHLCV data.
 * 
 * VWAP = Σ(Typical Price × Volume) / Σ(Volume)
 * Typical Price = (High + Low + Close) / 3
 * 
 * VWAP is the benchmark: price above = bullish, price below = bearish.
 */
function computeVWAP(timestamps, ohlcv) {
  if (!timestamps || timestamps.length === 0) return null;

  let cumulativeTPV = 0;  // Typical Price × Volume
  let cumulativeVolume = 0;

  timestamps.forEach((ts, i) => {
    const high = ohlcv.high?.[i];
    const low = ohlcv.low?.[i];
    const close = ohlcv.close?.[i];
    const volume = ohlcv.volume?.[i];

    if (high == null || low == null || close == null || !volume) return;

    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
  });

  if (cumulativeVolume === 0) return null;
  return parseFloat((cumulativeTPV / cumulativeVolume).toFixed(2));
}

/**
 * Compute VWAP series (one VWAP value per candle) for charting.
 * Returns array of { time, vwap } points.
 */
function computeVWAPSeries(timestamps, ohlcv) {
  const series = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  timestamps.forEach((ts, i) => {
    const high = ohlcv.high?.[i];
    const low = ohlcv.low?.[i];
    const close = ohlcv.close?.[i];
    const volume = ohlcv.volume?.[i];

    if (high == null || low == null || close == null || !volume) return;

    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;

    series.push({
      time: ts * 1000,
      vwap: parseFloat((cumulativeTPV / cumulativeVolume).toFixed(2)),
    });
  });

  return series;
}

/**
 * Compute Standard Pivot Points.
 * Used by institutional traders to determine key levels.
 *
 * Formulas:
 *   PP  = (High + Low + Close) / 3
 *   R1  = 2*PP - Low
 *   R2  = PP + (High - Low)
 *   R3  = High + 2*(PP - Low)
 *   S1  = 2*PP - High
 *   S2  = PP - (High - Low)
 *   S3  = Low - 2*(High - PP)
 */
function computePivotPoints(high, low, close) {
  if (!high || !low || !close) return null;

  const PP = (high + low + close) / 3;
  const range = high - low;

  return {
    PP: round(PP),
    R1: round(2 * PP - low),
    R2: round(PP + range),
    R3: round(high + 2 * (PP - low)),
    S1: round(2 * PP - high),
    S2: round(PP - range),
    S3: round(low - 2 * (high - PP)),
  };
}

/**
 * Compute Camarilla Pivot Points.
 * More accurate for intraday trading — levels are tighter and more respected.
 *
 * H4/L4: Key breakout/breakdown levels
 * H3/L3: Most respected intraday levels
 */
function computeCamarillaPivots(high, low, close) {
  if (!high || !low || !close) return null;
  const range = high - low;

  return {
    H4: round(close + range * 1.1 / 2),
    H3: round(close + range * 1.1 / 4),
    H2: round(close + range * 1.1 / 6),
    H1: round(close + range * 1.1 / 12),
    L1: round(close - range * 1.1 / 12),
    L2: round(close - range * 1.1 / 6),
    L3: round(close - range * 1.1 / 4),
    L4: round(close - range * 1.1 / 2),
  };
}

/**
 * Identify key support/resistance from price history.
 * Finds swing highs and swing lows within the last N candles.
 */
function findSwingLevels(candles, lookback = 5) {
  if (!candles || candles.length < lookback * 2 + 1) return { supports: [], resistances: [] };

  const supports = [];
  const resistances = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    const leftCandles = candles.slice(i - lookback, i);
    const rightCandles = candles.slice(i + 1, i + lookback + 1);

    // Swing high: current high is higher than all surrounding candles
    const isSwingHigh = leftCandles.every(c => c.high <= current.high) &&
      rightCandles.every(c => c.high <= current.high);

    // Swing low: current low is lower than all surrounding candles
    const isSwingLow = leftCandles.every(c => c.low >= current.low) &&
      rightCandles.every(c => c.low >= current.low);

    if (isSwingHigh) resistances.push({ level: current.high, time: current.time, strength: lookback });
    if (isSwingLow) supports.push({ level: current.low, time: current.time, strength: lookback });
  }

  // Deduplicate levels within 0.2% of each other
  return {
    supports: deduplicateLevels(supports),
    resistances: deduplicateLevels(resistances),
  };
}

/**
 * Merge price levels that are very close to each other.
 * Prevents cluttering the chart with multiple near-identical levels.
 */
function deduplicateLevels(levels, threshold = 0.002) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const merged = [];

  sorted.forEach(level => {
    const last = merged[merged.length - 1];
    if (!last || Math.abs(level.level - last.level) / last.level > threshold) {
      merged.push(level);
    } else {
      // Merge by taking the stronger level
      if (level.strength > last.strength) {
        merged[merged.length - 1] = level;
      }
    }
  });

  return merged.slice(-5); // Return top 5 most recent
}

/**
 * Determine if price is above/below VWAP and by how much (in points and %).
 */
function getVWAPPosition(price, vwap) {
  if (!vwap) return { position: 'UNKNOWN', diff: 0, diffPct: 0 };

  const diff = price - vwap;
  const diffPct = (diff / vwap) * 100;

  return {
    position: diff >= 0 ? 'ABOVE' : 'BELOW',
    diff: round(diff),
    diffPct: parseFloat(diffPct.toFixed(3)),
  };
}

function round(val) {
  return parseFloat(val.toFixed(2));
}

module.exports = {
  computeVWAP,
  computeVWAPSeries,
  computePivotPoints,
  computeCamarillaPivots,
  findSwingLevels,
  getVWAPPosition,
};
