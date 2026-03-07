'use client';

/**
 * SignalScorePanel
 *
 * Displays the 0-100 probability signal score for bullish, bearish,
 * and range-bound scenarios. This is the core "decision summary" card.
 *
 * Visual elements:
 *  - Large signal badge (STRONG BULL / BULL / RANGE / BEAR / STRONG BEAR)
 *  - Three probability bars: Bullish %, Bearish %, Range %
 *  - Key confluence reasons (up to 3)
 *  - Score breakdown table (per component)
 */

import type { SignalScore } from '@/types';
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

interface SignalScorePanelProps {
  signalScore: SignalScore | null;
  isMarketOpen: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ProbBar({
  label, pct, color, score,
}: { label: string; pct: number; color: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-text-secondary">{label}</span>
        <span className={`font-bold ${color}`}>{pct}% <span className="text-text-muted font-normal">(score {score})</span></span>
      </div>
      <div className="h-2 bg-background rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            color.replace('text-', 'bg-')
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRow({ name, bull, bear, label }: { name: string; bull: number; bear: number; label: string }) {
  const dominant = bull > bear ? bull : bear;
  const side     = bull > bear ? 'bull' : bear > bull ? 'bear' : 'neutral';
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-text-muted truncate">{label}</p>
      </div>
      <div className={`text-[10px] font-bold shrink-0 ${
        side === 'bull' ? 'text-bullish' : side === 'bear' ? 'text-bearish' : 'text-text-muted'
      }`}>
        {side === 'bull' ? `+${bull}` : side === 'bear' ? `+${bear}` : '—'}
      </div>
    </div>
  );
}

export default function SignalScorePanel({ signalScore, isMarketOpen }: SignalScorePanelProps) {
  if (!signalScore) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-warning" />
          Signal Score
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">⏳</span>
          <p className="text-xs">Computing probability scores…</p>
        </div>
      </div>
    );
  }

  const {
    signalLabel,
    signal,
    bullScore,
    bearScore,
    rangeScore,
    bullPct,
    bearPct,
    rangePct,
    explanation,
    components,
    isHighConfidence,
    isStrongSignal,
  } = signalScore;

  const signalColors = {
    STRONG_BULL: { bg: 'bg-bullish/20 border-bullish/50', text: 'text-bullish', icon: <TrendingUp className="w-4 h-4" /> },
    BULL:        { bg: 'bg-bullish/10 border-bullish/30', text: 'text-bullish', icon: <TrendingUp className="w-4 h-4" /> },
    RANGE:       { bg: 'bg-card border-border',           text: 'text-text-secondary', icon: <Minus className="w-4 h-4" /> },
    BEAR:        { bg: 'bg-bearish/10 border-bearish/30', text: 'text-bearish', icon: <TrendingDown className="w-4 h-4" /> },
    STRONG_BEAR: { bg: 'bg-bearish/20 border-bearish/50', text: 'text-bearish', icon: <TrendingDown className="w-4 h-4" /> },
  };

  const sc = signalColors[signal] ?? signalColors.RANGE;

  return (
    <div className={`bg-card rounded-xl border p-4 space-y-4 ${isHighConfidence ? sc.bg : 'border-border'}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Zap className="w-4 h-4 text-warning" />
          Signal Score
        </h2>
        {!isMarketOpen && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30 tracking-wider">
            SIMULATION
          </span>
        )}
      </div>

      {/* ── Big Signal Badge ── */}
      <div className={`rounded-lg border p-3 flex items-center justify-between ${sc.bg}`}>
        <div className="flex items-center gap-2">
          <span className={sc.text}>{sc.icon}</span>
          <div>
            <p className={`text-sm font-bold ${sc.text}`}>{signalLabel}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {isStrongSignal ? '★ High confidence setup' : 'Moderate probability setup'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-extrabold tabular-nums ${sc.text}`}>
            {Math.max(bullScore, bearScore) > rangeScore
              ? Math.max(bullScore, bearScore)
              : rangeScore}
          </p>
          <p className="text-[9px] text-text-muted">/ 100</p>
        </div>
      </div>

      {/* ── Probability Bars ── */}
      <div className="space-y-2">
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium">Scenario Probabilities</p>
        <ProbBar label="Bullish" pct={bullPct}  color="text-bullish" score={bullScore}  />
        <ProbBar label="Bearish" pct={bearPct}  color="text-bearish" score={bearScore}  />
        <ProbBar label="Range"   pct={rangePct} color="text-warning"  score={rangeScore} />
      </div>

      {/* ── Explanation ── */}
      {explanation && (
        <div className="rounded-lg bg-background/50 border border-border/50 p-2">
          <p className="text-[10px] text-text-secondary leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* ── Score Breakdown ── */}
      {components.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5">Score Breakdown</p>
          <div className="space-y-0">
            {components.map((c, i) => (
              <ScoreRow key={i} name={c.name} bull={c.bull} bear={c.bear} label={c.label} />
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="text-[9px] text-text-muted opacity-60 text-center">
        Probability estimate — not a guaranteed directional call
      </p>
    </div>
  );
}
