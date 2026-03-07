/**
 * Gamma Exposure (GEX) Engine
 *
 * Approximates dealer gamma exposure from NSE option chain OI data.
 *
 * Theory:
 *   - Market Makers (dealers) take the opposite side of retail/institutional trades.
 *   - When a trader BUYS a call → dealer is SHORT the call → dealer is LONG gamma.
 *   - When a trader BUYS a put  → dealer is SHORT the put  → dealer is SHORT gamma.
 *
 *   From the dealer's perspective:
 *     Call GEX per strike = +OI × Gamma × LotSize × Spot²/100   (long gamma)
 *     Put  GEX per strike = -OI × Gamma × LotSize × Spot²/100   (short gamma)
 *     Net GEX = Σ(Call GEX) + Σ(Put GEX)
 *
 * Gamma Flip Level: the strike where cumulative net GEX crosses zero.
 *   - Above flip → Dealers long gamma → stabilising (sell rallies, buy dips)
 *   - Below flip → Dealers short gamma → destabilising (buy rallies, sell dips)
 *
 * Positive Gamma Zone: price range where net GEX > 0 → low volatility expected.
 * Negative Gamma Zone: price range where net GEX < 0 → high volatility expected.
 *
 * NOTE: This is an approximation. Real GEX requires exact dealer positioning
 *       and true option Greeks, which are not available from public NSE data.
 */

const LOT_SIZE = 25; // NIFTY lot size (since Jan 2025)

/**
 * Compute Black-Scholes Gamma for a European option.
 *
 * Gamma = N'(d1) / (S × σ × √T)
 *   d1   = [ln(S/K) + (r + 0.5σ²)T] / (σ√T)
 *   N'(d1) = standard normal PDF = exp(-d1²/2) / √(2π)
 *
 * @param {number} spot    - Current underlying price
 * @param {number} strike  - Option strike price
 * @param {number} iv      - Implied volatility in percent (e.g. 15 for 15%)
 * @param {number} dte     - Days to expiry
 * @param {number} r       - Risk-free rate (default 7% for India)
 * @returns {number} gamma value
 */
function computeBSGamma(spot, strike, iv, dte, r = 0.07) {
  if (!iv || iv <= 0 || !dte || dte <= 0 || !spot || !strike) return 0;

  const T = dte / 365;
  const sigma = iv / 100; // convert percent to decimal
  const sqrtT = Math.sqrt(T);

  const d1 =
    (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * sqrtT);

  // Standard normal PDF at d1
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

  return nd1 / (spot * sigma * sqrtT);
}

/**
 * Estimate days-to-expiry from an NSE expiry date string.
 * NSE format: "27-Mar-2025" or "27 Mar 2025"
 *
 * @param {string} expiryDateStr - Expiry date from NSE
 * @returns {number} days to expiry (minimum 1 to avoid zero)
 */
function daysToExpiry(expiryDateStr) {
  if (!expiryDateStr) return 7; // fallback: 1 week

  try {
    const cleaned = expiryDateStr.replace(/-/g, ' ');
    const exp = new Date(cleaned);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, days);
  } catch {
    return 7;
  }
}

/**
 * Compute Gamma Exposure for each strike and aggregate into:
 *   - Per-strike GEX profile
 *   - Total net GEX
 *   - Gamma flip level
 *   - Positive / negative gamma zones
 *   - Key squeeze levels (strikes where GEX is most extreme)
 *
 * @param {object} parsedChain  - Output from parseOptionChain()
 * @param {number} spot         - Current NIFTY spot price
 * @returns {GammaExposureResult}
 */
