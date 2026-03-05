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

// ── RSI (Relative Strength Index) ────────────────────────────────────────────
/**
 * Compute RSI-14 from a close price array.
 * RSI > 70 = overbought (caution on CE), RSI < 30 = oversold (caution on PE).
 * RSI 40-60 = neutral zone.
 */
function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder's smoothing for remaining candles
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs));
}

/**
 * Get RSI reading with zone label.
 */
function getRSISignal(closes) {
  const rsi = computeRSI(closes);
  if (rsi === null) return { rsi: null, zone: 'UNKNOWN', signal: 'neutral' };
  const zone = rsi >= 70 ? 'OVERBOUGHT' : rsi <= 30 ? 'OVERSOLD' : rsi >= 55 ? 'BULLISH' : rsi <= 45 ? 'BEARISH' : 'NEUTRAL';
  const signal = rsi >= 70 ? 'warning' : rsi <= 30 ? 'warning' : rsi >= 55 ? 'bullish' : rsi <= 45 ? 'bearish' : 'neutral';
  return { rsi, zone, signal };
}

// ── EMA (Exponential Moving Average) ─────────────────────────────────────────
/**
 * Compute EMA for a given period.
 * EMA is faster than SMA; reacts more to recent price changes.
 */
function computeEMA(closes, period) {
  if (!closes || closes.length < period) return null;

  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA seed

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return round(ema);
}

/**
 * Get EMA crossover/stack signals for 9, 21, 50 EMAs.
 * Bullish stack: price > EMA9 > EMA21 > EMA50
 * Bearish stack: price < EMA9 < EMA21 < EMA50
 */
function getEMASignal(closes) {
  if (!closes || closes.length < 50) return null;

  const price = closes[closes.length - 1];
  const ema9  = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema50 = computeEMA(closes, 50);

  if (!ema9 || !ema21 || !ema50) return null;

  const bullStack = price > ema9 && ema9 > ema21 && ema21 > ema50;
  const bearStack = price < ema9 && ema9 < ema21 && ema21 < ema50;
  const bullCross = ema9 > ema21; // fast above slow = bullish
  const bearCross = ema9 < ema21;

  let trend, signal;
  if (bullStack) { trend = 'STRONG_BULLISH'; signal = 'bullish'; }
  else if (bearStack) { trend = 'STRONG_BEARISH'; signal = 'bearish'; }
  else if (bullCross) { trend = 'BULLISH'; signal = 'bullish'; }
  else if (bearCross) { trend = 'BEARISH'; signal = 'bearish'; }
  else { trend = 'NEUTRAL'; signal = 'neutral'; }

  return { ema9, ema21, ema50, price, trend, signal, bullStack, bearStack };
}

// ── MACD ──────────────────────────────────────────────────────────────────────
/**
 * Compute MACD (12,26,9).
 * MACD line = EMA12 - EMA26
 * Signal line = EMA9 of MACD line
 * Histogram = MACD - Signal
 *
 * Bullish: MACD > signal (golden cross), histogram positive and growing.
 * Bearish: MACD < signal (death cross), histogram negative and falling.
 */
function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;

  // Build MACD line series
  const macdSeries = [];
  for (let i = slow - 1; i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    const ema12 = computeEMA(slice, fast);
    const ema26 = computeEMA(slice, slow);
    if (ema12 !== null && ema26 !== null) {
      macdSeries.push(ema12 - ema26);
    }
  }

  if (macdSeries.length < signal) return null;

  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = computeEMA(macdSeries, signal);
  if (signalLine === null) return null;
  const histogram = round(macdLine - signalLine);

  // Previous histogram to detect divergence
  const prevMacdLine = macdSeries[macdSeries.length - 2] ?? macdLine;
  const prevSignal = macdSeries.length >= signal + 1
    ? computeEMA(macdSeries.slice(0, -1), signal)
    : signalLine;
  const prevHistogram = prevSignal !== null ? round(prevMacdLine - prevSignal) : histogram;

  const bullishCross = macdLine > signalLine && prevMacdLine <= (prevSignal ?? macdLine);
  const bearishCross = macdLine < signalLine && prevMacdLine >= (prevSignal ?? macdLine);
  const histGrowing  = histogram > prevHistogram;
  const histFalling  = histogram < prevHistogram;

  let trend, indicator;
  if (bullishCross)                        { trend = 'BULLISH_CROSS';  indicator = 'bullish'; }
  else if (bearishCross)                   { trend = 'BEARISH_CROSS';  indicator = 'bearish'; }
  else if (macdLine > signalLine && histGrowing) { trend = 'BULLISH_MOMENTUM'; indicator = 'bullish'; }
  else if (macdLine < signalLine && histFalling) { trend = 'BEARISH_MOMENTUM'; indicator = 'bearish'; }
  else if (macdLine > signalLine)          { trend = 'BULLISH';        indicator = 'bullish'; }
  else if (macdLine < signalLine)          { trend = 'BEARISH';        indicator = 'bearish'; }
  else                                     { trend = 'NEUTRAL';        indicator = 'neutral'; }

  return {
    macdLine: round(macdLine),
    signalLine: round(signalLine),
    histogram,
    prevHistogram,
    trend,
    indicator,
    bullishCross,
    bearishCross,
    histGrowing,
  };
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
/**
 * Compute Bollinger Bands (20-period, 2 std dev).
 * Price at upper band: overbought / momentum sell.
 * Price at lower band: oversold / potential long.
 * Band squeeze (low width): explosive move coming.
 */
