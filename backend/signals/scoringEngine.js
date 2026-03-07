/**
 * Signal Scoring Engine
 *
 * Computes a 0–100 probability score for bullish, bearish, and range-bound
 * trade setups by combining signals from all analytical sub-systems.
 *
 * SCORING COMPONENTS (total weight = 100):
 *
 *   VWAP Position              20 pts   — core trend filter
 *   OI Pattern (buildup)       15 pts   — smart money position signal
 *   Opening Range Breakout     12 pts   — intraday momentum confirmation
 *   Market Structure (trend)   12 pts   — structural bias
 *   OI Call/Put Unwinding      10 pts   — option activity confirmation
 *   Momentum + RSI              8 pts   — technical momentum
 *   Previous Day H/L break      8 pts   — price vs key reference levels
 *   Volume spike                5 pts   — institutional participation
 *   PCR extremes                5 pts   — sentiment confirmation
 *   Gamma flip zone             5 pts   — GEX structural context
 *
 * A score >70 on bull or bear = strong setup.
 * A score <40 on both bull and bear = range-bound environment.
 *
 * IMPORTANT: These are probability estimates, NOT guaranteed directional calls.
 * Always combine with price action, risk management, and position sizing.
 */

/**
 * Compute signal scores for bullish, bearish, and range scenarios.
 *
 * @param {object} params
 * @param {object} params.priceData         - NiftyPrice shape: { price, vwap, high, low, prevClose }
 * @param {object} params.optionChain       - OI analysis: { pcr, highestCallStrike, highestPutStrike, ... }
 * @param {object} params.oiPattern         - { pattern, bias, isConfirmed }
 * @param {object} params.technicals        - { rsi, ema, macd, bb }
 * @param {object} params.openingRange      - { status, breakout, high, low }
 * @param {object} params.marketStructure   - { trend, bosEvents, choch }
 * @param {object} params.liquidityLevels   - { prevDayHigh, prevDayLow, stopHunts }
 * @param {object} params.gammaExposure     - { bias, gammaFlipLevel, isPositiveGamma }
 * @param {object} params.fiiDii            - { fii, dii, bias }
 * @returns {SignalScoreResult}
 */
