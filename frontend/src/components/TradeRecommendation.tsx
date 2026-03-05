'use client';

/**
 * TradeRecommendation Component
 *
 * Morning trade setup card for intraday NIFTY options trading.
 * Designed for ₹10,000 capital.
 *
 * Shows:
 *  • BUY CE / BUY PE / WAIT badge
 *  • Specific strike + option type
 *  • Entry, Target, Stop-Loss premiums
 *  • Lots affordable, investment deployed
 *  • Expected P&L (INR) if target / SL hit
 *  • Confidence score with reasons
 *  • Risk warnings
 *  • Multi-timeframe context (5m/15m)
 */

import type { TradeSetup, OIPattern, TradeTechnicals } from '@/types';

interface TradeRecommendationProps {
  tradeSetup: TradeSetup | null;
  oiPattern: OIPattern | null;
  isMarketOpen: boolean;
  currentPrice: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtInr(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function ConfidenceMeter({ score }: { score: number }) {
  const clamp = Math.min(100, Math.max(0, score));
  const color = clamp >= 70 ? 'bg-bullish' : clamp >= 45 ? 'bg-warning' : 'bg-bearish';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-text-muted">Confidence</span>
        <span className={clamp >= 70 ? 'text-bullish font-bold' : clamp >= 45 ? 'text-warning font-bold' : 'text-bearish font-bold'}>
          {clamp}%
        </span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${clamp}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TradeRecommendation({
  tradeSetup,
  oiPattern,
  isMarketOpen,
  currentPrice,
}: TradeRecommendationProps) {

  if (!tradeSetup) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Trade Recommendation</h2>
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <span className="text-3xl mb-2">⏳</span>
          <p className="text-sm">Initialising analysis engine…</p>
          <p className="text-xs mt-1">Collecting first OI snapshots (needs ~60 seconds).</p>
        </div>
      </div>
    );
  }

  const isWait      = tradeSetup.bias === 'WAIT';
  const isBullish   = tradeSetup.bias === 'BUY_CE';
  const isSimulation = tradeSetup.isSimulation ?? !isMarketOpen;
  const isConfirmed  = tradeSetup.isConfirmed ?? false;
  const streak       = tradeSetup.patternStreak ?? 0;

  const biasColor = isWait
    ? 'text-text-secondary'
    : isBullish
    ? 'text-bullish'
    : 'text-bearish';

  const biasBg = isWait
    ? 'bg-card border border-border text-text-secondary'
    : isBullish
    ? 'bg-bullish/20 border border-bullish/40 text-bullish'
    : 'bg-bearish/20 border border-bearish/40 text-bearish';

  const biasLabel = isWait ? '⏸ WAIT' : isBullish ? '▲ BUY CE' : '▼ BUY PE';

  // Risk/reward ratio visual
  const [rLeft, rRight] = (tradeSetup.rewardRisk || '1:1').split(':').map(Number);
  const rrRatio = rRight / (rLeft || 1);
  const rrColor = rrRatio >= 1.5 ? 'text-bullish' : rrRatio >= 1 ? 'text-warning' : 'text-bearish';

  return (
    <div className={`bg-card rounded-xl border p-4 space-y-4 ${
      isWait ? 'border-border' : isBullish ? 'border-bullish/40' : 'border-bearish/40'
    }`}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Trade Recommendation</h2>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <p className="text-[10px] text-text-muted">
              Capital: {fmtInr(tradeSetup.capital)} · {tradeSetup.timeframe.toUpperCase()} · Entry on 1m
            </p>
            {isSimulation && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30 tracking-wider">
                SIMULATION
              </span>
            )}
            {!isSimulation && isConfirmed && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-bullish/20 text-bullish border border-bullish/30 tracking-wider">
                ✓ {streak}× CONFIRMED
              </span>
            )}
            {!isSimulation && !isConfirmed && streak > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-card border border-border text-text-muted tracking-wider">
                {streak}/3 cycles — confirming...
              </span>
            )}
          </div>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${biasBg}`}>
          {biasLabel}
        </span>
      </div>

      {/* ── Simulation warning ── */}
      {isSimulation && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg px-3 py-2 space-y-0.5">
          <p className="text-[10px] text-warning font-semibold">🔬 Simulation Mode — Market Closed</p>
          <p className="text-[10px] text-warning/70">
            This analysis uses real price data + simulated OI flow. Verify at 9:15 AM IST when market opens. Do NOT trade based on simulation signals alone.
          </p>
        </div>
      )}

      {/* ── WAIT state ── */}
      {isWait ? (
        <div className="bg-background rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-text-secondary text-center">No high-confidence setup — wait for clarity</p>
          {/* Bull/Bear score breakdown */}
          {(tradeSetup.bullScore !== undefined && tradeSetup.bearScore !== undefined) && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-bullish font-semibold w-16">Bull {tradeSetup.bullScore}pts</span>
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-gradient-to-r from-bearish to-bullish rounded-full transition-all"
                  style={{
                    width: `${((tradeSetup.bullScore || 0) / Math.max((tradeSetup.bullScore || 0) + (tradeSetup.bearScore || 0), 1)) * 100}%`
                  }}
                />
              </div>
              <span className="text-bearish font-semibold w-16 text-right">Bear {tradeSetup.bearScore}pts</span>
            </div>
          )}
          {tradeSetup.reasons.map((r, i) => (
            <p key={i} className="text-xs text-text-muted flex items-start gap-1.5">
              <span className="text-warning mt-0.5">•</span>{r}
            </p>
          ))}
          {tradeSetup.warnings.map((w, i) => (
            <p key={i} className="text-xs text-warning flex items-start gap-1.5">
              <span className="mt-0.5">⚠</span>{w}
            </p>
          ))}
        </div>
      ) : (
        <>
          {/* ── Strike + Option Info ── */}
          <div className={`rounded-lg p-3 flex items-center justify-between ${
            isBullish ? 'bg-bullish/10' : 'bg-bearish/10'
          }`}>
            <div>
              <p className="text-[10px] text-text-muted mb-0.5">Recommended Option</p>
              <p className={`text-2xl font-black ${biasColor}`}>
                {tradeSetup.strike} {tradeSetup.type}
              </p>
              <p className="text-[10px] text-text-muted">
                Current LTP ≈ {fmtInr(tradeSetup.ltp)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-muted mb-0.5">Entry Premium</p>
              <p className={`text-xl font-bold ${biasColor}`}>{fmt(tradeSetup.entry)}</p>
              <p className="text-[10px] text-text-muted">per unit</p>
            </div>
          </div>

          {/* ── Entry / Target / SL ── */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Entry', value: tradeSetup.entry, color: 'text-text-primary' },
              { label: 'Target ✅', value: tradeSetup.target, color: 'text-bullish' },
              { label: 'Stop Loss ❌', value: tradeSetup.stopLoss, color: 'text-bearish' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-background rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-text-muted mb-1">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{fmt(value)}</p>
              </div>
            ))}
          </div>

          {/* ── Lots + P&L ── */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-background rounded-lg p-3">
              <p className="text-[9px] text-text-muted uppercase mb-1">Lots × 25 units</p>
              <p className="text-base font-bold text-text-primary">
                {tradeSetup.lots} lot{tradeSetup.lots !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-text-muted">
                Invest: {fmtInr(tradeSetup.investment)}
              </p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-[9px] text-text-muted uppercase mb-1">Reward:Risk</p>
              <p className={`text-base font-bold ${rrColor}`}>{tradeSetup.rewardRisk}</p>
              <p className="text-[10px] text-text-muted">
                {fmtInr(tradeSetup.pnlTarget)} / {fmtInr(Math.abs(tradeSetup.pnlSL))} SL
              </p>
            </div>
          </div>

          {/* ── Confidence ── */}
          <ConfidenceMeter score={tradeSetup.confidence} />

          {/* ── Reasons ── */}
          {tradeSetup.reasons.length > 0 && (
            <div className="bg-background rounded-lg p-3 space-y-1.5">
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Signals Supporting This Trade</p>
              {tradeSetup.reasons.map((r, i) => (
                <p key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                  <span className={`mt-0.5 ${isBullish ? 'text-bullish' : 'text-bearish'}`}>✓</span>{r}
                </p>
              ))}
            </div>
          )}

          {/* ── Warnings ── */}
          {tradeSetup.warnings.length > 0 && (
            <div className="bg-warning/5 border border-warning/30 rounded-lg p-3 space-y-1">
              <p className="text-[9px] text-warning uppercase tracking-wider mb-1">⚠ Risk Warnings</p>
              {tradeSetup.warnings.map((w, i) => (
                <p key={i} className="text-xs text-warning/80 flex items-start gap-1.5">
                  <span className="mt-0.5">•</span>{w}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Technical Summary (mini row) ── */}
      {!isWait && tradeSetup.technicals && (
        <div className="bg-background rounded-lg p-3">
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Technical Confluence</p>
          <div className="flex flex-wrap gap-1.5">
            {tradeSetup.technicals.rsi !== null && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                (tradeSetup.technicals.rsiZone === 'OVERBOUGHT' || tradeSetup.technicals.rsiZone === 'OVERSOLD')
                  ? 'text-warning border-warning/30 bg-warning/5'
                  : tradeSetup.technicals.rsiZone === 'BULLISH' ? 'text-bullish border-bullish/30 bg-bullish/5'
                  : tradeSetup.technicals.rsiZone === 'BEARISH' ? 'text-bearish border-bearish/20 bg-bearish/5'
                  : 'text-text-secondary border-border bg-card'
              }`}>
                RSI {tradeSetup.technicals.rsi?.toFixed(0)} · {tradeSetup.technicals.rsiZone}
              </span>
            )}
            {tradeSetup.technicals.emaTrend && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                tradeSetup.technicals.emaTrend?.includes('BULLISH') ? 'text-bullish border-bullish/30 bg-bullish/5'
                : tradeSetup.technicals.emaTrend?.includes('BEARISH') ? 'text-bearish border-bearish/20 bg-bearish/5'
                : 'text-text-secondary border-border bg-card'
              }`}>
                EMA · {tradeSetup.technicals.emaTrend?.replace('_', ' ')}
              </span>
            )}
            {tradeSetup.technicals.macdTrend && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                tradeSetup.technicals.macdTrend?.includes('BULLISH') ? 'text-bullish border-bullish/30 bg-bullish/5'
                : tradeSetup.technicals.macdTrend?.includes('BEARISH') ? 'text-bearish border-bearish/20 bg-bearish/5'
                : 'text-text-secondary border-border bg-card'
              }`}>
                MACD · {tradeSetup.technicals.macdTrend?.replace('_', ' ')}
              </span>
            )}
            {tradeSetup.technicals.pattern && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                tradeSetup.technicals.patternBias === 'bullish' ? 'text-bullish border-bullish/30 bg-bullish/5'
                : tradeSetup.technicals.patternBias === 'bearish' ? 'text-bearish border-bearish/20 bg-bearish/5'
                : 'text-text-secondary border-border bg-card'
              }`}>
                {tradeSetup.technicals.patternEmoji} {tradeSetup.technicals.pattern?.replace(/_/g, ' ')}
              </span>
            )}
            {tradeSetup.technicals.bbSqueeze && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border text-warning border-warning/30 bg-warning/5 animate-pulse">
                🔥 BB Squeeze
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Non-market-hours notice ── */}
      {!isMarketOpen && !isWait && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-text-muted text-center">
            ⚠️ Simulation only — always cross-check at market open (9:15 AM IST Mon–Fri) before placing any real trade.
          </p>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="text-[9px] text-text-muted text-center border-t border-border pt-2">
        For analytical purposes only. Not investment advice. Always use stop-losses.
      </p>
    </div>
  );
}