function computeBollingerBands(closes, period = 20, multiplier = 2) {
  if (!closes || closes.length < period) return null;

  const slice = closes.slice(-period);
  const sma   = slice.reduce((a, b) => a + b, 0) / period;
  const sqDiff = slice.map(c => Math.pow(c - sma, 2));
  const stdDev = Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / period);

  const upper = round(sma + multiplier * stdDev);
  const lower = round(sma - multiplier * stdDev);
  const mid   = round(sma);
  const price = closes[closes.length - 1];
  const bandwidth = round(((upper - lower) / mid) * 100); // %
  const pctB = round((price - lower) / (upper - lower) * 100); // 0=at lower, 100=at upper

  let zone;
  if (price >= upper)       zone = 'UPPER_BAND';    // overbought
  else if (price <= lower)  zone = 'LOWER_BAND';    // oversold
  else if (pctB >= 60)      zone = 'UPPER_HALF';
  else if (pctB <= 40)      zone = 'LOWER_HALF';
  else                      zone = 'MIDDLE';

  const squeeze = bandwidth < 2.0; // very tight band = breakout forming

  return { upper, mid, lower, bandwidth, pctB, zone, squeeze, price };
}

// ── ATR (Average True Range) ──────────────────────────────────────────────────
/**
 * Compute ATR-14 for dynamic stop-loss calculation.
 * ATR measures average volatility. Use 1.5×ATR for stop-loss from entry.
 */
function computeATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high  = candles[i].high;
    const low   = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  // Wilder smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return round(atr);
}

// ── Candlestick Pattern Detection ────────────────────────────────────────────
/**
 * Detect key reversal and continuation candlestick patterns.
 * Returns the strongest pattern for the last completed candle.
 */
