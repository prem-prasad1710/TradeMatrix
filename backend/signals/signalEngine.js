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

const {
  getVWAPPosition,
  computeAllIndicators,
  computeATR,
} = require('../utils/technicals');

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
 * - Selects CE or PE based on bias + OI pattern + technical indicators
 * - Finds the affordable strike (ATM or 1 OTM) within ₹10k budget
 * - Computes entry, target (+40%), stop loss (ATR-based or -25%), R:R ratio
 * - Explains WHY this setup is valid with full technical confluence
 */
function generateTradeSetup(price, optionChain, oiPattern, signals, technicals) {
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

  // ── Technical Indicator Confluence ────────────────────────────────────────
  if (technicals && bias !== 'WAIT') {
    const { rsi, ema, macd, bb, pattern, techBias, bullScore, bearScore } = technicals;

    // RSI
    if (rsi && rsi.rsi !== null) {
      if (bias === 'BUY_CE') {
        if (rsi.rsi >= 75) {
          warnings.push(`RSI ${rsi.rsi} — Overbought territory. CE premium may contract. Consider smaller position.`);
          confidence -= 10;
        } else if (rsi.rsi >= 55 && rsi.rsi < 75) {
          reasons.push(`RSI ${rsi.rsi} in bullish zone (55-75) — momentum favors upside`);
          confidence += 8;
        } else if (rsi.rsi < 40) {
          warnings.push(`RSI ${rsi.rsi} — Weak bullish momentum. Technicals lagging OI signal.`);
          confidence -= 5;
        }
      } else if (bias === 'BUY_PE') {
        if (rsi.rsi <= 25) {
          warnings.push(`RSI ${rsi.rsi} — Oversold territory. PE premium may contract. Consider smaller position.`);
          confidence -= 10;
        } else if (rsi.rsi <= 45 && rsi.rsi > 25) {
          reasons.push(`RSI ${rsi.rsi} in bearish zone (25-45) — momentum favors downside`);
          confidence += 8;
        } else if (rsi.rsi > 60) {
          warnings.push(`RSI ${rsi.rsi} — Still bullish energy. OI signal may be early.`);
          confidence -= 5;
        }
      }
    }

    // EMA
    if (ema) {
      const emaTrend = ema.trend;
      if (bias === 'BUY_CE') {
        if (emaTrend === 'STRONG_BULLISH') {
          reasons.push(`EMA stack bullish: EMA9(${ema.ema9}) > EMA21(${ema.ema21}) > EMA50(${ema.ema50}) — strong uptrend`);
          confidence += 12;
        } else if (emaTrend === 'BULLISH') {
          reasons.push(`EMA9(${ema.ema9}) above EMA21(${ema.ema21}) — short-term trend bullish`);
          confidence += 7;
        } else if (emaTrend === 'BEARISH' || emaTrend === 'STRONG_BEARISH') {
          warnings.push(`EMA stack bearish (${ema.ema9} < ${ema.ema21}) — technicals diverge from OI signal`);
          confidence -= 8;
        }
      } else if (bias === 'BUY_PE') {
        if (emaTrend === 'STRONG_BEARISH') {
          reasons.push(`EMA stack bearish: EMA9(${ema.ema9}) < EMA21(${ema.ema21}) < EMA50(${ema.ema50}) — strong downtrend`);
          confidence += 12;
        } else if (emaTrend === 'BEARISH') {
          reasons.push(`EMA9(${ema.ema9}) below EMA21(${ema.ema21}) — short-term trend bearish`);
          confidence += 7;
        } else if (emaTrend === 'BULLISH' || emaTrend === 'STRONG_BULLISH') {
          warnings.push(`EMA stack bullish (${ema.ema9} > ${ema.ema21}) — technicals diverge from OI signal`);
          confidence -= 8;
        }
      }
    }

    // MACD
    if (macd) {
      if (bias === 'BUY_CE') {
        if (macd.bullishCross) {
          reasons.push(`MACD Golden Cross just triggered — momentum shift confirmed bullish`);
          confidence += 10;
        } else if (macd.indicator === 'bullish' && macd.histGrowing) {
          reasons.push(`MACD histogram expanding bullish (${macd.histogram.toFixed(1)}) — momentum building`);
          confidence += 6;
        } else if (macd.indicator === 'bearish') {
          warnings.push(`MACD bearish (${macd.macdLine} < ${macd.signalLine}) — divergence with OI signal`);
          confidence -= 6;
        }
      } else if (bias === 'BUY_PE') {
        if (macd.bearishCross) {
          reasons.push(`MACD Death Cross just triggered — momentum shift confirmed bearish`);
          confidence += 10;
        } else if (macd.indicator === 'bearish' && !macd.histGrowing) {
          reasons.push(`MACD histogram expanding bearish (${macd.histogram.toFixed(1)}) — selling pressure building`);
          confidence += 6;
        } else if (macd.indicator === 'bullish') {
          warnings.push(`MACD bullish (${macd.macdLine} > ${macd.signalLine}) — divergence with OI signal`);
          confidence -= 6;
        }
      }
    }

    // Bollinger Bands
    if (bb) {
      if (bias === 'BUY_CE') {
        if (bb.zone === 'LOWER_BAND') {
          reasons.push(`Price at lower Bollinger Band (${bb.lower}) — mean reversion bounce likely, CE entry ideal`);
          confidence += 8;
        } else if (bb.zone === 'UPPER_BAND') {
          warnings.push(`Price at upper Bollinger Band (${bb.upper}) — stretched, CE premium may not expand much`);
          confidence -= 5;
        }
        if (bb.squeeze) {
          reasons.push(`Bollinger Band squeeze detected (bandwidth ${bb.bandwidth.toFixed(1)}%) — explosive move imminent`);
          confidence += 5;
        }
      } else if (bias === 'BUY_PE') {
        if (bb.zone === 'UPPER_BAND') {
          reasons.push(`Price at upper Bollinger Band (${bb.upper}) — mean reversion fall likely, PE entry ideal`);
          confidence += 8;
        } else if (bb.zone === 'LOWER_BAND') {
          warnings.push(`Price at lower Bollinger Band (${bb.lower}) — stretched downside, PE may not expand much`);
          confidence -= 5;
        }
        if (bb.squeeze) {
          reasons.push(`Bollinger Band squeeze detected (bandwidth ${bb.bandwidth.toFixed(1)}%) — explosive move imminent`);
          confidence += 5;
        }
      }
    }

    // Candlestick Pattern
    if (pattern) {
      if (bias === 'BUY_CE' && pattern.bias === 'bullish') {
        reasons.push(`${pattern.emoji} ${pattern.pattern.replace(/_/g, ' ')} — ${pattern.description}`);
        confidence += 10;
      } else if (bias === 'BUY_PE' && pattern.bias === 'bearish') {
        reasons.push(`${pattern.emoji} ${pattern.pattern.replace(/_/g, ' ')} — ${pattern.description}`);
        confidence += 10;
      } else if (pattern.bias !== 'neutral' && pattern.bias !== bias.includes('CE') ? 'bullish' : 'bearish') {
        warnings.push(`${pattern.emoji} Candlestick pattern (${pattern.pattern.replace(/_/g, ' ')}) conflicts with trade direction`);
        confidence -= 5;
      } else if (pattern.pattern === 'DOJI') {
        warnings.push('Doji candle — market indecision. Wait for next candle to confirm direction.');
        confidence -= 3;
      }
    }

    // Overall technical alignment summary
    const techAlign = bias === 'BUY_CE' ? techBias === 'bullish' : techBias === 'bearish';
    if (!techAlign && techBias !== 'neutral') {
      warnings.push(`Technical indicators (score: Bull ${bullScore} vs Bear ${bearScore}) diverge from OI signal — reduce size`);
    }
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
  // Use ATR-based SL when available, otherwise fixed -25%
  const entry = selectedLTP;
  const rrMult = confidence >= 75 ? 1.75 : 1.50; // 1:3 or 1:2
  const target = Math.round(entry * rrMult);      // +50% or +75%

  // ATR-based SL: map underlying ATR to option premium SL
  // A good heuristic: option moves ~delta per 1pt underlying move
  // For ATM option delta ≈ 0.5. So optionSL = entry - atr * 0.5 * 1.5
  let sl = Math.round(entry * 0.75); // default -25%
  let slMethod = 'fixed';
  if (technicals && technicals.atr) {
    const delta = 0.5; // ATM delta approximation
    const atrBasedSL = Math.round(entry - technicals.atr * delta * 1.5);
    if (atrBasedSL > 0 && atrBasedSL < entry * 0.9 && atrBasedSL > entry * 0.50) {
      sl = atrBasedSL;
      slMethod = 'ATR';
      reasons.push(`ATR-based SL: underlying ATR=${technicals.atr.toFixed(0)}pts → option SL set at ₹${sl}`);
    }
  }

  const reward = target - entry;
  const risk = entry - sl;
  const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : '1.5';

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
  reasons.push(`₹${investment} invested | Target +₹${pnlTarget} (${((pnlTarget / investment) * 100).toFixed(0)}%) | SL -₹${Math.abs(pnlSL)} [${slMethod} SL]`);

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
    confidence: Math.min(confidence, 92),
    reasons,
    warnings,
    timeframe: '5m',
    capital: CAPITAL,
    pnlTarget,
    pnlSL,
    // Expose key technicals for frontend display
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

// ── Main Signal Generation ────────────────────────────────────────────────────

/**
 * Main signal generation function.
 * Takes current market state and returns signals + OI pattern + trade setup.
 */
function generateSignals({ price, optionChain, isMarketOpen, oiHistory, candles, technicals }) {
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

  // ── Technical Indicator Signals (from candle data) ─────────────────────
  if (technicals) {
    const { rsi, ema, macd, bb, pattern } = technicals;

    // RSI signals
    if (rsi && rsi.rsi !== null) {
      if (rsi.rsi >= 55 && rsi.rsi < 72) {
        signals.push(createSignal({
          type: 'RSI_BULLISH',
          label: `📊 RSI Bullish (${rsi.rsi})`,
          description: `RSI at ${rsi.rsi} — in bullish momentum zone (55-72). Buyers in control, trend intact.`,
          confidence: Math.min(80, 50 + (rsi.rsi - 55) * 1.5),
          indicator: 'bullish',
          metadata: { rsi: rsi.rsi, zone: rsi.zone },
          timestamp,
        }));
      } else if (rsi.rsi <= 45 && rsi.rsi > 28) {
        signals.push(createSignal({
          type: 'RSI_BEARISH',
          label: `📊 RSI Bearish (${rsi.rsi})`,
          description: `RSI at ${rsi.rsi} — in bearish momentum zone (28-45). Sellers dominating, downtrend active.`,
          confidence: Math.min(80, 50 + (45 - rsi.rsi) * 1.5),
          indicator: 'bearish',
          metadata: { rsi: rsi.rsi, zone: rsi.zone },
          timestamp,
        }));
      } else if (rsi.rsi >= 72) {
        signals.push(createSignal({
          type: 'RSI_OVERBOUGHT',
          label: `⚠️ RSI Overbought (${rsi.rsi})`,
          description: `RSI at ${rsi.rsi} — overbought zone. CE premiums at risk of contraction. Watch for reversal.`,
          confidence: 65,
          indicator: 'warning',
          metadata: { rsi: rsi.rsi, zone: rsi.zone },
          timestamp,
        }));
      } else if (rsi.rsi <= 28) {
        signals.push(createSignal({
          type: 'RSI_OVERSOLD',
          label: `⚠️ RSI Oversold (${rsi.rsi})`,
          description: `RSI at ${rsi.rsi} — oversold zone. PE premiums at risk of contraction. Bounce possible.`,
          confidence: 65,
          indicator: 'warning',
          metadata: { rsi: rsi.rsi, zone: rsi.zone },
          timestamp,
        }));
      }
    }

    // EMA signals
    if (ema) {
      if (ema.trend === 'STRONG_BULLISH') {
        signals.push(createSignal({
          type: 'EMA_BULL_STACK',
          label: `📈 EMA Bull Stack`,
          description: `Price(${ema.price}) > EMA9(${ema.ema9}) > EMA21(${ema.ema21}) > EMA50(${ema.ema50}) — perfect bull alignment`,
          confidence: 78,
          indicator: 'bullish',
          metadata: { ema9: ema.ema9, ema21: ema.ema21, ema50: ema.ema50 },
          timestamp,
        }));
      } else if (ema.trend === 'STRONG_BEARISH') {
        signals.push(createSignal({
          type: 'EMA_BEAR_STACK',
          label: `📉 EMA Bear Stack`,
          description: `Price(${ema.price}) < EMA9(${ema.ema9}) < EMA21(${ema.ema21}) < EMA50(${ema.ema50}) — perfect bear alignment`,
          confidence: 78,
          indicator: 'bearish',
          metadata: { ema9: ema.ema9, ema21: ema.ema21, ema50: ema.ema50 },
          timestamp,
        }));
      } else if (ema.bullStack === false && ema.signal === 'bullish') {
        signals.push(createSignal({
          type: 'EMA_BULLISH_CROSS',
          label: `🟡 EMA Bullish Cross`,
          description: `EMA9(${ema.ema9}) crossed above EMA21(${ema.ema21}) — short-term momentum turning bullish`,
          confidence: 62,
          indicator: 'bullish',
          metadata: { ema9: ema.ema9, ema21: ema.ema21 },
          timestamp,
        }));
      } else if (ema.bearStack === false && ema.signal === 'bearish') {
        signals.push(createSignal({
          type: 'EMA_BEARISH_CROSS',
          label: `🟡 EMA Bearish Cross`,
          description: `EMA9(${ema.ema9}) crossed below EMA21(${ema.ema21}) — short-term momentum turning bearish`,
          confidence: 62,
          indicator: 'bearish',
          metadata: { ema9: ema.ema9, ema21: ema.ema21 },
          timestamp,
        }));
      }
    }

    // MACD signals
    if (macd) {
      if (macd.bullishCross) {
        signals.push(createSignal({
          type: 'MACD_GOLDEN_CROSS',
          label: `✨ MACD Golden Cross`,
          description: `MACD line(${macd.macdLine}) just crossed above signal(${macd.signalLine}) — powerful bullish momentum shift`,
          confidence: 80,
          indicator: 'bullish',
          metadata: { macdLine: macd.macdLine, signalLine: macd.signalLine, histogram: macd.histogram },
          timestamp,
        }));
      } else if (macd.bearishCross) {
        signals.push(createSignal({
          type: 'MACD_DEATH_CROSS',
          label: `💀 MACD Death Cross`,
          description: `MACD line(${macd.macdLine}) just crossed below signal(${macd.signalLine}) — powerful bearish momentum shift`,
          confidence: 80,
          indicator: 'bearish',
          metadata: { macdLine: macd.macdLine, signalLine: macd.signalLine, histogram: macd.histogram },
          timestamp,
        }));
      } else if (macd.indicator === 'bullish' && macd.histGrowing && macd.histogram > 0) {
        signals.push(createSignal({
          type: 'MACD_BULLISH_MOMENTUM',
          label: `📊 MACD Expanding Bullish`,
          description: `MACD histogram expanding (+${macd.histogram.toFixed(1)}) — bullish momentum accelerating`,
          confidence: 68,
          indicator: 'bullish',
          metadata: { macdLine: macd.macdLine, signalLine: macd.signalLine, histogram: macd.histogram },
          timestamp,
        }));
      } else if (macd.indicator === 'bearish' && !macd.histGrowing && macd.histogram < 0) {
        signals.push(createSignal({
          type: 'MACD_BEARISH_MOMENTUM',
          label: `📊 MACD Expanding Bearish`,
          description: `MACD histogram expanding (${macd.histogram.toFixed(1)}) — bearish momentum accelerating`,
          confidence: 68,
          indicator: 'bearish',
          metadata: { macdLine: macd.macdLine, signalLine: macd.signalLine, histogram: macd.histogram },
          timestamp,
        }));
      }
    }

    // Bollinger Band signals
    if (bb) {
      if (bb.squeeze) {
        signals.push(createSignal({
          type: 'BB_SQUEEZE',
          label: `🔥 Bollinger Squeeze`,
          description: `BB bandwidth only ${bb.bandwidth.toFixed(1)}% — market coiled, explosive breakout imminent. Watch volume for direction.`,
          confidence: 75,
          indicator: 'warning',
          metadata: { bandwidth: bb.bandwidth, upper: bb.upper, lower: bb.lower },
          timestamp,
        }));
      }
    }

    // Candlestick pattern signals
    if (pattern) {
      const indicator = pattern.bias === 'bullish' ? 'bullish'
        : pattern.bias === 'bearish' ? 'bearish' : 'neutral';
      const confidence = ['BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'THREE_WHITE_SOLDIERS', 'THREE_BLACK_CROWS', 'BULLISH_MARUBOZU', 'BEARISH_MARUBOZU'].includes(pattern.pattern) ? 75
        : ['HAMMER', 'SHOOTING_STAR'].includes(pattern.pattern) ? 70
        : 55;
      signals.push(createSignal({
        type: `CANDLE_${pattern.pattern}`,
        label: `${pattern.emoji} ${pattern.pattern.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`,
        description: pattern.description,
        confidence,
        indicator,
        metadata: { pattern: pattern.pattern, bias: pattern.bias },
        timestamp,
      }));
    }
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
