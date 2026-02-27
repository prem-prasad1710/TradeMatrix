'use client';

/**
 * PriceOIAnalysis Component
 *
 * Displays the Price vs Open Interest relationship to identify:
 *  Long Buildup   — Price ↑ + OI ↑  (bulls adding positions)
 *  Short Buildup  — Price ↓ + OI ↑  (bears adding positions)
 *  Short Covering — Price ↑ + OI ↓  (bears squeezing out)
 *  Long Unwinding — Price ↓ + OI ↓  (bulls exiting)
 *
 * Also renders a mini OI history sparkline.
 */

import { useMemo } from 'react';
import type { OIPattern, OISnapshot } from '@/types';

interface PriceOIAnalysisProps {
  oiPattern: OIPattern | null;
}

// ── Pattern metadata ──────────────────────────────────────────────────────────
const PATTERN_META: Record<string, {
  label: string;
  short: string;
  color: string;        // tailwind text colour
  bg: string;           // tailwind bg colour (badge)
  border: string;       // card border
  icon: string;
  meaning: string;
  action: string;
}> = {
  LONG_BUILDUP: {
    label: 'Long Buildup',
    short: 'LB',
    color: 'text-bullish',
    bg: 'bg-bullish/20 text-bullish',
    border: 'border-bullish/40',
    icon: '↑↑',
    meaning: 'Price rising + OI rising — bulls are aggressively adding longs.',
    action: 'Look for CE entries on pullbacks to support / VWAP.',
  },
  SHORT_BUILDUP: {
    label: 'Short Buildup',
    short: 'SB',
    color: 'text-bearish',
    bg: 'bg-bearish/20 text-bearish',
    border: 'border-bearish/40',
    icon: '↓↑',
    meaning: 'Price falling + OI rising — bears are aggressively adding shorts.',
    action: 'Look for PE entries on bounces to resistance / VWAP.',
  },
  SHORT_COVERING: {
    label: 'Short Covering',
    short: 'SC',
    color: 'text-accent',
    bg: 'bg-accent/20 text-accent',
    border: 'border-accent/40',
    icon: '↑↓',
    meaning: 'Price rising + OI falling — shorts are squeezing out (weak move).',
    action: 'Move may be temporary. Wait for confirmation before CE entry.',
  },
  LONG_UNWINDING: {
    label: 'Long Unwinding',
    short: 'LU',
    color: 'text-warning',
    bg: 'bg-warning/20 text-warning',
    border: 'border-warning/40',
    icon: '↓↓',
    meaning: 'Price falling + OI falling — longs are exiting (weak selling).',
    action: 'Avoid fresh PE entries. Wait for Short Buildup confirmation.',
  },
  NEUTRAL: {
    label: 'Neutral',
    short: 'N',
    color: 'text-text-secondary',
    bg: 'bg-card text-text-secondary',
    border: 'border-border',
    icon: '→',
    meaning: 'No clear directional position building. Market in equilibrium or coiling for a breakout.',
    action: 'If OI is rising while price is flat — watch for breakout direction, trade the breakout with confirmation.',
  },
};

const ALL_PATTERNS = ['LONG_BUILDUP', 'SHORT_BUILDUP', 'SHORT_COVERING', 'LONG_UNWINDING'];

