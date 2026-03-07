'use client';

/**
 * MarketStructurePanel
 *
 * Displays smart money market structure analysis:
 *  - Trend direction (Uptrend / Downtrend / Sideways) with strength
 *  - Break of Structure (BOS) events
 *  - Change of Character (CHoCH) signal
 *  - Active consolidation zones
 *  - Range expansion events
 */

import type { MarketStructure } from '@/types';
import { BarChart2 } from 'lucide-react';

interface MarketStructurePanelProps {
  marketStructure: MarketStructure | null;
}

function TrendBadge({ trend, strength }: { trend: string; strength: string }) {
  const config: Record<string, { bg: string; text: string; label: string; icon: string }> = {
    UPTREND:   { bg: 'bg-bullish/20 border-bullish/40', text: 'text-bullish',        label: 'Uptrend',   icon: '▲' },
    DOWNTREND: { bg: 'bg-bearish/20 border-bearish/40', text: 'text-bearish',        label: 'Downtrend', icon: '▼' },
    SIDEWAYS:  { bg: 'bg-card border-border',           text: 'text-text-secondary', label: 'Sideways',  icon: '↔' },
  };
  const c = config[trend] ?? config.SIDEWAYS;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${c.bg}`}>
      <span className={`text-base ${c.text}`}>{c.icon}</span>
      <div>
        <p className={`text-sm font-bold ${c.text}`}>{c.label}</p>
        <p className="text-[9px] text-text-muted">{strength} confirmation</p>
      </div>
    </div>
  );
}

function BOSRow({ type, label, price, description }: { type: string; label: string; price: number; description: string }) {
  const isBull = type === 'BULLISH_BOS';
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2 ${
      isBull ? 'bg-bullish/5 border-bullish/20' : 'bg-bearish/5 border-bearish/20'
    }`}>
      <span className={`text-sm shrink-0 ${isBull ? 'text-bullish' : 'text-bearish'}`}>
        {isBull ? '🟢' : '🔴'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${isBull ? 'text-bullish' : 'text-bearish'}`}>{label}</p>
        <p className="text-[10px] text-text-muted truncate">{description}</p>
      </div>
      <span className="text-[9px] text-text-muted shrink-0 tabular-nums">
        {price.toLocaleString('en-IN')}
      </span>
    </div>
  );
}

export default function MarketStructurePanel({ marketStructure }: MarketStructurePanelProps) {
  if (!marketStructure) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-accent" />
          Market Structure
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">🔍</span>
          <p className="text-xs">Analysing price structure…</p>
          <p className="text-[10px] mt-1">Needs ~10 candles of intraday data</p>
        </div>
      </div>
    );
  }

  const { trend, bosEvents, choch, consolidation, rangeExpansion, summary, bias, swingHighs, swingLows } = marketStructure;

  const biasColor =
    bias === 'BULLISH' ? 'text-bullish' :
    bias === 'BEARISH' ? 'text-bearish' :
    'text-text-secondary';

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-accent" />
          Market Structure
        </h2>
        <span className={`text-xs font-bold ${biasColor}`}>{bias}</span>
      </div>

      {/* ── Trend Badge ── */}
      <TrendBadge trend={trend.trend} strength={trend.strength} />

      {/* ── Recent Swing Points ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-background rounded-lg p-2">
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Swing Highs</p>
          {swingHighs.slice(-3).reverse().map((s, i) => (
            <p key={i} className="text-[10px] text-text-secondary tabular-nums">
              {s.price.toLocaleString('en-IN')}
            </p>
          ))}
          {swingHighs.length === 0 && <p className="text-[10px] text-text-muted">—</p>}
        </div>
        <div className="bg-background rounded-lg p-2">
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Swing Lows</p>
          {swingLows.slice(-3).reverse().map((s, i) => (
            <p key={i} className="text-[10px] text-text-secondary tabular-nums">
              {s.price.toLocaleString('en-IN')}
            </p>
          ))}
          {swingLows.length === 0 && <p className="text-[10px] text-text-muted">—</p>}
        </div>
      </div>

      {/* ── CHoCH — highest priority ── */}
      {choch && (
        <div className={`rounded-lg border p-2.5 ${
          choch.bias === 'bullish' ? 'bg-bullish/10 border-bullish/30' : 'bg-bearish/10 border-bearish/30'
        }`}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">⚠️</span>
            <span className={`text-xs font-bold ${choch.bias === 'bullish' ? 'text-bullish' : 'text-bearish'}`}>
              {choch.label}
            </span>
            <span className="text-[9px] text-text-muted ml-auto tabular-nums">
              @ {choch.price.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="text-[10px] text-text-secondary">{choch.description}</p>
        </div>
      )}

      {/* ── BOS Events ── */}
      {bosEvents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">Break of Structure</p>
          {bosEvents.slice(-2).map((b, i) => (
            <BOSRow key={i} type={b.type} label={b.label} price={b.price} description={b.description} />
          ))}
        </div>
      )}

      {/* ── Consolidation Zone ── */}
      {consolidation && (
        <div className="rounded-lg bg-warning/5 border border-warning/20 p-2">
          <p className="text-[9px] text-warning uppercase tracking-wider font-medium mb-1">⚡ Consolidation Zone</p>
          <div className="flex justify-between text-[10px]">
            <span className="text-text-muted">Range</span>
            <span className="text-text-secondary font-medium">
              {consolidation.low.toLocaleString('en-IN')} – {consolidation.high.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between text-[10px] mt-0.5">
            <span className="text-text-muted">Width</span>
            <span className="text-warning">{consolidation.rangePct.toFixed(2)}% over {consolidation.candles} candles</span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            Break above {consolidation.breakoutLevel.toLocaleString('en-IN')} or below {consolidation.breakdownLevel.toLocaleString('en-IN')}
          </p>
        </div>
      )}

      {/* ── Range Expansion ── */}
      {rangeExpansion.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium mb-1">Range Expansion</p>
          {rangeExpansion.slice(-1).map((re, i) => (
            <div key={i} className={`rounded-lg border p-2 text-[10px] ${
              re.bias === 'bullish' ? 'bg-bullish/5 border-bullish/20' : 'bg-bearish/5 border-bearish/20'
            }`}>
              <span className={re.bias === 'bullish' ? 'text-bullish' : 'text-bearish'}>
                {re.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary ── */}
      <div className="rounded-lg bg-background/50 border border-border/50 p-2">
        <p className="text-[10px] text-text-secondary leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}
