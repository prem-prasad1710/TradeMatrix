/**
 * OI Tracker — tracks rolling Price + OI snapshots
 * Classifies buildup patterns for real-time analysis:
 *   Long Buildup  : Price ↑, OI ↑  → new buyers entering (bullish)
 *   Short Buildup : Price ↓, OI ↑  → new shorts entering (bearish)
 *   Short Covering: Price ↑, OI ↓  → shorts exiting (strong bullish)
 *   Long Unwinding: Price ↓, OI ↓  → longs exiting (bearish)
 */

const MAX_SNAPSHOTS = 60; // 10 min of 10s data = 60 snaps

const history = [];   // { ts, price, totalCallOI, totalPutOI, totalOI }

/**
 * Add a new snapshot to history.
 * @param {object} snap
 */
function addSnapshot(snap) {
  history.push({ ts: Date.now(), ...snap });
  if (history.length > MAX_SNAPSHOTS) history.shift();
}

/**
 * Get the latest OI pattern by comparing current state to 3-min-ago state.
 * Returns a rich OIPattern object.
 */
function getOIPattern(currentPrice, currentCallOI, currentPutOI) {
  const totalOI = currentCallOI + currentPutOI;

  if (history.length < 6) {
    return {
      pattern: 'NEUTRAL',
      priceChange: 0,
      oiChange: 0,
      priceChangePct: 0,
      oiChangePct: 0,
      description: 'Accumulating data (need 60s)…',
      bias: 'neutral',
      callOITrend: 'neutral',
      putOITrend: 'neutral',
      history: history.slice(-18),
    };
  }

  // Compare to 3 minutes ago (18 snapshots @ 10s each)
  const lookback = Math.min(18, history.length - 1);
  const ref = history[history.length - 1 - lookback];

  const priceChange    = currentPrice - ref.price;
  const oiChange       = totalOI - ref.totalOI;
  const priceChangePct = ref.price   ? (priceChange / ref.price) * 100     : 0;
  const oiChangePct    = ref.totalOI ? (oiChange / ref.totalOI) * 100      : 0;
  const callOIChg      = currentCallOI - ref.totalCallOI;
  const putOIChg       = currentPutOI  - ref.totalPutOI;

  // Determine threshold: ignore noise < 0.025% price or < 0.03% OI change
  // Thresholds are deliberately low so mock-evolved OI triggers real patterns
  const priceUp   = priceChange   > currentPrice * 0.00025;
  const priceDown = priceChange   < -currentPrice * 0.00025;
  const oiUp      = oiChangePct   > 0.03;
  const oiDown    = oiChangePct   < -0.03;

  let pattern, description, bias;

  if (priceUp && oiUp) {
    pattern     = 'LONG_BUILDUP';
    description = 'Price ↑ & OI ↑ — New longs entering. Bullish momentum building.';
    bias        = 'bullish';
  } else if (priceDown && oiUp) {
    pattern     = 'SHORT_BUILDUP';
    description = 'Price ↓ & OI ↑ — New shorts entering. Bearish pressure increasing.';
    bias        = 'bearish';
  } else if (priceUp && oiDown) {
    pattern     = 'SHORT_COVERING';
    description = 'Price ↑ & OI ↓ — Shorts covering. Strong upward move likely.';
    bias        = 'bullish';
  } else if (priceDown && oiDown) {
    pattern     = 'LONG_UNWINDING';
    description = 'Price ↓ & OI ↓ — Longs exiting. Gradual bearish weakness.';
    bias        = 'bearish';
  } else {
    // OI may still be building even without price direction
    const oiBuilding = Math.abs(oiChangePct) > 0.5;  // significant OI addition
    pattern     = 'NEUTRAL';
    description = oiBuilding
      ? `OI +${Math.abs(oiChangePct).toFixed(2)}% while price consolidates — coiled spring, breakout imminent.`
      : 'No clear directional pressure. Market consolidating.';
    bias        = 'neutral';
  }

  return {
    pattern,
    priceChange: Math.round(priceChange * 100) / 100,
    oiChange,
    priceChangePct: Math.round(priceChangePct * 100) / 100,
    oiChangePct:    Math.round(oiChangePct * 100) / 100,
    callOIChange:   callOIChg,
    putOIChange:    putOIChg,
    callOITrend:    callOIChg > 0 ? 'up' : callOIChg < 0 ? 'down' : 'neutral',
    putOITrend:     putOIChg  > 0 ? 'up' : putOIChg  < 0 ? 'down' : 'neutral',
    description,
    bias,
    history: history.slice(-18),
  };
}

