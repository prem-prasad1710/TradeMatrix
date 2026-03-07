'use client';

/**
 * InstitutionalFlowPanel
 *
 * Displays FII (Foreign Institutional Investor) and DII (Domestic Institutional
 * Investor) net buying / selling activity.
 *
 * Why this matters:
 *  - FII flows are the single largest driver of NIFTY direction.
 *  - FII buying = sustained rally. FII selling = risk-off / distribution.
 *  - DII often counters FII (buy when FII sells = "price support").
 *  - Combined net flow gives the institutional consensus.
 */

import type { FIIDIIData } from '@/types';
import { Building2 } from 'lucide-react';

interface InstitutionalFlowPanelProps {
  fiiDii: FIIDIIData | null;
}

function FlowBar({
  label,
  buyValue,
  sellValue,
  netValue,
  netValueCr,
  isBuyer,
}: {
  label: string;
  buyValue: number;
  sellValue: number;
  netValue: number;
  netValueCr: string;
  isBuyer: boolean;
}) {
  const total      = buyValue + sellValue;
  const buyPct     = total > 0 ? (buyValue  / total) * 100 : 50;
  const sellPct    = total > 0 ? (sellValue / total) * 100 : 50;
  const netColor   = isBuyer ? 'text-bullish' : netValue < 0 ? 'text-bearish' : 'text-text-secondary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${netColor}`}>
          {netValue >= 0 ? '+' : ''}{netValueCr}
        </span>
      </div>

      {/* Buy / Sell bar */}
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        <div
          className="bg-bullish rounded-l-full transition-all duration-700"
          style={{ width: `${buyPct}%` }}
          title={`Buy: ₹${buyValue.toFixed(0)} Cr`}
        />
        <div
          className="bg-bearish rounded-r-full transition-all duration-700 ml-auto"
          style={{ width: `${sellPct}%` }}
          title={`Sell: ₹${sellValue.toFixed(0)} Cr`}
        />
      </div>

      <div className="flex justify-between text-[9px] text-text-muted">
        <span>Buy: ₹{buyValue.toLocaleString('en-IN')} Cr</span>
        <span>Sell: ₹{sellValue.toLocaleString('en-IN')} Cr</span>
      </div>
    </div>
  );
}

export default function InstitutionalFlowPanel({ fiiDii }: InstitutionalFlowPanelProps) {
  if (!fiiDii) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-accent" />
          Institutional Flow (FII/DII)
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">🏛️</span>
          <p className="text-xs">Fetching FII/DII data…</p>
        </div>
      </div>
    );
  }

  const {
    fii, dii, netCombinedCr, bias,
    date, isMock, isStale,
  } = fiiDii;

  const biasColors: Record<string, string> = {
    STRONGLY_BULLISH: 'bg-bullish/20 border-bullish/40 text-bullish',
    BULLISH:          'bg-bullish/10 border-bullish/30 text-bullish',
    NEUTRAL:          'bg-card border-border text-text-secondary',
    BEARISH:          'bg-bearish/10 border-bearish/30 text-bearish',
    STRONGLY_BEARISH: 'bg-bearish/20 border-bearish/40 text-bearish',
  };
  const biasStyle = biasColors[bias.bias] ?? biasColors.NEUTRAL;

  const netCombined = fii.netValue + dii.netValue;
  const netColor = netCombined >= 0 ? 'text-bullish' : 'text-bearish';

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Building2 className="w-4 h-4 text-accent" />
          Institutional Flow
        </h2>
        <div className="flex flex-col items-end gap-1">
          {isMock && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30 tracking-wider">
              EST.
            </span>
          )}
          {isStale && (
            <span className="text-[9px] text-text-muted">Stale</span>
          )}
          <span className="text-[9px] text-text-muted">{date}</span>
        </div>
      </div>

      {/* ── Bias Badge ── */}
      <div className={`rounded-lg border p-2.5 ${biasStyle}`}>
        <p className="text-xs font-bold">{bias.label}</p>
        <p className="text-[10px] mt-0.5 opacity-80">{bias.description}</p>
      </div>

      {/* ── FII Flow ── */}
      <FlowBar
        label="FII (Foreign)"
        buyValue={fii.buyValue}
        sellValue={fii.sellValue}
        netValue={fii.netValue}
        netValueCr={fii.netValueCr}
        isBuyer={fii.isBuyer}
      />

      {/* ── DII Flow ── */}
      <FlowBar
        label="DII (Domestic)"
        buyValue={dii.buyValue}
        sellValue={dii.sellValue}
        netValue={dii.netValue}
        netValueCr={dii.netValueCr}
        isBuyer={dii.isBuyer}
      />

      {/* ── Combined Net ── */}
      <div className="bg-background rounded-lg p-2.5 flex justify-between items-center">
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Combined Net</p>
          <p className={`text-sm font-bold tabular-nums ${netColor}`}>
            {netCombined >= 0 ? '+' : ''}{netCombinedCr}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Direction</p>
          <p className={`text-xs font-bold ${netColor}`}>
            {netCombined > 1000 ? '🟢 Buying' : netCombined < -1000 ? '🔴 Selling' : '⚪ Flat'}
          </p>
        </div>
      </div>

      {/* ── Interpretation ── */}
      <div className="rounded-lg bg-background/50 border border-border/50 p-2">
        <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">How to interpret</p>
        <p className="text-[10px] text-text-secondary leading-relaxed">
          FII = primary trend driver. DII = contrarian support. Both buying = strongest signal.
          FII selling absorbed by DII = market supported but limited upside.
        </p>
      </div>
    </div>
  );
}
