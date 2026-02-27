/**
 * Option Chain Parser & OI Analysis Utility
 *
 * Parses raw NSE option chain JSON and computes:
 *   - Strike-level Call/Put OI, OI change, IV
 *   - Highest OI strikes (support/resistance proxies)
 *   - Put/Call Ratio (PCR)
 *   - Max Pain level
 *   - Buildup detection per strike
 */

/**
 * Parse the raw NSE API response into a structured, frontend-ready format.
 * 
 * NSE response structure:
 *   data.records.data[] — array of { strikePrice, expiryDate, CE: {...}, PE: {...} }
 *   data.records.underlyingValue — current NIFTY spot price
 *   data.filtered.data[] — filtered around ATM
 */
function parseOptionChain(raw) {
  const records = raw?.records?.data || [];
  const filteredData = raw?.filtered?.data || raw?.records?.data || [];
  const underlyingValue = raw?.records?.underlyingValue || 0;
  const expiryDates = raw?.records?.expiryDates || [];

  // Use near-expiry data (first expiry = nearest weekly/monthly)
  const nearExpiry = expiryDates[0];

  // Filter to nearest expiry and process strikes
  const strikes = filteredData
    .filter(item => !nearExpiry || item.expiryDate === nearExpiry)
    .map(item => {
      const ce = item.CE || {};  // Call option data
      const pe = item.PE || {};  // Put option data

      return {
        strikePrice: item.strikePrice,
        expiryDate: item.expiryDate,
        call: {
          oi: ce.openInterest || 0,
          oiChange: ce.changeinOpenInterest || 0,
          oiChangePct: ce.pchangeinOpenInterest || 0,
          volume: ce.totalTradedVolume || 0,
          iv: ce.impliedVolatility || 0,
          ltp: ce.lastPrice || 0,
          bid: ce.bidprice || 0,
          ask: ce.askPrice || 0,
          delta: estimateDelta(ce.lastPrice, item.strikePrice, underlyingValue, 'CE'),
        },
        put: {
          oi: pe.openInterest || 0,
          oiChange: pe.changeinOpenInterest || 0,
          oiChangePct: pe.pchangeinOpenInterest || 0,
          volume: pe.totalTradedVolume || 0,
          iv: pe.impliedVolatility || 0,
          ltp: pe.lastPrice || 0,
          bid: pe.bidprice || 0,
          ask: pe.askPrice || 0,
          delta: estimateDelta(pe.lastPrice, item.strikePrice, underlyingValue, 'PE'),
        },
        netOI: (pe.openInterest || 0) - (ce.openInterest || 0), // Positive = put heavy (bullish)
        atm: Math.abs(item.strikePrice - underlyingValue) < 100,
      };
    })
    .filter(s => s.strikePrice > 0)
    .sort((a, b) => a.strikePrice - b.strikePrice);

  return {
    underlyingValue,
    expiryDate: nearExpiry,
    allExpiryDates: expiryDates,
    strikes,
    fetchTime: new Date().toISOString(),
  };
}

/**
 * Compute all OI-based analytics from parsed option chain data.
 * 
 * Returns:
 *   - pcr: Put/Call Ratio (total Put OI / total Call OI)
 *   - maxPain: the strike where total option buyers lose the most
 *   - highestCallOI, highestPutOI: key resistance/support levels
 *   - totalCallOI, totalPutOI
 *   - oiBuildupSignals: per-strike buildup classification
 *   - supportLevels, resistanceLevels
 */
