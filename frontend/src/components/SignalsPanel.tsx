/**
 * Market Signals Panel
 * Displays trading signals with confidence scores and descriptions.
 */

'use client';

import { getSignalClass, formatTime } from '../lib/formatters';
import type { TradingSignal, MarketSentiment } from '@/types';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import clsx from 'clsx';

interface SignalsPanelProps {
  signals: TradingSignal[];
  pcr?: number;
  sentiment?: MarketSentiment;
}

export default function SignalsPanel({ signals, pcr, sentiment }: SignalsPanelProps) {
  const sentimentConfig = {
    BULLISH: { label: 'Bullish', color: 'text-bullish', bg: 'bg-bullish/10 border-bullish/30', Icon: TrendingUp },
    BEARISH: { label: 'Bearish', color: 'text-bearish', bg: 'bg-bearish/10 border-bearish/30', Icon: TrendingDown },
    NEUTRAL: { label: 'Neutral', color: 'text-neutral', bg: 'bg-neutral/10 border-neutral/30', Icon: Minus },
  };

  const sentConf = sentimentConfig[sentiment || 'NEUTRAL'];
  const SentIcon = sentConf.Icon;

  return (
    <div className="trading-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="trading-card-header mb-0">
          <Zap className="w-3.5 h-3.5 text-accent" />
          Market Signals
        </div>
        {/* Overall sentiment badge */}
        {sentiment && (
          <div className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold', sentConf.bg, sentConf.color)}>
            <SentIcon className="w-3.5 h-3.5" />
            {sentConf.label}
          </div>
        )}
      </div>

      {signals.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-6">
          <AlertTriangle className="w-5 h-5 mx-auto mb-2 opacity-40" />
          <p>Analyzing market conditions...</p>
          <p className="text-xs mt-1 opacity-60">Signals appear after data loads</p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: TradingSignal }) {
  const confidenceColor =
    signal.confidence >= 70 ? 'bg-bullish' :
    signal.confidence >= 50 ? 'bg-neutral' : 'bg-text-muted';

  return (
    <div className={clsx(
      'rounded-lg p-3 border transition-all duration-300',
      signal.isNew && 'animate-slide-up',
      signal.indicator === 'bullish' && 'bg-bullish/5 border-bullish/20',
      signal.indicator === 'bearish' && 'bg-bearish/5 border-bearish/20',
      signal.indicator === 'neutral' && 'bg-neutral/5 border-neutral/20',
      signal.indicator === 'warning' && 'bg-warning/5 border-warning/20',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Signal label */}
          <div className="flex items-center gap-2 mb-1">
            <span className={getSignalClass(signal.indicator)}>
              {signal.label}
            </span>
            {signal.isNew && (
              <span className="text-[9px] bg-accent/20 text-accent border border-accent/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                New
              </span>
            )}
          </div>
          {/* Description */}
          <p className="text-xs text-text-secondary leading-relaxed">{signal.description}</p>
          {/* Timestamp */}
          <p className="text-[10px] text-text-muted mt-1">{formatTime(signal.timestamp)}</p>
        </div>

        {/* Confidence score */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="text-xs font-mono font-bold text-text-primary">
            {signal.confidence}%
          </div>
          <div className="w-14 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', confidenceColor)}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <div className="text-[9px] text-text-muted">Confidence</div>
        </div>
      </div>
    </div>
  );
}