// ── Sparkline ─────────────────────────────────────────────────────────────────
function OISparkline({ history }: { history: OISnapshot[] }) {
  if (!history || history.length < 2) return null;

  const W = 200;
  const H = 40;
  const pad = 4;

  const prices  = history.map(h => h.price);
  const ois     = history.map(h => h.totalOI);

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minO = Math.min(...ois);
  const maxO = Math.max(...ois);
  const rangeP = maxP - minP || 1;
  const rangeO = maxO - minO || 1;

  const n = history.length;
  const xStep = (W - pad * 2) / (n - 1);

  const pricePts = history
    .map((h, i) => `${pad + i * xStep},${H - pad - ((h.price - minP) / rangeP) * (H - pad * 2)}`)
    .join(' ');

  const oiPts = history
    .map((h, i) => `${pad + i * xStep},${H - pad - ((h.totalOI - minO) / rangeO) * (H - pad * 2)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 overflow-visible">
      {/* OI line — faint blue */}
      <polyline points={oiPts} fill="none" stroke="rgb(96 165 250 / 0.5)" strokeWidth="1.5" strokeDasharray="3 2" />
      {/* Price line — amber */}
      <polyline points={pricePts} fill="none" stroke="rgb(251 191 36)" strokeWidth="2" />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PriceOIAnalysis({ oiPattern }: PriceOIAnalysisProps) {
  const pattern = oiPattern?.pattern ?? 'NEUTRAL';
  const meta = PATTERN_META[pattern] ?? PATTERN_META.NEUTRAL;

  const priceArrow = oiPattern
    ? oiPattern.priceChangePct >= 0 ? '▲' : '▼'
    : '→';
  const oiArrow = oiPattern
    ? oiPattern.oiChangePct >= 0 ? '▲' : '▼'
    : '→';

  const priceColor = oiPattern
    ? oiPattern.priceChangePct >= 0 ? 'text-bullish' : 'text-bearish'
    : 'text-text-secondary';
  const oiColor = oiPattern
    ? oiPattern.oiChangePct >= 0 ? 'text-accent' : 'text-warning'
    : 'text-text-secondary';

  const isSimulation = oiPattern?.isSimulation ?? false;
  const isConfirmed  = oiPattern?.isConfirmed ?? false;
  const streak       = oiPattern?.confirmedCycles ?? 0;

  return (
    <div className={`bg-card rounded-xl border ${meta.border} p-4 space-y-3`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-1">
        <h2 className="text-sm font-semibold text-text-primary">Price vs OI Analysis</h2>
        <div className="flex items-center gap-1.5">
          {isSimulation && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30 tracking-wider">
              SIMULATION
            </span>
          )}
          {!isSimulation && isConfirmed && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-bullish/20 text-bullish border border-bullish/30 tracking-wider">
              ✓ CONFIRMED
            </span>
          )}
          {streak > 0 && (
            <span className="text-[9px] text-text-muted">
              {streak}× streak
            </span>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
      </div>

      {/* ── Simulation warning ── */}
      {isSimulation && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
          <p className="text-[10px] text-warning">
            ⚠️ Market closed — showing simulated OI flow for analysis. Real signals activate Mon–Fri 9:15AM–3:30PM IST.
          </p>
        </div>
      )}

      {/* ── Current numbers ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background rounded-lg p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Price Change (5m)</p>
          <p className={`text-lg font-bold ${priceColor}`}>
            {priceArrow} {oiPattern ? Math.abs(oiPattern.priceChange).toFixed(2) : '—'}
            <span className="text-xs ml-1">
              ({oiPattern ? (oiPattern.priceChangePct >= 0 ? '+' : '') + oiPattern.priceChangePct.toFixed(2) + '%' : '—'})
            </span>
          </p>
        </div>
        <div className="bg-background rounded-lg p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">OI Change (5m)</p>
          <p className={`text-lg font-bold ${oiColor}`}>
            {oiArrow} {oiPattern ? Math.abs(oiPattern.oiChange).toLocaleString() : '—'}
            <span className="text-xs ml-1">
              ({oiPattern ? (oiPattern.oiChangePct >= 0 ? '+' : '') + oiPattern.oiChangePct.toFixed(2) + '%' : '—'})
            </span>
          </p>
        </div>
      </div>

      {/* ── Description & Action ── */}
      {oiPattern && (
        <div className="bg-background rounded-lg p-3 space-y-1">
          <p className="text-xs text-text-secondary">{meta.meaning}</p>
          <p className={`text-xs font-medium ${meta.color}`}>→ {meta.action}</p>
        </div>
      )}

      {/* ── Sparkline ── */}
      {oiPattern?.history && oiPattern.history.length > 3 && (
        <div className="bg-background rounded-lg p-2">
          <p className="text-[9px] text-text-muted mb-1">Price (amber) vs OI (blue) — last {oiPattern.history.length} snapshots</p>
          <OISparkline history={oiPattern.history} />
        </div>
      )}

      {/* ── Reference Table ── */}
      <div className="border-t border-border pt-3">
        <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Pattern Reference</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_PATTERNS.map(p => {
            const m = PATTERN_META[p];
            const isActive = p === pattern;
            return (
              <div
                key={p}
                className={`rounded-lg p-2 text-[10px] transition-all ${
                  isActive
                    ? `${m.bg} border ${m.border} font-semibold`
                    : 'bg-background text-text-muted'
                }`}
              >
                <span className="font-mono mr-1">{m.icon}</span>
                <span>{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