function computeOIAnalysis(parsed, currentPrice) {
  const { strikes, underlyingValue } = parsed;
  const price = currentPrice || underlyingValue;

  if (!strikes || strikes.length === 0) {
    return { pcr: 1, maxPain: price, highestCallOI: 0, highestPutOI: 0 };
  }

  // ── Total OI ──────────────────────────────────────────────────────────────
  const totalCallOI = strikes.reduce((sum, s) => sum + s.call.oi, 0);
  const totalPutOI = strikes.reduce((sum, s) => sum + s.put.oi, 0);

  // ── Put/Call Ratio ────────────────────────────────────────────────────────
  // PCR > 1.2 → Bullish (more puts = hedgers, supports rally)
  // PCR < 0.7 → Bearish (more calls = resistance selling)
  const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

  // ── Max Pain Calculation ──────────────────────────────────────────────────
  // Max pain = strike where option SELLERS make maximum profit
  // = strike where total option buyer loss is MAXIMUM
  // We find this by computing total OTM loss at each strike
  const maxPain = computeMaxPain(strikes);

  // ── Highest OI Strikes ────────────────────────────────────────────────────
  // Highest Call OI → Key resistance (sellers wrote most calls here)
  // Highest Put OI → Key support (sellers wrote most puts here)
  const sortedByCallOI = [...strikes].sort((a, b) => b.call.oi - a.call.oi);
  const sortedByPutOI = [...strikes].sort((a, b) => b.put.oi - a.put.oi);

  const topCallStrikes = sortedByCallOI.slice(0, 5);
  const topPutStrikes = sortedByPutOI.slice(0, 5);

  // Resistance = highest call OI strikes ABOVE current price
  const resistanceLevels = topCallStrikes
    .filter(s => s.strikePrice >= price)
    .map(s => ({ strike: s.strikePrice, oi: s.call.oi, type: 'CALL_WALL' }));

  // Support = highest put OI strikes BELOW current price
  const supportLevels = topPutStrikes
    .filter(s => s.strikePrice <= price)
    .map(s => ({ strike: s.strikePrice, oi: s.put.oi, type: 'PUT_WALL' }));

  // ── Buildup Detection Per Strike ──────────────────────────────────────────
  // Long Buildup: Price UP + OI UP (fresh longs being added)
  // Short Buildup: Price DOWN + OI UP (fresh shorts being added)
  // Long Unwinding: Price DOWN + OI DOWN (longs exiting)
  // Short Covering: Price UP + OI DOWN (shorts exiting → rally)
  const oiBuildupSignals = strikes.map(s => {
    const callBuildup = classifyBuildup(s.call.oiChange, 0); // Price direction unknown at strike level
    const putBuildup = classifyBuildup(s.put.oiChange, 0);
    return {
      strikePrice: s.strikePrice,
      callBuildup,
      putBuildup,
    };
  });

  // ── OI Change Heat (where is the action?) ─────────────────────────────────
  const callOIHeat = strikes
    .filter(s => Math.abs(s.call.oiChange) > 0)
    .sort((a, b) => Math.abs(b.call.oiChange) - Math.abs(a.call.oiChange))
    .slice(0, 10);

  const putOIHeat = strikes
    .filter(s => Math.abs(s.put.oiChange) > 0)
    .sort((a, b) => Math.abs(b.put.oiChange) - Math.abs(a.put.oiChange))
    .slice(0, 10);

  return {
    pcr: parseFloat(pcr.toFixed(3)),
    pcrSentiment: getPCRSentiment(pcr),
    maxPain,
    highestCallOI: topCallStrikes[0]?.call.oi || 0,
    highestCallStrike: topCallStrikes[0]?.strikePrice || 0,
    highestPutOI: topPutStrikes[0]?.put.oi || 0,
    highestPutStrike: topPutStrikes[0]?.strikePrice || 0,
    totalCallOI,
    totalPutOI,
    resistanceLevels: resistanceLevels.slice(0, 3),
    supportLevels: supportLevels.slice(0, 3),
    oiBuildupSignals,
    callOIHeat,
    putOIHeat,
    atmStrike: findATMStrike(strikes, price),
  };
}

/**
 * Max Pain Algorithm:
 * For each potential expiry price (each strike), compute the total loss
 * that all option buyers would incur. The strike with max total loss = max pain.
 */
function computeMaxPain(strikes) {
  if (strikes.length === 0) return 0;

  let minLoss = Infinity;
  let maxPainStrike = strikes[0].strikePrice;

  strikes.forEach(targetStrike => {
    let totalLoss = 0;

    strikes.forEach(s => {
      // Call buyer loss: if market expires at targetStrike, calls above it expire worthless
      if (s.strikePrice > targetStrike.strikePrice) {
        // Call OI * (strikePrice - targetStrike) = call buyer loss at this expiry
        totalLoss += s.call.oi * (s.strikePrice - targetStrike.strikePrice);
      }
      // Put buyer loss: puts below targetStrike expire worthless
      if (s.strikePrice < targetStrike.strikePrice) {
        totalLoss += s.put.oi * (targetStrike.strikePrice - s.strikePrice);
      }
    });

    // We want the strike where option buyers lose the MOST
    // (i.e., max pain for buyers = where market gravitates toward at expiry)
    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = targetStrike.strikePrice;
    }
  });

  return maxPainStrike;
}

/**
 * Classify OI change as a buildup type.
 * priceChange: positive = price up, negative = price down
 */
function classifyBuildup(oiChange, priceChange) {
  if (oiChange > 0 && priceChange >= 0) return 'LONG_BUILDUP';
  if (oiChange > 0 && priceChange < 0) return 'SHORT_BUILDUP';
  if (oiChange < 0 && priceChange < 0) return 'LONG_UNWINDING';
  if (oiChange < 0 && priceChange >= 0) return 'SHORT_COVERING';
  return 'NEUTRAL';
}

/**
 * Simple approximate delta for display purposes.
 * Real delta requires Black-Scholes but this gives a rough estimate.
 */
function estimateDelta(ltp, strike, spot, type) {
  if (!ltp || !strike || !spot) return 0;
  const moneyness = (spot - strike) / spot;
  if (type === 'CE') return Math.max(0, Math.min(1, 0.5 + moneyness * 2)).toFixed(2);
  if (type === 'PE') return Math.max(-1, Math.min(0, -0.5 + moneyness * 2)).toFixed(2);
  return 0;
}

/**
 * Find the at-the-money strike closest to current price.
 */
function findATMStrike(strikes, price) {
  return strikes.reduce((closest, s) => {
    return Math.abs(s.strikePrice - price) < Math.abs(closest - price)
      ? s.strikePrice
      : closest;
  }, strikes[0]?.strikePrice || price);
}

/**
 * Get a human-readable PCR sentiment label.
 */
function getPCRSentiment(pcr) {
  if (pcr >= 1.5) return 'EXTREMELY_BULLISH';
  if (pcr >= 1.2) return 'BULLISH';
  if (pcr >= 0.9) return 'NEUTRAL';
  if (pcr >= 0.7) return 'BEARISH';
  return 'EXTREMELY_BEARISH';
}

module.exports = { parseOptionChain, computeOIAnalysis, computeMaxPain, classifyBuildup };
