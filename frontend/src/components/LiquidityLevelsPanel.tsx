'use client';

/**
 * LiquidityLevelsPanel
 *
 * Displays smart-money liquidity concepts:
 *  - Previous Day High (PDH) / Previous Day Low (PDL) — most hunted levels
 *  - Equal Highs / Equal Lows — liquidity pools (stop orders cluster here)
 *  - Stop Hunts — price swept a level then reversed (confirms liquidity taken)
 *
 * Why this matters:
 *  - Retail traders place stops at obvious levels. Institutions hunt those stops.
 *  - After a stop hunt, price often reverses sharply — ideal for fading the sweep.
 *  - PDH/PDL are the highest-probability support/resistance for the current session.
 */

import type { LiquidityLevels } from '@/types';
import { Layers } from 'lucide-react';

interface LiquidityLevelsPanelProps {
  liquidityLevels: LiquidityLevels | null;
  currentPrice: number | null;
}

function DistanceBadge({ price, currentPrice, isResistance }: { price: number; currentPrice: number | null; isResistance: boolean }) {
  if (currentPrice == null) return null;
  const diff    = price - currentPrice;
  const diffPct = (diff / currentPrice) * 100;
  const color   = isResistance ? 'text-bearish' : 'text-bullish';
  return (
    <span className={`text-[9px] tabular-nums ${color}`}>
      {diff >= 0 ? '+' : ''}{diff.toFixed(0)} ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(2)}%)
    </span>
  );
}

export default function LiquidityLevelsPanel({
  liquidityLevels,
  currentPrice,
}: LiquidityLevelsPanelProps) {
  if (!liquidityLevels) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          Liquidity Levels
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">🎯</span>
          <p className="text-xs">Detecting liquidity pools…</p>
        </div>
      </div>
    );
  }

  const {
    prevDayHigh, prevDayLow,
    todayHigh, todayLow,
    equalHighs, equalLows,
    stopHunts,
    nearestLevel,
    summary,
  } = liquidityLevels;

  const stopHuntBiasColor = (bias: string) =>
    bias === 'bullish' ? 'text-bullish' : bias === 'bearish' ? 'text-bearish' : 'text-text-secondary';

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          Liquidity Levels
        </h2>
        {nearestLevel && (
          <div className="text-right">
            <p className="text-[8px] text-text-muted uppercase tracking-wider">Nearest</p>
            <p className="text-[10px] font-bold text-warning">{nearestLevel.label}</p>
            <p className="text-[9px] text-text-muted tabular-nums">{nearestLevel.price?.toFixed(1)}</p>
          </div>
        )}
      </div>

      {/* ── PDH / PDL ── */}
      <div>
        <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Previous Day Range</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-bearish/10 border border-bearish/20 p-2.5">
            <p className="text-[9px] text-text-muted mb-0.5">Prev High (PDH)</p>
            <p className="text-sm font-bold text-bearish tabular-nums">{prevDayHigh?.toFixed(1) ?? '—'}</p>
            {prevDayHigh != null && <DistanceBadge price={prevDayHigh} currentPrice={currentPrice} isResistance />}
          </div>
          <div className="rounded-lg bg-bullish/10 border border-bullish/20 p-2.5">
            <p className="text-[9px] text-text-muted mb-0.5">Prev Low (PDL)</p>
            <p className="text-sm font-bold text-bullish tabular-nums">{prevDayLow?.toFixed(1) ?? '—'}</p>
            {prevDayLow != null && <DistanceBadge price={prevDayLow} currentPrice={currentPrice} isResistance={false} />}
          </div>
        </div>
      </div>

      {/* ── Today's Extremes ── */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-background border border-border p-1.5">
          <p className="text-[8px] text-text-muted uppercase">Today High</p>
          <p className="text-xs font-semibold text-text-primary tabular-nums">{todayHigh?.toFixed(1) ?? '—'}</p>
        </div>
        <div className="rounded bg-background border border-border p-1.5">
          <p className="text-[8px] text-text-muted uppercase">Today Low</p>
          <p className="text-xs font-semibold text-text-primary tabular-nums">{todayLow?.toFixed(1) ?? '—'}</p>
        </div>
      </div>

      {/* ── Equal Highs ── */}
      {equalHighs.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">
            Equal Highs ({equalHighs.length}) — Sell-side liquidity
          </p>
          <div className="space-y-1">
            {equalHighs.slice(0, 3).map((lvl, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-bearish/5 border border-bearish/15 px-2 py-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-bearish">EQH</span>
                  <span className="text-[10px] font-medium text-text-primary tabular-nums">{lvl.price.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-text-muted">{lvl.count}× touches</span>
                  <DistanceBadge price={lvl.price} currentPrice={currentPrice} isResistance />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Equal Lows ── */}
      {equalLows.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">
            Equal Lows ({equalLows.length}) — Buy-side liquidity
          </p>
          <div className="space-y-1">
            {equalLows.slice(0, 3).map((lvl, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-bullish/5 border border-bullish/15 px-2 py-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-bullish">EQL</span>
                  <span className="text-[10px] font-medium text-text-primary tabular-nums">{lvl.price.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-text-muted">{lvl.count}× touches</span>
                  <DistanceBadge price={lvl.price} currentPrice={currentPrice} isResistance={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stop Hunts ── */}
      {stopHunts.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">
            Stop Hunts — {stopHunts.length} detected today
          </p>
          <div className="space-y-1">
            {stopHunts.slice(0, 3).map((sh, i) => (
              <div
                key={i}
                className={`rounded border px-2 py-1.5 ${sh.bias === 'bullish' ? 'bg-bullish/5 border-bullish/20' : 'bg-bearish/5 border-bearish/20'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold ${stopHuntBiasColor(sh.bias)}`}>
                    {sh.type === 'HIGH_SWEEP' ? '▲ High Sweep' : '▼ Low Sweep'}
                  </span>
                  <span className="text-[9px] font-semibold text-warning">
                    {sh.strength} ★
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-[9px] text-text-muted">
                  <span>Swept: {sh.sweepAt.toFixed(1)}</span>
                  <span>Closed: {sh.closeAt.toFixed(1)}</span>
                </div>
                <p className="text-[9px] text-text-secondary mt-0.5">
                  {sh.bias === 'bullish'
                    ? 'Institutions may push price up after grabbing buy-side liquidity'
                    : 'Institutions may push price down after grabbing sell-side liquidity'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No Pools ── */}
      {equalHighs.length === 0 && equalLows.length === 0 && stopHunts.length === 0 && (
        <p className="text-xs text-text-muted italic text-center py-2">
          No equal highs / lows or stop hunt events detected yet.
        </p>
      )}

      {/* ── Summary ── */}
      {summary && (
        <div className="rounded-lg bg-background/50 border border-border/50 p-2">
          <p className="text-[10px] text-text-secondary leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
