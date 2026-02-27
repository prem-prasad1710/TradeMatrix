/**
 * Signal Engine
 *
 * Generates actionable trading signals based on:
 *   1. NIFTY price vs VWAP
 *   2. Option chain OI data (PCR, buildup, wall detection)
 *   3. Max pain deviation
 *   4. Momentum indicators
 *   5. Price + OI 4-pattern analysis (Long Buildup, Short Buildup,
 *      Short Covering, Long Unwinding)
 *   6. Smart trade setup for ₹10k capital
 */

const { getVWAPPosition } = require('../utils/technicals');

// Track previous signals to avoid duplicates and detect NEW signals
const signalHistory = [];
const MAX_HISTORY = 100;

const LOT_SIZE = 25;    // NIFTY lot size (25 since Jan 2025)
const CAPITAL = 10000;  // trader's capital

// ── OI Pattern Detection ──────────────────────────────────────────────────────

/**
 * Detect the 4 canonical Price+OI patterns using rolling OI snapshots.
 * Compares current state vs 5-min average (≈30 snapshots at 10s intervals).
 *
 * Long Buildup:   Price↑ + OI↑  → bullish (new longs entering)
 * Short Buildup:  Price↓ + OI↑  → bearish (new shorts entering)
 * Short Covering: Price↑ + OI↓  → strong bullish (shorts capitulating)
 * Long Unwinding: Price↓ + OI↓  → bearish (longs exiting)
 */
function detectOIPattern(currentPrice, currentTotalOI, oiHistory) {
  const MIN_SNAPSHOTS = 6; // at least 1 minute of data
  if (!oiHistory || oiHistory.length < MIN_SNAPSHOTS) {
    return {
      pattern: 'NEUTRAL',
      priceChange: 0,
      oiChange: 0,
      priceChangePct: 0,
      oiChangePct: 0,
      description: 'Insufficient data — warming up',
      bias: 'neutral',
    };
  }

  // Look back ~5 min (30 snapshots × 10s = 300s)
  const lookback = Math.min(30, oiHistory.length - 1);
  const prev = oiHistory[oiHistory.length - 1 - lookback];

  const priceChange = currentPrice - prev.price;
  const oiChange = currentTotalOI - prev.totalOI;
  const priceChangePct = (priceChange / prev.price) * 100;
  const oiChangePct = prev.totalOI > 0 ? (oiChange / prev.totalOI) * 100 : 0;

  // Significant threshold: >5 pts price, >25k OI
  const priceUp = priceChange > 5;
  const priceDown = priceChange < -5;
  const oiUp = oiChange > 25000;
  const oiDown = oiChange < -25000;

  let pattern, description, bias;

  if (priceUp && oiUp) {
    pattern = 'LONG_BUILDUP';
    description = `Price +${priceChange.toFixed(0)} pts + OI +${(oiChange / 1e5).toFixed(2)}L — New longs entering`;
    bias = 'bullish';
  } else if (priceDown && oiUp) {
    pattern = 'SHORT_BUILDUP';
    description = `Price ${priceChange.toFixed(0)} pts + OI +${(oiChange / 1e5).toFixed(2)}L — New shorts entering`;
    bias = 'bearish';
  } else if (priceUp && oiDown) {
    pattern = 'SHORT_COVERING';
    description = `Price +${priceChange.toFixed(0)} pts + OI ${(oiChange / 1e5).toFixed(2)}L — Shorts covering fast`;
    bias = 'bullish';
  } else if (priceDown && oiDown) {
    pattern = 'LONG_UNWINDING';
    description = `Price ${priceChange.toFixed(0)} pts + OI ${(oiChange / 1e5).toFixed(2)}L — Longs exiting`;
    bias = 'bearish';
  } else {
    pattern = 'NEUTRAL';
    description = `Price Δ${priceChange.toFixed(0)}pts, OI Δ${(oiChange / 1e5).toFixed(2)}L — Sideways`;
    bias = 'neutral';
  }

  return { pattern, priceChange, oiChange, priceChangePct, oiChangePct, description, bias };
}

// ── Trade Setup Generator ─────────────────────────────────────────────────────

/**
 * Generate a specific trade recommendation for a ₹10k capital intraday trader.
 * - Selects CE or PE based on bias + OI pattern
 * - Finds the affordable strike (ATM or 1 OTM) within ₹10k budget
 * - Computes entry, target (+40%), stop loss (-28%), R:R ratio
 * - Explains WHY this setup is valid
 */