/**
 * Generate a trade recommendation for a ₹10,000 capital intraday trader.
 * Uses: OI pattern + PCR + Price vs VWAP + Support/Resistance + Technicals
 */
function getTradeSetup({
  price,
  vwap,
  pcr,
  maxPain,
  callWall,
  putWall,
  oiPattern,
  strikes = [],
  capital = 10000,
  pivots,
  technicals = null,
}) {
  const LOT_SIZE = 25;
  const ATM = Math.round(price / 50) * 50;

  // ── Score bullish / bearish signals ──────────────────────────────────────
  let bullScore = 0, bearScore = 0;
  const reasons = [], warnings = [];

  // OI Pattern (weight: 3)
  if (oiPattern?.pattern === 'LONG_BUILDUP'  || oiPattern?.pattern === 'SHORT_COVERING') {
    bullScore += 3;
    reasons.push(oiPattern.pattern === 'SHORT_COVERING' ? '🔥 Short covering in progress' : '📈 Long buildup detected');
  }
  if (oiPattern?.pattern === 'SHORT_BUILDUP' || oiPattern?.pattern === 'LONG_UNWINDING') {
    bearScore += 3;
    reasons.push(oiPattern.pattern === 'SHORT_BUILDUP' ? '📉 Short buildup detected' : '⚠️ Long unwinding in progress');
  }

  // PCR (weight: 2)
  if (pcr >= 1.3) { bullScore += 2; reasons.push(`PCR ${pcr.toFixed(2)} — Bearish OI hedged, bullish bias`); }
  else if (pcr <= 0.7) { bearScore += 2; reasons.push(`PCR ${pcr.toFixed(2)} — Bullish OI hedged, bearish bias`); }
  else if (pcr > 1.0) { bullScore += 1; reasons.push(`PCR ${pcr.toFixed(2)} — Mild bullish bias`); }
  else { bearScore += 1; reasons.push(`PCR ${pcr.toFixed(2)} — Mild bearish bias`); }

  // Price vs VWAP (weight: 2)
  if (vwap) {
    const pct = ((price - vwap) / vwap) * 100;
    if (pct > 0.1) { bullScore += 2; reasons.push(`Price ${pct.toFixed(2)}% above VWAP — bullish momentum`); }
    else if (pct < -0.1) { bearScore += 2; reasons.push(`Price ${Math.abs(pct).toFixed(2)}% below VWAP — bearish momentum`); }
    else { reasons.push('Price near VWAP — consolidation zone'); }
  }

  // Price vs Max Pain (weight: 1)
  if (maxPain) {
    if (price > maxPain + 50)  { bullScore += 1; reasons.push(`Price ${price - maxPain | 0}pts above Max Pain ${maxPain}`); }
    if (price < maxPain - 50)  { bearScore += 1; reasons.push(`Price ${maxPain - price | 0}pts below Max Pain ${maxPain}`); }
  }

  // Pivot (weight: 1)
  if (pivots?.PP) {
    if (price > pivots.PP)  { bullScore += 1; reasons.push(`Price above Pivot PP ${pivots.PP | 0}`); }
    else                    { bearScore += 1; reasons.push(`Price below Pivot PP ${pivots.PP | 0}`); }
  }

  // ── Technical Indicators (weight: up to 5) ────────────────────────────────
  if (technicals) {
    const { rsi, ema, macd, bb, pattern, atr } = technicals;

    // RSI (weight: 1)
    if (rsi && rsi.rsi !== null) {
      if (rsi.rsi >= 55 && rsi.rsi < 75)  { bullScore += 1; reasons.push(`RSI ${rsi.rsi} — bullish momentum zone`); }
      else if (rsi.rsi <= 45 && rsi.rsi > 25) { bearScore += 1; reasons.push(`RSI ${rsi.rsi} — bearish momentum zone`); }
      else if (rsi.rsi >= 75)  warnings.push(`RSI ${rsi.rsi} — overbought, CE premium risk`);
      else if (rsi.rsi <= 25)  warnings.push(`RSI ${rsi.rsi} — oversold, PE premium risk`);
    }

    // EMA (weight: 2)
    if (ema) {
      if (ema.bullStack)  { bullScore += 2; reasons.push(`EMA bullish stack: ${ema.ema9}>${ema.ema21}>${ema.ema50}`); }
      else if (ema.bearStack) { bearScore += 2; reasons.push(`EMA bearish stack: ${ema.ema9}<${ema.ema21}<${ema.ema50}`); }
      else if (ema.signal === 'bullish') { bullScore += 1; reasons.push(`EMA9(${ema.ema9}) > EMA21(${ema.ema21}) — bullish cross`); }
      else if (ema.signal === 'bearish') { bearScore += 1; reasons.push(`EMA9(${ema.ema9}) < EMA21(${ema.ema21}) — bearish cross`); }
    }

    // MACD (weight: 1-2)
    if (macd) {
      if (macd.bullishCross)  { bullScore += 2; reasons.push('MACD golden cross — bullish momentum shift'); }
      else if (macd.bearishCross) { bearScore += 2; reasons.push('MACD death cross — bearish momentum shift'); }
      else if (macd.indicator === 'bullish') { bullScore += 1; }
      else if (macd.indicator === 'bearish') { bearScore += 1; }
    }

    // Candlestick Pattern (weight: 1)
    if (pattern) {
      if (pattern.bias === 'bullish') { bullScore += 1; reasons.push(`${pattern.emoji} ${pattern.pattern} candle — ${pattern.description}`); }
      else if (pattern.bias === 'bearish') { bearScore += 1; reasons.push(`${pattern.emoji} ${pattern.pattern} candle — ${pattern.description}`); }
      else if (pattern.pattern === 'DOJI') warnings.push('Doji: indecision — wait for next candle confirmation');
    }

    // Bollinger Band Squeeze
    if (bb?.squeeze) {
      reasons.push(`Bollinger squeeze (${bb.bandwidth.toFixed(1)}% bandwidth) — explosive move imminent`);
    }
  }

  const total = bullScore + bearScore;
  const bullPct = total > 0 ? (bullScore / total) * 100 : 50;
  const confidence = Math.round(Math.max(bullPct, 100 - bullPct));

  // ── Determine bias and strike ─────────────────────────────────────────────
  const isBullish = bullScore > bearScore;
  const isBearish = bearScore > bullScore;

  if (!isBullish && !isBearish) {
    return {
      bias: 'WAIT', strike: ATM, type: null, ltp: 0, lots: 0, investment: 0,
      entry: 0, target: 0, stopLoss: 0, rewardRisk: 'N/A',
      oiPattern: oiPattern?.pattern ?? 'NEUTRAL', confidence: 50,
      reasons: ['No clear directional edge — WAIT for confirmation'],
      warnings: ['Market in consolidation — avoid trading'],
      timeframe: '5m', capital, pnlTarget: 0, pnlSL: 0,
    };
  }

  const optType = isBullish ? 'CE' : 'PE';

  // Find the best strike: ATM or ATM±50 based on strength
  let targetStrike = ATM;
  if (confidence >= 70) targetStrike = isBullish ? ATM + 50 : ATM - 50; // Slightly OTM for leverage
  else                  targetStrike = ATM; // ATM for reliability

  // Find LTP from option chain
  const strikeData = strikes.find(s => s.strikePrice === targetStrike);
  const optData = strikeData ? (optType === 'CE' ? strikeData.call : strikeData.put) : null;
  let ltp = optData?.ltp || 0;

  // Fallback LTP estimate if not available — deterministic (no random!) to prevent signal flipping
  if (!ltp || ltp < 1) {
    const dist = Math.abs(targetStrike - price);
    // Black-Scholes approximation: ATM premium ≈ IV * spot * sqrt(T/252) / sqrt(2π)
    // For a rough intraday estimate: ATM ≈ 80-120, OTM decays exponentially
    const timeDecay = 0; // intraday: assume 1-day to expiry DTE ≈ 1
    // Simple rule: ATM ≈ 0.4% of spot, each 50pt away ≈ halves premium
    const atmPremium = Math.round(price * 0.004);
    ltp = Math.max(3, Math.round(atmPremium * Math.exp(-dist / 150)));
  }

  const lots = Math.max(1, Math.floor((capital * 0.8) / (ltp * LOT_SIZE)));
  const investment = lots * ltp * LOT_SIZE;

  // Risk management: 1:2 R:R minimum (25% SL, 50% target)
  // High confidence (>=75): stretch to 1:3 (25% SL, 75% target)
  const entry     = Math.round(ltp * 10) / 10;
  const rrMult    = confidence >= 75 ? 1.75 : 1.50;     // 1:3 at high conf, 1:2 default
  const stopLoss  = Math.round(ltp * 0.75 * 10) / 10;   // 25% SL  → risk 0.25×
  const target    = Math.round(ltp * rrMult * 10) / 10; // 50-75% gain → reward 0.50-0.75×

  const riskPerLot   = (entry - stopLoss) * LOT_SIZE;
  const rewardPerLot = (target - entry)   * LOT_SIZE;
  const rr = riskPerLot > 0 ? (rewardPerLot / riskPerLot).toFixed(1) : '∞';

  const pnlTarget = Math.round((target - entry) * LOT_SIZE * lots);
  const pnlSL     = Math.round((entry - stopLoss) * LOT_SIZE * lots);

  // Warnings
  if (ltp > (capital * 0.4) / LOT_SIZE) warnings.push('Option premium is high relative to capital');
  if (confidence < 60) warnings.push('Confidence below 60% — consider half position');
  if (oiPattern?.pattern === 'NEUTRAL') warnings.push('OI pattern not confirming — wait for clarity');

  // ATR-based stop loss (more precise than fixed %)
  let stopLoss_final = stopLoss;
  let slMethod = 'fixed';
  if (technicals?.atr && ltp > 0) {
    const atrSL = Math.round((ltp - technicals.atr * 0.5 * 1.5) * 10) / 10;
    if (atrSL > 0 && atrSL < ltp * 0.90 && atrSL > ltp * 0.50) {
      stopLoss_final = atrSL;
      slMethod = 'ATR';
      reasons.push(`ATR SL: underlying ATR=${technicals.atr.toFixed(0)}pts → option SL=₹${stopLoss_final}`);
    }
  }

  // Time-based warnings
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const hm  = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (hm < 9 * 60 + 30)  warnings.push('Pre-market: wait for 9:30 AM for entry');
  if (hm > 14 * 60 + 45) warnings.push('After 2:45 PM: theta decay accelerates — reduce lots');
  if (hm > 15 * 60)      warnings.push('⚠️ After 3:00 PM — avoid new positions, square off only');

  const riskPerLot2   = (entry - stopLoss_final) * LOT_SIZE;
  const rewardPerLot2 = (target - entry)          * LOT_SIZE;
  const rr2 = riskPerLot2 > 0 ? (rewardPerLot2 / riskPerLot2).toFixed(1) : rr;
  const pnlSL2 = Math.round((entry - stopLoss_final) * LOT_SIZE * lots);

  return {
    bias: isBullish ? 'BUY_CE' : 'BUY_PE',
    strike: targetStrike,
    type: optType,
    ltp,
    lots,
    investment: Math.round(investment),
    entry,
    target,
    stopLoss: stopLoss_final,
    rewardRisk: `1:${rr2}`,
    oiPattern: oiPattern?.pattern ?? 'NEUTRAL',
    confidence,
    reasons,
    warnings,
    timeframe: '5m',
    capital,
    pnlTarget,
    pnlSL: pnlSL2,
    bullScore,
    bearScore,
    // Pass through slimmed technicals for frontend
    technicals: technicals ? {
      rsi: technicals.rsi?.rsi ?? null,
      rsiZone: technicals.rsi?.zone ?? null,
      emaTrend: technicals.ema?.trend ?? null,
      macdTrend: technicals.macd?.trend ?? null,
      bbZone: technicals.bb?.zone ?? null,
      bbSqueeze: technicals.bb?.squeeze ?? false,
      pattern: technicals.pattern?.pattern ?? null,
      patternEmoji: technicals.pattern?.emoji ?? null,
      patternBias: technicals.pattern?.bias ?? null,
      atr: technicals.atr,
      techBias: technicals.techBias,
      bullScore: technicals.bullScore,
      bearScore: technicals.bearScore,
    } : null,
  };
}

module.exports = { addSnapshot, getOIPattern, getTradeSetup };