function computeSignalScore({
  priceData,
  optionChain,
  oiPattern,
  technicals,
  openingRange,
  marketStructure,
  liquidityLevels,
  gammaExposure,
  fiiDii,
}) {
  const spot    = priceData?.price;
  const vwap    = priceData?.vwap;
  const prevClose = priceData?.prevClose;
  const dayHigh = priceData?.high;
  const dayLow  = priceData?.low;

  if (!spot) {
    return buildEmptyScore('No price data');
  }

  let bullScore = 0;
  let bearScore = 0;
  const components = [];  // explains each contributor

  // ────────────────────────────────────────────────────────────────────────────
  // 1. VWAP Position (20 pts)
  //    Price above VWAP = bullish bias. Price below = bearish.
  // ────────────────────────────────────────────────────────────────────────────
  if (vwap) {
    const aboveVWAP = spot > vwap;
    const vwapDiff  = Math.abs(spot - vwap);
    const isStrong  = vwapDiff > spot * 0.002; // >0.2% away from VWAP = strong

    if (aboveVWAP) {
      const pts = isStrong ? 20 : 12;
      bullScore += pts;
      components.push({ name: 'VWAP', bull: pts, bear: 0,
        label: `Price ${isStrong ? 'firmly' : 'slightly'} ABOVE VWAP (${vwap?.toFixed(0)})` });
    } else {
      const pts = isStrong ? 20 : 12;
      bearScore += pts;
      components.push({ name: 'VWAP', bull: 0, bear: pts,
        label: `Price ${isStrong ? 'firmly' : 'slightly'} BELOW VWAP (${vwap?.toFixed(0)})` });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. OI Pattern — Price + OI buildup (15 pts)
  //    Long Buildup / Short Covering → bullish
  //    Short Buildup / Long Unwinding → bearish
  // ────────────────────────────────────────────────────────────────────────────
  if (oiPattern) {
    const confirmBonus = oiPattern.isConfirmed ? 5 : 0;
    switch (oiPattern.pattern) {
      case 'SHORT_COVERING': {
        const pts = 15 + confirmBonus;
        bullScore += pts;
        components.push({ name: 'OI Pattern', bull: pts, bear: 0,
          label: `Short Covering — shorts capitulating (${oiPattern.isConfirmed ? 'confirmed' : 'forming'})` });
        break;
      }
      case 'LONG_BUILDUP': {
        const pts = 12 + confirmBonus;
        bullScore += pts;
        components.push({ name: 'OI Pattern', bull: pts, bear: 0,
          label: `Long Buildup — fresh longs entering (${oiPattern.isConfirmed ? 'confirmed' : 'forming'})` });
        break;
      }
      case 'SHORT_BUILDUP': {
        const pts = 12 + confirmBonus;
        bearScore += pts;
        components.push({ name: 'OI Pattern', bull: 0, bear: pts,
          label: `Short Buildup — fresh shorts entering (${oiPattern.isConfirmed ? 'confirmed' : 'forming'})` });
        break;
      }
      case 'LONG_UNWINDING': {
        const pts = 15 + confirmBonus;
        bearScore += pts;
        components.push({ name: 'OI Pattern', bull: 0, bear: pts,
          label: `Long Unwinding — bulls exiting (${oiPattern.isConfirmed ? 'confirmed' : 'forming'})` });
        break;
      }
      default:
        components.push({ name: 'OI Pattern', bull: 0, bear: 0, label: 'OI Pattern: NEUTRAL — no clear buildup' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Opening Range Breakout (12 pts)
  // ────────────────────────────────────────────────────────────────────────────
  if (openingRange && openingRange.status) {
    if (openingRange.breakout?.direction === 'BULLISH') {
      const strengthBonus = openingRange.breakout.strength === 'STRONG' ? 3 : 0;
      const pts = 10 + strengthBonus;
      bullScore += pts;
      components.push({ name: 'Opening Range', bull: pts, bear: 0,
        label: `Bullish ORB — ${openingRange.breakout.label}` });
    } else if (openingRange.breakout?.direction === 'BEARISH') {
      const strengthBonus = openingRange.breakout.strength === 'STRONG' ? 3 : 0;
      const pts = 10 + strengthBonus;
      bearScore += pts;
      components.push({ name: 'Opening Range', bull: 0, bear: pts,
        label: `Bearish ORB — ${openingRange.breakout.label}` });
    } else if (openingRange.status === 'ABOVE_OR') {
      bullScore += 5;
      components.push({ name: 'Opening Range', bull: 5, bear: 0,
        label: 'Price above Opening Range — pre-breakout bullish bias' });
    } else if (openingRange.status === 'BELOW_OR') {
      bearScore += 5;
      components.push({ name: 'Opening Range', bull: 0, bear: 5,
        label: 'Price below Opening Range — pre-breakdown bearish bias' });
    } else {
      components.push({ name: 'Opening Range', bull: 0, bear: 0,
        label: 'Price inside Opening Range — no directional breakout yet' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Market Structure (12 pts)
  //    Uptrend / CHoCH / BOS
  // ────────────────────────────────────────────────────────────────────────────
  if (marketStructure) {
    const { trend, bosEvents = [], choch } = marketStructure;

    if (choch?.bias === 'bullish') {
      bullScore += 12;
      components.push({ name: 'Market Structure', bull: 12, bear: 0,
        label: `CHoCH Bullish — ${choch.description}` });
    } else if (choch?.bias === 'bearish') {
      bearScore += 12;
      components.push({ name: 'Market Structure', bull: 0, bear: 12,
        label: `CHoCH Bearish — ${choch.description}` });
    } else if (trend?.trend === 'UPTREND') {
      const strengthBonus = trend.strength === 'STRONG' ? 4 : 0;
      const pts = 8 + strengthBonus;
      bullScore += pts;
      components.push({ name: 'Market Structure', bull: pts, bear: 0,
        label: trend.description });
    } else if (trend?.trend === 'DOWNTREND') {
      const strengthBonus = trend.strength === 'STRONG' ? 4 : 0;
      const pts = 8 + strengthBonus;
      bearScore += pts;
      components.push({ name: 'Market Structure', bull: 0, bear: pts,
        label: trend.description });
    } else {
      // BOS signals (weaker than trend/CHoCH)
      const latestBOS = bosEvents[bosEvents.length - 1];
      if (latestBOS?.bias === 'bullish') {
        bullScore += 6;
        components.push({ name: 'Market Structure', bull: 6, bear: 0,
          label: latestBOS.description });
      } else if (latestBOS?.bias === 'bearish') {
        bearScore += 6;
        components.push({ name: 'Market Structure', bull: 0, bear: 6,
          label: latestBOS.description });
      } else {
        components.push({ name: 'Market Structure', bull: 0, bear: 0,
          label: 'Sideways structure — no clear trend or BOS' });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. OI Unwinding (Call/Put) — 10 pts
  //    If total Call OI is decreasing → call writers covering → bullish
  //    If total Put OI is decreasing  → put writers covering → neutral/mixed
  // ────────────────────────────────────────────────────────────────────────────
  if (optionChain) {
    const callOIChange = optionChain.totalCallOIChange || 0;
    const putOIChange  = optionChain.totalPutOIChange  || 0;

    if (callOIChange < -100000 && putOIChange > 0) {
      // Call OI unwinding + Put OI building = bullish
      bullScore += 10;
      components.push({ name: 'OI Unwinding', bull: 10, bear: 0,
        label: 'Call OI unwinding — resistance sellers covering, bullish pressure' });
    } else if (putOIChange < -100000 && callOIChange > 0) {
      // Put OI unwinding + Call OI building = bearish
      bearScore += 10;
      components.push({ name: 'OI Unwinding', bull: 0, bear: 10,
        label: 'Put OI unwinding — support sellers covering, bearish pressure' });
    } else {
      components.push({ name: 'OI Unwinding', bull: 0, bear: 0,
        label: 'No significant OI unwinding detected' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Technical Momentum — RSI + MACD (8 pts)
  // ────────────────────────────────────────────────────────────────────────────
  if (technicals) {
    const { rsi, macd, ema } = technicals;
    let techBull = 0, techBear = 0;
    const techParts = [];

    if (rsi?.rsi !== null) {
      if (rsi.rsi > 55 && rsi.rsi < 75) { techBull += 3; techParts.push(`RSI ${rsi.rsi} bullish`); }
      else if (rsi.rsi > 75)             { techBull += 1; techParts.push(`RSI ${rsi.rsi} overbought`); }
      else if (rsi.rsi < 45 && rsi.rsi > 25) { techBear += 3; techParts.push(`RSI ${rsi.rsi} bearish`); }
      else if (rsi.rsi < 25)             { techBear += 1; techParts.push(`RSI ${rsi.rsi} oversold`); }
    }

    if (macd) {
      if (macd.bullishCross || (macd.indicator === 'bullish' && macd.histGrowing)) {
        techBull += 3; techParts.push('MACD bullish');
      } else if (macd.bearishCross || (macd.indicator === 'bearish')) {
        techBear += 3; techParts.push('MACD bearish');
      }
    }

    if (ema?.trend === 'STRONG_BULLISH') { techBull += 2; techParts.push('EMA stack bullish'); }
    if (ema?.trend === 'STRONG_BEARISH') { techBear += 2; techParts.push('EMA stack bearish'); }

    const totalTechPts = Math.min(8, Math.max(techBull, techBear));
    if (techBull > techBear) {
      bullScore += Math.min(8, techBull);
      components.push({ name: 'Momentum', bull: Math.min(8, techBull), bear: 0,
        label: `Momentum bullish — ${techParts.join(', ')}` });
    } else if (techBear > techBull) {
      bearScore += Math.min(8, techBear);
      components.push({ name: 'Momentum', bull: 0, bear: Math.min(8, techBear),
        label: `Momentum bearish — ${techParts.join(', ')}` });
    } else {
      components.push({ name: 'Momentum', bull: 0, bear: 0, label: 'Momentum: neutral' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Previous Day High / Low (8 pts)
  //    Price above PDH → strong bullish.
  //    Price below PDL → strong bearish.
  // ────────────────────────────────────────────────────────────────────────────
  if (liquidityLevels) {
    const pdh = liquidityLevels.prevDayHigh;
    const pdl = liquidityLevels.prevDayLow;

    if (pdh && spot > pdh) {
      bullScore += 8;
      components.push({ name: 'PDH/PDL', bull: 8, bear: 0,
        label: `Price above PDH (${pdh?.toFixed(0)}) — key breakout confirmed` });
    } else if (pdl && spot < pdl) {
      bearScore += 8;
      components.push({ name: 'PDH/PDL', bull: 0, bear: 8,
        label: `Price below PDL (${pdl?.toFixed(0)}) — bearish breakdown confirmed` });
    } else if (prevClose && spot > prevClose) {
      bullScore += 3;
      components.push({ name: 'PDH/PDL', bull: 3, bear: 0,
        label: `Price above prev close (${prevClose?.toFixed(0)})` });
    } else if (prevClose && spot < prevClose) {
      bearScore += 3;
      components.push({ name: 'PDH/PDL', bull: 0, bear: 3,
        label: `Price below prev close (${prevClose?.toFixed(0)})` });
    } else {
      components.push({ name: 'PDH/PDL', bull: 0, bear: 0, label: 'Price within PDH–PDL range' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 8. Volume Spike (5 pts) — approximate from technicals
  // ────────────────────────────────────────────────────────────────────────────
  if (technicals?.volumeSpike) {
    const isUp = spot > (prevClose || spot - 1);
    if (isUp) {
      bullScore += 5;
      components.push({ name: 'Volume', bull: 5, bear: 0, label: 'Volume spike on bullish candle — institutional buying' });
    } else {
      bearScore += 5;
      components.push({ name: 'Volume', bull: 0, bear: 5, label: 'Volume spike on bearish candle — institutional selling' });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9. PCR Extremes (5 pts)
  // ────────────────────────────────────────────────────────────────────────────
  if (optionChain?.pcr) {
    const pcr = optionChain.pcr;
    if (pcr > 1.5) {
      bullScore += 5;
      components.push({ name: 'PCR', bull: 5, bear: 0,
        label: `PCR ${pcr.toFixed(2)} — extreme put writing, very bullish` });
    } else if (pcr > 1.2) {
      bullScore += 3;
      components.push({ name: 'PCR', bull: 3, bear: 0,
        label: `PCR ${pcr.toFixed(2)} — elevated puts, supportive for bulls` });
    } else if (pcr < 0.6) {
      bearScore += 5;
      components.push({ name: 'PCR', bull: 0, bear: 5,
        label: `PCR ${pcr.toFixed(2)} — extreme call writing, very bearish` });
    } else if (pcr < 0.8) {
      bearScore += 3;
      components.push({ name: 'PCR', bull: 0, bear: 3,
        label: `PCR ${pcr.toFixed(2)} — elevated calls, capping upside` });
    } else {
      components.push({ name: 'PCR', bull: 0, bear: 0,
        label: `PCR ${pcr.toFixed(2)} — neutral` });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 10. Gamma Exposure (5 pts)
  // ────────────────────────────────────────────────────────────────────────────
  if (gammaExposure?.gammaFlipLevel) {
    const flip = gammaExposure.gammaFlipLevel;
    if (spot > flip) {
      // Above flip = positive gamma = market maker stabilising (mean reversion)
      // Slight bullish edge (stabilises above flip)
      components.push({ name: 'Gamma', bull: 2, bear: 0,
        label: `Above Gamma Flip (${flip}) — positive GEX zone, low volatility expected` });
      bullScore += 2;
    } else {
      // Below flip = negative gamma = dealers amplify moves
      // Neutral-to-bearish (volatility could go either way, but below flip = bearish)
      bearScore += 3;
      components.push({ name: 'Gamma', bull: 0, bear: 3,
        label: `Below Gamma Flip (${flip}) — negative GEX zone, volatile / trending environment` });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 11. FII/DII Institutional Flow (bonus: up to 5 pts)
  // ────────────────────────────────────────────────────────────────────────────
  if (fiiDii?.bias) {
    const b = fiiDii.bias.bias;
    if (b === 'STRONGLY_BULLISH') {
      bullScore += 5;
      components.push({ name: 'FII/DII', bull: 5, bear: 0, label: fiiDii.bias.description });
    } else if (b === 'BULLISH') {
      bullScore += 3;
      components.push({ name: 'FII/DII', bull: 3, bear: 0, label: fiiDii.bias.description });
    } else if (b === 'BEARISH') {
      bearScore += 3;
      components.push({ name: 'FII/DII', bull: 0, bear: 3, label: fiiDii.bias.description });
    } else if (b === 'STRONGLY_BEARISH') {
      bearScore += 5;
      components.push({ name: 'FII/DII', bull: 0, bear: 5, label: fiiDii.bias.description });
    } else {
      components.push({ name: 'FII/DII', bull: 0, bear: 0, label: fiiDii.bias.description });
    }
  }

  // ── Clamp to 0-100 ────────────────────────────────────────────────────────
  bullScore = Math.min(100, Math.max(0, bullScore));
  bearScore = Math.min(100, Math.max(0, bearScore));

  // Range score is the "leftover" probability — indecision or sideways
  const maxDirectional = Math.max(bullScore, bearScore);
  const rangeScore = Math.max(0, 100 - maxDirectional);

  // Normalize to sum = 100 (use as relative probabilities)
  const total = bullScore + bearScore + rangeScore;
  const bullPct  = total > 0 ? Math.round(bullScore  / total * 100) : 33;
  const bearPct  = total > 0 ? Math.round(bearScore  / total * 100) : 33;
  const rangePct = 100 - bullPct - bearPct;

  // ── Determine signal label ────────────────────────────────────────────────
  let signal = 'RANGE';
  let signalLabel = 'Range / Sideways';
  let signalColor = 'neutral';

  if (bullScore > 70 && bullScore > bearScore * 1.5) {
    signal = 'STRONG_BULL'; signalLabel = 'Strong Bullish Setup'; signalColor = 'bullish';
  } else if (bullScore > 55 && bullScore > bearScore) {
    signal = 'BULL'; signalLabel = 'Bullish Setup'; signalColor = 'bullish';
  } else if (bearScore > 70 && bearScore > bullScore * 1.5) {
    signal = 'STRONG_BEAR'; signalLabel = 'Strong Bearish Setup'; signalColor = 'bearish';
  } else if (bearScore > 55 && bearScore > bullScore) {
    signal = 'BEAR'; signalLabel = 'Bearish Setup'; signalColor = 'bearish';
  }

  // Min-10 pt components (avoid false negatives from rounding)
  const activeComponents = components.filter(c => c.bull > 0 || c.bear > 0);
  const topBullComponents = components
    .filter(c => c.bull > 0)
    .sort((a, b) => b.bull - a.bull)
    .slice(0, 3)
    .map(c => c.label);
  const topBearComponents = components
    .filter(c => c.bear > 0)
    .sort((a, b) => b.bear - a.bear)
    .slice(0, 3)
    .map(c => c.label);

  const explanation = signal.includes('BULL')
    ? `Bullish confluence: ${topBullComponents.join('; ')}`
    : signal.includes('BEAR')
    ? `Bearish confluence: ${topBearComponents.join('; ')}`
    : 'Mixed signals — no clear directional edge';

  return {
    bullScore,
    bearScore,
    rangeScore,
    bullPct,
    bearPct,
    rangePct,
    signal,
    signalLabel,
    signalColor,
    explanation,
    components,
    activeComponents,
    topBullComponents,
    topBearComponents,
    isHighConfidence:   maxDirectional > 70,
    isStrongSignal:     signal.startsWith('STRONG'),
    timestamp:          new Date().toISOString(),
  };
}

function buildEmptyScore(reason = 'No data') {
  return {
    bullScore: 0, bearScore: 0, rangeScore: 50,
    bullPct: 25, bearPct: 25, rangePct: 50,
    signal: 'RANGE', signalLabel: 'Awaiting data',
    signalColor: 'neutral',
    explanation: reason,
    components: [],
    activeComponents: [],
    topBullComponents: [],
    topBearComponents: [],
    isHighConfidence: false,
    isStrongSignal: false,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { computeSignalScore };