function generateTradeSetup(price, optionChain, oiPattern, signals) {
  if (!price || !optionChain || !oiPattern) {
    return { bias: 'WAIT', reasons: ['Waiting for data'], warnings: ['System warming up'], lots: 0, confidence: 0 };
  }

  const spot = price.price;
  const vwap = price.vwap || spot;
  const pcr = optionChain.pcr || 1;
  const aboveVWAP = spot > vwap;
  const strikes = optionChain.strikes || [];

  const bullishSignals = signals.filter(s => s.indicator === 'bullish').length;
  const bearishSignals = signals.filter(s => s.indicator === 'bearish').length;

  const reasons = [];
  const warnings = [];
  let bias = 'WAIT';
  let confidence = 0;

  // ── Determine bias from OI pattern + signals ──────────────────────────────
  const bullishPatterns = ['LONG_BUILDUP', 'SHORT_COVERING'];
  const bearishPatterns = ['SHORT_BUILDUP', 'LONG_UNWINDING'];

  if (bullishPatterns.includes(oiPattern.pattern)) {
    if (aboveVWAP || bullishSignals > bearishSignals) {
      bias = 'BUY_CE';
      confidence += 30;
      if (oiPattern.pattern === 'SHORT_COVERING') {
        reasons.push('Short Covering detected — shorts are panicking, premium explosion likely');
        confidence += 20;
      } else {
        reasons.push('Long Buildup confirmed — fresh longs entering at current price');
        confidence += 15;
      }
    }
  } else if (bearishPatterns.includes(oiPattern.pattern)) {
    if (!aboveVWAP || bearishSignals > bullishSignals) {
      bias = 'BUY_PE';
      confidence += 30;
      if (oiPattern.pattern === 'SHORT_BUILDUP') {
        reasons.push('Short Buildup — fresh shorts piling in, bearish pressure increasing');
        confidence += 15;
      } else {
        reasons.push('Long Unwinding — bulls exiting positions, selling pressure expected');
        confidence += 10;
      }
    }
  }

  // VWAP confluence
  if (bias === 'BUY_CE' && aboveVWAP) {
    reasons.push(`Price ₹${spot.toFixed(0)} is ABOVE VWAP ₹${vwap.toFixed(0)} — trend is bullish`);
    confidence += 15;
  } else if (bias === 'BUY_PE' && !aboveVWAP) {
    reasons.push(`Price ₹${spot.toFixed(0)} is BELOW VWAP ₹${vwap.toFixed(0)} — trend is bearish`);
    confidence += 15;
  }

  // PCR confirmation
  if (bias === 'BUY_CE' && pcr > 1.0) {
    reasons.push(`PCR ${pcr.toFixed(2)} > 1.0 — more put writing = bullish support`);
    confidence += 10;
  } else if (bias === 'BUY_PE' && pcr < 0.9) {
    reasons.push(`PCR ${pcr.toFixed(2)} < 0.9 — more call writing = bearish resistance`);
    confidence += 10;
  }

  // Wall confirmation
  if (bias === 'BUY_CE' && optionChain.highestPutStrike && spot > optionChain.highestPutStrike) {
    reasons.push(`Put Wall at ₹${optionChain.highestPutStrike} acting as support below current price`);
    confidence += 5;
  } else if (bias === 'BUY_PE' && optionChain.highestCallStrike && spot < optionChain.highestCallStrike) {
    reasons.push(`Call Wall at ₹${optionChain.highestCallStrike} is capping upside — resistance confirmed`);
    confidence += 5;
  }

  // Strong signal count
  if (bias !== 'WAIT' && (bullishSignals + bearishSignals) > 2) {
    reasons.push(`${Math.max(bullishSignals, bearishSignals)} confluence signals agree on this direction`);
    confidence += 5;
  }

  // No trade conditions
  if (bias === 'WAIT') {
    return {
      bias: 'WAIT',
      strike: 0, type: null, ltp: 0, lots: 0, investment: 0,
      entry: 0, target: 0, stopLoss: 0, rewardRisk: '-',
      oiPattern: oiPattern.pattern,
      confidence: 0,
      reasons: ['OI pattern is NEUTRAL — smart money not showing clear direction'],
      warnings: [
        'Wait for a clear Long Buildup or Short Buildup to develop',
        'Do NOT trade against the OI pattern',
        oiPattern.pattern === 'NEUTRAL'
          ? 'Current market: sideways. Best strategy: wait at support/resistance levels'
          : `Current OI pattern: ${oiPattern.pattern}`,
      ],
      timeframe: '5m',
      capital: CAPITAL,
      pnlTarget: 0,
      pnlSL: 0,
    };
  }

  // ── Find the right strike ─────────────────────────────────────────────────
  const atmStrike = Math.round(spot / 50) * 50;
  let selectedStrike = null;
  let selectedLTP = 0;
  let lots = 0;

  if (bias === 'BUY_CE') {
    // Look for ATM strike first, then 1 OTM (50 above ATM)
    const candidates = strikes
      .filter(s => s.strikePrice >= atmStrike && s.strikePrice <= atmStrike + 100)
      .filter(s => s.call.ltp > 2)
      .sort((a, b) => a.strikePrice - b.strikePrice);

    for (const s of candidates) {
      const ltp = s.call.ltp;
      const affordableLots = Math.floor(CAPITAL / (ltp * LOT_SIZE));
      if (affordableLots >= 1) {
        selectedStrike = s;
        selectedLTP = ltp;
        lots = affordableLots;
        break;
      }
    }
  } else {
    // BUY_PE: ATM or 1 OTM below ATM
    const candidates = strikes
      .filter(s => s.strikePrice <= atmStrike && s.strikePrice >= atmStrike - 100)
      .filter(s => s.put.ltp > 2)
      .sort((a, b) => b.strikePrice - a.strikePrice);

    for (const s of candidates) {
      const ltp = s.put.ltp;
      const affordableLots = Math.floor(CAPITAL / (ltp * LOT_SIZE));
      if (affordableLots >= 1) {
        selectedStrike = s;
        selectedLTP = ltp;
        lots = affordableLots;
        break;
      }
    }
  }

  if (!selectedStrike || lots < 1) {
    warnings.push(`All strikes too expensive for ₹${CAPITAL} capital`);
    warnings.push('Consider waiting for market open when premiums are lower');
    return {
      bias: 'WAIT',
      strike: atmStrike, type: bias === 'BUY_CE' ? 'CE' : 'PE',
      ltp: 0, lots: 0, investment: 0,
      entry: 0, target: 0, stopLoss: 0, rewardRisk: '-',
      oiPattern: oiPattern.pattern, confidence: 0,
      reasons, warnings, timeframe: '5m', capital: CAPITAL,
      pnlTarget: 0, pnlSL: 0,
    };
  }

  // ── Calculate R:R ─────────────────────────────────────────────────────────
  // 1:2 minimum. Stretch to 1:3 at high confidence (>=75%)
  const entry = selectedLTP;
  const rrMult = confidence >= 75 ? 1.75 : 1.50; // 1:3 or 1:2
  const target = Math.round(entry * rrMult);      // +50% or +75%
  const sl = Math.round(entry * 0.75);            // -25% SL always
  const reward = target - entry;
  const risk = entry - sl;
  const rrRatio = (reward / risk).toFixed(1);

  const investment = Math.round(lots * entry * LOT_SIZE);
  const pnlTarget = Math.round(lots * (target - entry) * LOT_SIZE);
  const pnlSL = -Math.round(lots * (entry - sl) * LOT_SIZE);

  // Capital control warning
  if (lots > 2) {
    warnings.push(`Using ${lots} lots. Consider risking max 2 lots for ₹${CAPITAL} capital`);
    lots = Math.min(lots, 2);
  }
  if (confidence < 50) {
    warnings.push('Confidence below 50% — reduce position size or wait for stronger setup');
  }
  if (Math.abs(spot - (optionChain.maxPain || spot)) > 200) {
    warnings.push(`Max Pain at ₹${optionChain.maxPain} — expiry pull may neutralize move`);
  }

  // Near resistance/support warnings
  if (bias === 'BUY_CE' && optionChain.highestCallStrike) {
    const distToResistance = optionChain.highestCallStrike - spot;
    if (distToResistance < 100) {
      warnings.push(`Call Wall (resistance) is only ₹${distToResistance.toFixed(0)} away — target near resistance`);
    }
  }
  if (bias === 'BUY_PE' && optionChain.highestPutStrike) {
    const distToSupport = spot - optionChain.highestPutStrike;
    if (distToSupport < 100) {
      warnings.push(`Put Wall (support) is only ₹${distToSupport.toFixed(0)} away — limited downside`);
    }
  }

  const optionType = bias === 'BUY_CE' ? 'CE' : 'PE';
  reasons.push(`₹${investment} invested | Target +₹${pnlTarget} (${((pnlTarget / investment) * 100).toFixed(0)}%) | SL -₹${Math.abs(pnlSL)}`);

  return {
    bias,
    strike: selectedStrike.strikePrice,
    type: optionType,
    ltp: entry,
    lots,
    investment,
    entry,
    target,
    stopLoss: sl,
    rewardRisk: `1:${rrRatio}`,
    oiPattern: oiPattern.pattern,
    confidence: Math.min(confidence, 90),
    reasons,
    warnings,
    timeframe: '5m',
    capital: CAPITAL,
    pnlTarget,
    pnlSL,
  };
}