function detectCandlestickPattern(candles) {
  if (!candles || candles.length < 3) return null;

  const c  = candles[candles.length - 1]; // current
  const p1 = candles[candles.length - 2]; // previous
  const p2 = candles[candles.length - 3]; // 2 back

  const body   = Math.abs(c.close - c.open);
  const range  = c.high - c.low;
  const wick   = range - body;
  const isGreen = c.close > c.open;
  const isRed   = c.close < c.open;
  const bodyPct = range > 0 ? body / range : 0;

  // Doji: body < 10% of range
  if (bodyPct < 0.08 && range > 0) {
    return { pattern: 'DOJI', description: 'Indecision candle — market pausing. Wait for next candle direction.', bias: 'neutral', emoji: '⚖️' };
  }

  // Hammer (bullish): small body at top, long lower wick (≥2× body), at day low area
  const lowerWick = isGreen ? c.open - c.low : c.close - c.low;
  const upperWick = isGreen ? c.high - c.close : c.high - c.open;
  if (lowerWick >= 2 * body && upperWick < 0.3 * body && c.low <= p1.low && c.low <= p2.low) {
    return { pattern: 'HAMMER', description: 'Bullish Hammer — buyers defending lows. Strong reversal signal.', bias: 'bullish', emoji: '🔨' };
  }

  // Shooting Star (bearish): small body at bottom, long upper wick, at day high area
  if (upperWick >= 2 * body && lowerWick < 0.3 * body && c.high >= p1.high && c.high >= p2.high) {
    return { pattern: 'SHOOTING_STAR', description: 'Shooting Star — sellers at highs. Bearish reversal likely.', bias: 'bearish', emoji: '💫' };
  }

  // Bullish Engulfing: current green candle engulfs previous red
  if (isGreen && p1.close < p1.open && c.open <= p1.close && c.close >= p1.open) {
    return { pattern: 'BULLISH_ENGULFING', description: 'Bullish Engulfing — strong buyers taking control. High probability long.', bias: 'bullish', emoji: '🟢' };
  }

  // Bearish Engulfing: current red candle engulfs previous green
  if (isRed && p1.close > p1.open && c.open >= p1.close && c.close <= p1.open) {
    return { pattern: 'BEARISH_ENGULFING', description: 'Bearish Engulfing — sellers dominating. High probability short.', bias: 'bearish', emoji: '🔴' };
  }

  // Marubozu (strong trend candle): body > 85% of range
  if (bodyPct > 0.85) {
    if (isGreen) return { pattern: 'BULLISH_MARUBOZU', description: 'Bullish Marubozu — full control by buyers. Strong trend continuation.', bias: 'bullish', emoji: '📶' };
    return { pattern: 'BEARISH_MARUBOZU', description: 'Bearish Marubozu — sellers in full control. Trend continuation expected.', bias: 'bearish', emoji: '📉' };
  }

  // Three White Soldiers / Three Black Crows
  if (candles.length >= 4) {
    const p3 = candles[candles.length - 4];
    const allGreen = c.close > c.open && p1.close > p1.open && p2.close > p2.open;
    const allRising = c.close > p1.close && p1.close > p2.close;
    const allRed    = c.close < c.open && p1.close < p1.open && p2.close < p2.open;
    const allFalling = c.close < p1.close && p1.close < p2.close;

    if (allGreen && allRising) return { pattern: 'THREE_WHITE_SOLDIERS', description: '3 consecutive bullish candles — strong uptrend in progress.', bias: 'bullish', emoji: '🪖' };
    if (allRed && allFalling)  return { pattern: 'THREE_BLACK_CROWS', description: '3 consecutive bearish candles — strong downtrend. Avoid longs.', bias: 'bearish', emoji: '🦅' };
  }

  // Inside Bar: price consolidating inside previous candle range
  if (c.high <= p1.high && c.low >= p1.low && bodyPct > 0.2) {
    return { pattern: 'INSIDE_BAR', description: 'Inside Bar — consolidation. Breakout of previous candle range will set direction.', bias: 'neutral', emoji: '📦' };
  }

  return null; // No significant pattern
}

/**
 * Compute full technical indicator suite from candle data.
 * Returns a unified object consumed by the signal engine.
 */
function computeAllIndicators(candles) {
  if (!candles || candles.length < 15) return null;

  const closes  = candles.map(c => c.close);
  const rsiData = getRSISignal(closes);
  const emaData = getEMASignal(closes);
  const macd    = computeMACD(closes);
  const bb      = computeBollingerBands(closes);
  const atr     = computeATR(candles);
  const pattern = detectCandlestickPattern(candles);

  // Overall technical bias score (-4 to +4)
  let bullScore = 0;
  let bearScore = 0;

  // RSI contribution
  if (rsiData.rsi !== null) {
    if (rsiData.rsi > 60 && rsiData.rsi < 75) bullScore += 1; // momentum without OB
    else if (rsiData.rsi < 40 && rsiData.rsi > 25) bearScore += 1;
    else if (rsiData.rsi >= 75) { /* overbought — skip CE */ }
    else if (rsiData.rsi <= 25) { /* oversold — skip PE */ }
  }

  // EMA contribution
  if (emaData) {
    if (emaData.signal === 'bullish') bullScore += 1;
    else if (emaData.signal === 'bearish') bearScore += 1;
    if (emaData.bullStack) bullScore += 1;
    else if (emaData.bearStack) bearScore += 1;
  }

  // MACD contribution
  if (macd) {
    if (macd.indicator === 'bullish') bullScore += 1;
    else if (macd.indicator === 'bearish') bearScore += 1;
    if (macd.bullishCross) bullScore += 1;
    if (macd.bearishCross) bearScore += 1;
  }

  // Candlestick contribution
  if (pattern) {
    if (pattern.bias === 'bullish') bullScore += 1;
    else if (pattern.bias === 'bearish') bearScore += 1;
  }

  const techBias = bullScore > bearScore ? 'bullish'
    : bearScore > bullScore ? 'bearish'
    : 'neutral';

  return {
    rsi: rsiData,
    ema: emaData,
    macd,
    bb,
    atr,
    pattern,
    bullScore,
    bearScore,
    techBias,
  };
}

module.exports = {
  computeVWAP,
  computeVWAPSeries,
  computePivotPoints,
  computeCamarillaPivots,
  findSwingLevels,
  getVWAPPosition,
  // New exports
  computeRSI,
  getRSISignal,
  computeEMA,
  getEMASignal,
  computeMACD,
  computeBollingerBands,
  computeATR,
  detectCandlestickPattern,
  computeAllIndicators,
};