function computeGammaExposure(parsedChain, spot) {
  const { strikes = [], expiryDate } = parsedChain;
  if (!strikes.length || !spot) {
    return {
      strikeGEX: [],
      netGEX: 0,
      gammaFlipLevel: null,
      positiveGammaZone: null,
      negativeGammaZone: null,
      squeezeLevels: [],
      summary: 'Insufficient data',
      bias: 'NEUTRAL',
    };
  }

  const dte = daysToExpiry(expiryDate);

  // ── Per-strike GEX computation ─────────────────────────────────────────────
  const strikeGEX = strikes.map(s => {
    const K = s.strikePrice;

    // Use average of call/put IV if available; fall back to higher of the two
    const ceIV = s.call.iv || 0;
    const peIV = s.put.iv || 0;
    const iv   = ceIV > 0 && peIV > 0 ? (ceIV + peIV) / 2 : ceIV || peIV || 15;

    const gamma = computeBSGamma(spot, K, iv, dte);

    // Dollar GEX scaling: OI × gamma × lot_size × spot (gives ₹ sensitivity per 1pt move)
    const scaleFactor = LOT_SIZE * spot;

    // Dealer is LONG gamma from call shorts → positive GEX from calls
    const callGEX = s.call.oi * gamma * scaleFactor;

    // Dealer is SHORT gamma from put shorts → negative GEX from puts
    const putGEX  = -s.put.oi * gamma * scaleFactor;

    const netGEX = callGEX + putGEX;

    return {
      strike:   K,
      callGEX:  Math.round(callGEX),
      putGEX:   Math.round(putGEX),
      netGEX:   Math.round(netGEX),
      gamma:    parseFloat(gamma.toFixed(6)),
      callOI:   s.call.oi,
      putOI:    s.put.oi,
      iv:       parseFloat(iv.toFixed(2)),
      distFromSpot: K - spot,
      isATM: Math.abs(K - spot) < 60,
    };
  });

  // ── Net GEX (aggregate across all strikes) ────────────────────────────────
  const totalNetGEX = strikeGEX.reduce((sum, s) => sum + s.netGEX, 0);

  // ── Gamma Flip Level ──────────────────────────────────────────────────────
  // Sort strikes by strike price; find where cumulative GEX crosses zero.
  const sorted = [...strikeGEX].sort((a, b) => a.strike - b.strike);
  let cumGEX = 0;
  let gammaFlipLevel = null;
  let prevStrike = null;

  for (const s of sorted) {
    const prevCum = cumGEX;
    cumGEX += s.netGEX;

    if (prevStrike !== null && prevCum * cumGEX < 0) {
      // Zero-crossing between prevStrike and s.strike — interpolate
      const t = Math.abs(prevCum) / (Math.abs(prevCum) + Math.abs(cumGEX));
      gammaFlipLevel = Math.round(prevStrike + t * (s.strike - prevStrike));
      break;
    }
    prevStrike = s.strike;
  }

  // ── Gamma Zones ──────────────────────────────────────────────────────────
  // Positive Gamma Zone: strikes where net GEX > 0 AND within 200 pts of spot
  const nearStrikes = strikeGEX.filter(s => Math.abs(s.distFromSpot) <= 300);
  const posNear = nearStrikes.filter(s => s.netGEX > 0);
  const negNear = nearStrikes.filter(s => s.netGEX < 0);

  const positiveGammaZone = posNear.length > 0
    ? {
        low:   Math.min(...posNear.map(s => s.strike)),
        high:  Math.max(...posNear.map(s => s.strike)),
        totalGEX: posNear.reduce((sum, s) => sum + s.netGEX, 0),
      }
    : null;

  const negativeGammaZone = negNear.length > 0
    ? {
        low:   Math.min(...negNear.map(s => s.strike)),
        high:  Math.max(...negNear.map(s => s.strike)),
        totalGEX: negNear.reduce((sum, s) => sum + s.netGEX, 0),
      }
    : null;

  // ── Key Squeeze Levels (top 3 by absolute GEX) ───────────────────────────
  const squeezeLevels = [...strikeGEX]
    .sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX))
    .slice(0, 5)
    .map(s => ({
      strike:  s.strike,
      netGEX:  s.netGEX,
      type:    s.netGEX > 0 ? 'POSITIVE' : 'NEGATIVE',
      label:   s.netGEX > 0 ? 'Long Gamma (stabilising)' : 'Short Gamma (squeeze risk)',
    }));

  // ── Summary / Bias ────────────────────────────────────────────────────────
  const isPositiveGamma = totalNetGEX > 0;
  const gexBillions = (totalNetGEX / 1e9).toFixed(2);
  const priceVsFlip = gammaFlipLevel ? spot - gammaFlipLevel : null;

  let bias = 'NEUTRAL';
  let summary = '';

  if (gammaFlipLevel) {
    if (spot > gammaFlipLevel) {
      bias = 'POSITIVE_GAMMA';
      summary = `Price (${spot}) above Gamma Flip (${gammaFlipLevel}) — dealers long gamma, expect mean reversion, low vol`;
    } else {
      bias = 'NEGATIVE_GAMMA';
      summary = `Price (${spot}) below Gamma Flip (${gammaFlipLevel}) — dealers short gamma, expect trending/volatile moves`;
    }
  } else {
    bias = isPositiveGamma ? 'POSITIVE_GAMMA' : 'NEGATIVE_GAMMA';
    summary = isPositiveGamma
      ? `Net positive GEX (₹${gexBillions}B) — stabilising environment`
      : `Net negative GEX (₹${gexBillions}B) — volatility expansion risk`;
  }

  return {
    strikeGEX,                      // Array — one entry per strike for chart
    netGEX:           Math.round(totalNetGEX),
    netGEXBillions:   parseFloat(gexBillions),
    gammaFlipLevel,                 // The key level to watch
    priceVsFlip,                    // positive = above flip
    positiveGammaZone,
    negativeGammaZone,
    squeezeLevels,
    dte,
    bias,
    summary,
    isPositiveGamma,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { computeGammaExposure };
