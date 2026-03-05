'use client';

/**
 * TechnicalAnalysisPanel
 *
 * Displays the full technical indicator suite computed from candle data:
 *   • RSI-14 with zone indicator and gauge bar
 *   • EMA 9/21/50 trend alignment
 *   • MACD signal summary
 *   • Bollinger Band zone + squeeze alert
 *   • Last candlestick pattern
 *   • ATR-based stop loss guidance
 *   • Overall technical bias score
 */

import clsx from 'clsx';
import { BarChart2 } from 'lucide-react';
import type { TradeTechnicals } from '@/types';

interface TechnicalAnalysisPanelProps {
  technicals: TradeTechnicals | null | undefined;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ value, color }: { value: string; color: string }) {
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border', color)}>
      {value}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

// ── RSI Gauge Bar ─────────────────────────────────────────────────────────────
function RSIBar({ rsi }: { rsi: number }) {
  const clamp = Math.min(100, Math.max(0, rsi));
  const color =
    rsi >= 70 ? 'bg-bearish'   // overbought
    : rsi <= 30 ? 'bg-warning'  // oversold
    : rsi >= 55 ? 'bg-bullish'  // bullish zone
    : rsi <= 45 ? 'bg-bearish'  // bearish zone
    : 'bg-text-secondary';      // neutral

  const textColor =
    rsi >= 70 ? 'text-bearish'
    : rsi <= 30 ? 'text-warning'
    : rsi >= 55 ? 'text-bullish'
    : rsi <= 45 ? 'text-bearish'
    : 'text-text-secondary';

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden relative">
        {/* Zone markers */}
        <div className="absolute left-[30%] top-0 h-full w-px bg-border/80" />
        <div className="absolute left-[70%] top-0 h-full w-px bg-border/80" />
        {/* RSI fill */}
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${clamp}%` }}
        />
      </div>
      <span className={clsx('font-mono text-xs font-bold', textColor)}>{rsi.toFixed(0)}</span>
    </div>
  );
}

// ── EMA Trend Badge ───────────────────────────────────────────────────────────
function emaTrendConfig(trend: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    STRONG_BULLISH: { label: '▲▲ Strong Bull', color: 'text-bullish border-bullish/40 bg-bullish/10' },
    BULLISH:        { label: '▲ Bullish',       color: 'text-bullish border-bullish/30 bg-bullish/5' },
    NEUTRAL:        { label: '↔ Neutral',        color: 'text-text-secondary border-border bg-card' },
    BEARISH:        { label: '▼ Bearish',        color: 'text-bearish border-bearish/30 bg-bearish/5' },
    STRONG_BEARISH: { label: '▼▼ Strong Bear',  color: 'text-bearish border-bearish/40 bg-bearish/10' },
  };
  return map[trend ?? 'NEUTRAL'] ?? map['NEUTRAL'];
}

// ── MACD Badge ────────────────────────────────────────────────────────────────
function macdConfig(trend: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    BULLISH_CROSS:    { label: '✨ Golden Cross',    color: 'text-bullish border-bullish/50 bg-bullish/10' },
    BEARISH_CROSS:    { label: '💀 Death Cross',     color: 'text-bearish border-bearish/50 bg-bearish/10' },
    BULLISH_MOMENTUM: { label: '📈 Bull Momentum',   color: 'text-bullish border-bullish/30 bg-bullish/5' },
    BEARISH_MOMENTUM: { label: '📉 Bear Momentum',   color: 'text-bearish border-bearish/30 bg-bearish/5' },
    BULLISH:          { label: '↑ Bullish',           color: 'text-bullish border-bullish/20 bg-bullish/5' },
    BEARISH:          { label: '↓ Bearish',           color: 'text-bearish border-bearish/20 bg-bearish/5' },
    NEUTRAL:          { label: '↔ Neutral',           color: 'text-text-secondary border-border bg-card' },
  };
  return map[trend ?? 'NEUTRAL'] ?? map['NEUTRAL'];
}

// ── BB Zone Badge ─────────────────────────────────────────────────────────────
function bbZoneConfig(zone: string | null, squeeze: boolean) {
  if (squeeze) return { label: '🔥 Squeeze!', color: 'text-warning border-warning/50 bg-warning/10' };
  const map: Record<string, { label: string; color: string }> = {
    UPPER_BAND: { label: '⬆ Upper Band',  color: 'text-bearish border-bearish/30 bg-bearish/5' },
    LOWER_BAND: { label: '⬇ Lower Band',  color: 'text-bullish border-bullish/30 bg-bullish/5' },
    UPPER_HALF: { label: '↑ Upper Half',  color: 'text-warning border-warning/20 bg-warning/5' },
    LOWER_HALF: { label: '↓ Lower Half',  color: 'text-accent border-accent/20 bg-accent/5' },
    MIDDLE:     { label: '↔ Middle',       color: 'text-text-secondary border-border bg-card' },
  };
  return map[zone ?? 'MIDDLE'] ?? map['MIDDLE'];
}

// ── Bias Score Bar ────────────────────────────────────────────────────────────
function BiasBar({ bullScore, bearScore }: { bullScore: number; bearScore: number }) {
  const total = bullScore + bearScore;
  if (total === 0) return <span className="text-xs text-text-muted">No data</span>;
  const bullPct = Math.round((bullScore / total) * 100);
  const bearPct = 100 - bullPct;
  return (
    <div className="space-y-1 w-full">
      <div className="flex justify-between text-[10px] text-text-muted">
        <span className="text-bullish font-semibold">Bull {bullScore}</span>
        <span className="text-bearish font-semibold">Bear {bearScore}</span>
      </div>
      <div className="h-2 flex rounded-full overflow-hidden bg-border">
        <div className="bg-bullish rounded-l-full transition-all duration-500" style={{ width: `${bullPct}%` }} />
        <div className="bg-bearish rounded-r-full transition-all duration-500" style={{ width: `${bearPct}%` }} />
      </div>
      <p className="text-[10px] text-center text-text-muted">
        {bullPct > 60 ? '🟢 Technical bias: BULLISH'
          : bearPct > 60 ? '🔴 Technical bias: BEARISH'
          : '⚖️ Technical bias: MIXED'}
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TechnicalAnalysisPanel({ technicals }: TechnicalAnalysisPanelProps) {
  if (!technicals) {
    return (
      <div className="trading-card space-y-3">
        <div className="trading-card-header">
          <BarChart2 className="w-3.5 h-3.5 text-accent" />
          Technical Analysis
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">📊</span>
          <p className="text-sm">Awaiting candle data…</p>
          <p className="text-xs mt-1 opacity-60">Needs ≥50 candles (≈4h of 5m data)</p>
        </div>
      </div>
    );
  }

  const ema = emaTrendConfig(technicals.emaTrend);
  const macd = macdConfig(technicals.macdTrend);
  const bb = bbZoneConfig(technicals.bbZone, technicals.bbSqueeze);

  // RSI zone label
  const rsiLabel = !technicals.rsi ? 'N/A'
    : technicals.rsiZone === 'OVERBOUGHT' ? 'Overbought'
    : technicals.rsiZone === 'OVERSOLD'   ? 'Oversold'
    : technicals.rsiZone === 'BULLISH'    ? 'Bullish zone'
    : technicals.rsiZone === 'BEARISH'    ? 'Bearish zone'
    : 'Neutral';

  const rsiColor = !technicals.rsi ? 'text-text-muted border-border bg-card'
    : technicals.rsiZone === 'OVERBOUGHT' ? 'text-bearish border-bearish/30 bg-bearish/5'
    : technicals.rsiZone === 'OVERSOLD'   ? 'text-warning border-warning/30 bg-warning/5'
    : technicals.rsiZone === 'BULLISH'    ? 'text-bullish border-bullish/30 bg-bullish/5'
    : technicals.rsiZone === 'BEARISH'    ? 'text-bearish border-bearish/20 bg-bearish/5'
    : 'text-text-secondary border-border bg-card';

  return (
    <div className="trading-card space-y-3">
      {/* Header */}
      <div className="trading-card-header mb-0">
        <BarChart2 className="w-3.5 h-3.5 text-accent" />
        Technical Analysis
        {technicals.bbSqueeze && (
          <span className="ml-auto text-[9px] bg-warning/20 text-warning border border-warning/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
            🔥 Squeeze
          </span>
        )}
      </div>

      {/* Indicator rows */}
      <div className="space-y-0 mt-1">
        {/* RSI */}
        <Row label="RSI-14">
          <StatusBadge value={rsiLabel} color={rsiColor} />
          {technicals.rsi !== null && <RSIBar rsi={technicals.rsi} />}
        </Row>

        {/* EMA */}
        <Row label="EMA 9/21/50">
          <StatusBadge value={ema.label} color={ema.color} />
        </Row>

        {/* MACD */}
        <Row label="MACD (12,26,9)">
          <StatusBadge value={macd.label} color={macd.color} />
        </Row>

        {/* Bollinger Bands */}
        <Row label="Bollinger Bands">
          <StatusBadge value={bb.label} color={bb.color} />
        </Row>

        {/* Candlestick Pattern */}
        <Row label="Candle Pattern">
          {technicals.pattern ? (
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
              technicals.patternBias === 'bullish' ? 'text-bullish border-bullish/30 bg-bullish/5'
              : technicals.patternBias === 'bearish' ? 'text-bearish border-bearish/30 bg-bearish/5'
              : 'text-text-secondary border-border bg-card'
            )}>
              {technicals.patternEmoji} {technicals.pattern.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          ) : (
            <span className="text-xs text-text-muted">No pattern</span>
          )}
        </Row>

        {/* ATR */}
        {technicals.atr && (
          <Row label="ATR-14 (Volatility)">
            <span className="font-mono text-xs text-text-primary font-semibold">
              {technicals.atr.toFixed(1)} pts
            </span>
            <span className="text-[10px] text-text-muted">
              SL~{(technicals.atr * 0.5 * 1.5).toFixed(0)}₹ premium
            </span>
          </Row>
        )}
      </div>

      {/* Bias Score */}
      <div className="pt-2 border-t border-border/40">
        <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Technical Confluence Score</p>
        <BiasBar bullScore={technicals.bullScore} bearScore={technicals.bearScore} />
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-text-muted text-center opacity-60">
        Based on 5-min NIFTY candles · RSI-14, EMA 9/21/50, MACD 12/26/9, BB-20
      </p>
    </div>
  );
}