// ── Main Signal Generation ────────────────────────────────────────────────────

/**
 * Main signal generation function.
 * Takes current market state and returns signals + OI pattern + trade setup.
 */
function generateSignals({ price, optionChain, isMarketOpen, oiHistory }) {
  if (!price || !optionChain) return signalHistory.slice(-20);

  const signals = [];
  const timestamp = new Date().toISOString();

  const currentPrice = price.price;
  const vwap = price.vwap;
  const prevClose = price.prevClose;
  const dayHigh = price.high;
  const dayLow = price.low;
  const pivots = price.pivots;

  const pcr = optionChain.pcr || 1;
  const maxPain = optionChain.maxPain;
  const resistanceLevels = optionChain.resistanceLevels || [];
  const highestCallStrike = optionChain.highestCallStrike;
  const highestPutStrike = optionChain.highestPutStrike;

  const vwapPos = getVWAPPosition(currentPrice, vwap);

  // ── Signal 1: Bullish Momentum ──────────────────────────────────────────
  const bullishScore = [
    vwapPos.position === 'ABOVE' ? 2 : 0,
    pcr > 1.2 ? 2 : (pcr > 1.0 ? 1 : 0),
    currentPrice > prevClose ? 1 : 0,
    currentPrice > (pivots?.PP || 0) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (bullishScore >= 4) {
    signals.push(createSignal({
      type: 'BULLISH_MOMENTUM',
      label: '🟢 Bullish Momentum',
      description: `Price ${vwapPos.diffPct > 0 ? '+' : ''}${vwapPos.diffPct.toFixed(2)}% above VWAP. PCR: ${pcr.toFixed(2)}`,
      confidence: Math.min(100, bullishScore * 14),
      indicator: 'bullish',
      metadata: { pcr, vwapDiff: vwapPos.diff, bullishScore, currentPrice },
      timestamp,
    }));
  }

  // ── Signal 2: Bearish Momentum ──────────────────────────────────────────
  const bearishScore = [
    vwapPos.position === 'BELOW' ? 2 : 0,
    pcr < 0.7 ? 2 : (pcr < 0.9 ? 1 : 0),
    currentPrice < prevClose ? 1 : 0,
    currentPrice < (pivots?.PP || Infinity) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (bearishScore >= 4) {
    signals.push(createSignal({
      type: 'BEARISH_MOMENTUM',
      label: '🔴 Bearish Momentum',
      description: `Price ${Math.abs(vwapPos.diffPct).toFixed(2)}% below VWAP. PCR: ${pcr.toFixed(2)}`,
      confidence: Math.min(100, bearishScore * 14),
      indicator: 'bearish',
      metadata: { pcr, vwapDiff: vwapPos.diff, bearishScore, currentPrice },
      timestamp,
    }));
  }

  // ── Signal 3: Breakout ──────────────────────────────────────────────────
  const breakingResistance = highestCallStrike &&
    currentPrice > highestCallStrike && vwapPos.position === 'ABOVE';
  if (breakingResistance || (pivots?.R1 && currentPrice > pivots.R1 && currentPrice === dayHigh)) {
    signals.push(createSignal({
      type: 'POSSIBLE_BREAKOUT',
      label: '🚀 Possible Breakout',
      description: breakingResistance
        ? `Price breaking above Call Wall at ${highestCallStrike}`
        : `Price above R1 (${pivots?.R1}) making new day high`,
      confidence: 72,
      indicator: 'bullish',
      metadata: { highestCallStrike, currentPrice, dayHigh },
      timestamp,
    }));
  }

  // ── Signal 4: Breakdown ─────────────────────────────────────────────────
  const breakingSupport = highestPutStrike &&
    currentPrice < highestPutStrike && vwapPos.position === 'BELOW';
  if (breakingSupport || (pivots?.S1 && currentPrice < pivots.S1 && currentPrice === dayLow)) {
    signals.push(createSignal({
      type: 'POSSIBLE_BREAKDOWN',
      label: '⬇️ Possible Breakdown',
      description: breakingSupport
        ? `Price breaking below Put Wall at ${highestPutStrike}`
        : `Price below S1 (${pivots?.S1}) making new day low`,
      confidence: 70,
      indicator: 'bearish',
      metadata: { highestPutStrike, currentPrice, dayLow },
      timestamp,
    }));
  }

  // ── Signal 5: Short Covering ────────────────────────────────────────────
  // Use pchangeinOpenInterest (% change) so this works for both real & mock data
  const putOIDropping = optionChain.strikes?.some(
    s => (s.put.oiChange < -5000 || s.put.oiChangePct < -3) && s.strikePrice <= currentPrice
  );
  if (putOIDropping && vwapPos.position === 'ABOVE' && pcr > 0.9) {
    signals.push(createSignal({
      type: 'SHORT_COVERING',
      label: '⚡ Short Covering Detected',
      description: 'Put OI unwinding near/below current price. Shorts covering.',
      confidence: 65,
      indicator: 'bullish',
      metadata: { pcr, currentPrice },
      timestamp,
    }));
  }

  // ── Signal 6: Long Buildup ──────────────────────────────────────────────
  const callOIBuilding = optionChain.strikes?.some(
    s => (s.call.oiChange > 5000 || s.call.oiChangePct > 3) && s.strikePrice >= currentPrice
  );
  if (callOIBuilding && vwapPos.position === 'ABOVE' && pcr >= 1.0) {
    signals.push(createSignal({
      type: 'LONG_BUILDUP',
      label: '📈 Long Buildup',
      description: 'Fresh call OI being added above current price — long trend active.',
      confidence: 60,
      indicator: 'bullish',
      metadata: { pcr, currentPrice },
      timestamp,
    }));
  }

  // ── Signal 7: Range Market ──────────────────────────────────────────────
  const isRanging = Math.abs(vwapPos.diffPct) < 0.15 && pcr >= 0.85 && pcr <= 1.15;
  if (isRanging) {
    signals.push(createSignal({
      type: 'RANGE_MARKET',
      label: '↔️ Range Market',
      description: `Price ±${Math.abs(vwapPos.diffPct).toFixed(2)}% from VWAP. PCR neutral at ${pcr.toFixed(2)}`,
      confidence: 70,
      indicator: 'neutral',
      metadata: { pcr, vwapDiff: vwapPos.diff, maxPain },
      timestamp,
    }));
  }

  // ── Signal 8: Extreme PCR ───────────────────────────────────────────────
  if (pcr > 1.8) {
    signals.push(createSignal({
      type: 'EXTREME_PCR_BULLISH',
      label: '⚠️ Extreme Put Writing',
      description: `PCR: ${pcr.toFixed(2)} — Very high put writing. Watch for reversal.`,
      confidence: 55,
      indicator: 'warning',
      metadata: { pcr },
      timestamp,
    }));
  } else if (pcr < 0.5) {
    signals.push(createSignal({
      type: 'EXTREME_PCR_BEARISH',
      label: '⚠️ Extreme Call Writing',
      description: `PCR: ${pcr.toFixed(2)} — Heavily bearish. Possible capitulation.`,
      confidence: 55,
      indicator: 'warning',
      metadata: { pcr },
      timestamp,
    }));
  }

  // ── Update history ──────────────────────────────────────────────────────
  signals.forEach(sig => {
    const recentTypes = signalHistory.slice(-5).map(s => s.type);
    sig.isNew = !recentTypes.includes(sig.type);
    signalHistory.push(sig);
    if (signalHistory.length > MAX_HISTORY) signalHistory.shift();
  });

  return signals;
}

function createSignal({ type, label, description, confidence, indicator, metadata, timestamp }) {
  return {
    id: `${type}_${Date.now()}`,
    type, label, description, confidence,
    indicator, metadata, timestamp,
    isNew: false,
  };
}

function getSignalHistory(limit = 30) {
  return signalHistory.slice(-limit).reverse();
}

function getMarketSentiment(signals) {
  if (!signals || signals.length === 0) return 'NEUTRAL';
  const bullishCount = signals.filter(s => s.indicator === 'bullish').length;
  const bearishCount = signals.filter(s => s.indicator === 'bearish').length;
  if (bullishCount > bearishCount + 1) return 'BULLISH';
  if (bearishCount > bullishCount + 1) return 'BEARISH';
  return 'NEUTRAL';
}

module.exports = {
  generateSignals,
  getSignalHistory,
  getMarketSentiment,
};
