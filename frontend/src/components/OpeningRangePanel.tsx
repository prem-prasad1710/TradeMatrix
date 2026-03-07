'use client';

/**
 * OpeningRangePanel
 *
 * Shows the Opening Range (OR) from the first 15 minutes of trading (9:15–9:30 IST).
 *
 * Why this matters:
 *  - The opening range high / low are the most watched intraday levels.
 *  - A breakout above the OR high = bullish intent; below OR low = bearish.
 *  - Target projections use 1× and 2× the OR range, giving measured move targets.
 *  - VWAP inside OR = balanced open; VWAP outside = directional open.
 */

import type { OpeningRange } from '@/types';
import { Clock } from 'lucide-react';

interface OpeningRangePanelProps {
  openingRange: OpeningRange | null;
  currentPrice: number | null;
}

export default function OpeningRangePanel({
  openingRange,
  currentPrice,
}: OpeningRangePanelProps) {
  if (!openingRange || openingRange.status === 'NO_DATA' || openingRange.status === 'MARKET_NOT_OPEN') {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          Opening Range (9:15–9:30)
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">⏳</span>
          <p className="text-xs">
            {openingRange?.status === 'MARKET_NOT_OPEN'
              ? 'Market has not opened yet'
              : 'Waiting for 9:15–9:30 IST opening range…'}
          </p>
        </div>
      </div>
    );
  }

  const { high, low, mid, range, rangePct, status, label, breakout, target1, target2, stop, score, candleCount } = openingRange;

  const statusStyles: Record<string, { badge: string; text: string }> = {
    ABOVE_OR: {
      badge: 'bg-bullish/20 border-bullish/40 text-bullish',
      text:  'Price is trading ABOVE the opening range — bullish bias.',
    },
    INSIDE_OR: {
      badge: 'bg-warning/20 border-warning/40 text-warning',
      text:  'Price is inside the opening range — indecisive / consolidation.',
    },
    BELOW_OR: {
      badge: 'bg-bearish/20 border-bearish/40 text-bearish',
      text:  'Price is trading BELOW the opening range — bearish bias.',
    },
  };

  const s = statusStyles[status] ?? statusStyles.INSIDE_OR;

  // Distance from current price to key levels
  const distToHigh = currentPrice != null && high != null ? ((high - currentPrice) / currentPrice * 100) : null;
  const distToLow  = currentPrice != null && low != null  ? ((currentPrice - low) / currentPrice * 100) : null;

  // Breakout strength color
  const bsColor = breakout ? (breakout.strength === 'STRONG' ? 'text-bullish' : 'text-warning') : '';

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          Opening Range
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-muted">{candleCount} candles</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>
            {label}
          </span>
        </div>
      </div>

      {/* ── OR Levels ── */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bearish/10 border border-bearish/20 p-2">
          <p className="text-[9px] text-text-muted uppercase mb-1">OR High</p>
          <p className="text-sm font-bold text-bearish tabular-nums">{high?.toFixed(1) ?? '—'}</p>
          {distToHigh !== null && (
            <p className="text-[9px] text-text-muted mt-0.5">
              {distToHigh >= 0 ? `+${distToHigh.toFixed(2)}%` : `${distToHigh.toFixed(2)}%`} away
            </p>
          )}
        </div>
        <div className="rounded-lg bg-background border border-border p-2">
          <p className="text-[9px] text-text-muted uppercase mb-1">OR Mid</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{mid?.toFixed(1) ?? '—'}</p>
          <p className="text-[9px] text-text-muted mt-0.5">±{(rangePct / 2).toFixed(2)}%</p>
        </div>
        <div className="rounded-lg bg-bullish/10 border border-bullish/20 p-2">
          <p className="text-[9px] text-text-muted uppercase mb-1">OR Low</p>
          <p className="text-sm font-bold text-bullish tabular-nums">{low?.toFixed(1) ?? '—'}</p>
          {distToLow !== null && (
            <p className="text-[9px] text-text-muted mt-0.5">
              {distToLow >= 0 ? `${distToLow.toFixed(2)}%` : `${distToLow.toFixed(2)}%`} away
            </p>
          )}
        </div>
      </div>

      {/* ── Range Width ── */}
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">OR Width</span>
        <span className="font-semibold text-text-primary tabular-nums">
          {range?.toFixed(1) ?? '—'} pts ({rangePct.toFixed(2)}%)
        </span>
      </div>

      {/* ── Status ── */}
      <div className={`rounded-lg border p-2.5 ${s.badge}`}>
        <p className="text-[10px] font-medium">{s.text}</p>
      </div>

      {/* ── Breakout ── */}
      {breakout && (
        <div className="rounded-lg bg-background/60 border border-border p-2.5 space-y-1.5">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Breakout Detected</p>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${breakout.direction === 'BULLISH' ? 'text-bullish' : 'text-bearish'}`}>
              {breakout.direction === 'BULLISH' ? '▲ Bullish Breakout' : '▼ Bearish Breakdown'}
            </span>
            <span className={`text-xs font-bold ${bsColor}`}>{breakout.strength}</span>
          </div>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Break Level: {breakout.breakLevel.toFixed(1)}</span>
            <span>Close: {breakout.closePrice.toFixed(1)}</span>
            <span>+{breakout.penetration.toFixed(1)} pts</span>
          </div>
        </div>
      )}

      {/* ── Targets ── */}
      {(target1 || target2 || stop) && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Projected Levels</p>
          <div className="grid grid-cols-3 gap-1.5">
            {target1 != null && (
              <div className="rounded bg-bullish/10 border border-bullish/20 p-1.5 text-center">
                <p className="text-[8px] text-text-muted uppercase">T1 (1×)</p>
                <p className="text-xs font-bold text-bullish tabular-nums">{target1.toFixed(1)}</p>
              </div>
            )}
            {target2 != null && (
              <div className="rounded bg-bullish/10 border border-bullish/20 p-1.5 text-center">
                <p className="text-[8px] text-text-muted uppercase">T2 (2×)</p>
                <p className="text-xs font-bold text-bullish tabular-nums">{target2.toFixed(1)}</p>
              </div>
            )}
            {stop != null && (
              <div className="rounded bg-bearish/10 border border-bearish/20 p-1.5 text-center">
                <p className="text-[8px] text-text-muted uppercase">Stop</p>
                <p className="text-xs font-bold text-bearish tabular-nums">{stop.toFixed(1)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ORB Score ── */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-[10px] text-text-muted">ORB Score</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${Math.abs(score)}%` }}
            />
          </div>
          <span className={`text-xs font-bold tabular-nums ${score > 0 ? 'text-bullish' : score < 0 ? 'text-bearish' : 'text-text-secondary'}`}>
            {score > 0 ? `+${score}` : score}
          </span>
        </div>
      </div>
    </div>
  );
}
