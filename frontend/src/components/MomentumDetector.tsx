/**
 * Momentum Detector
 * Highlights strikes with significant OI buildup/unwinding activity.
 * Each row shows a strike with classification: Long Buildup, Short Covering, etc.
 */

'use client';

import { formatOI, formatPrice, BUILDUP_CONFIG } from '../lib/formatters';
import type { OptionChain } from '@/types';
import { Activity, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';

interface MomentumDetectorProps {
  optionChain: OptionChain | null;
  currentPrice: number | null;
}

export default function MomentumDetector({ optionChain, currentPrice }: MomentumDetectorProps) {
  if (!optionChain?.strikes) {
    return (
      <div className="trading-card">
        <div className="trading-card-header">
          <Activity className="w-3.5 h-3.5" />
          Momentum Detector
        </div>
        <div className="text-text-muted text-xs text-center py-4 animate-pulse">
          Scanning for momentum...
        </div>
      </div>
    );
  }

  const price = currentPrice || optionChain.underlyingValue;

  // Find strikes with significant OI changes (threshold: > 10K contracts)
  const OI_THRESHOLD = 10000;

  const significantStrikes = optionChain.strikes
    .filter(s =>
      Math.abs(s.call.oiChange) > OI_THRESHOLD ||
      Math.abs(s.put.oiChange) > OI_THRESHOLD
    )
    .map(s => {
      // Determine overall buildup type based on combined OI activity
      const netOIChange = s.put.oiChange - s.call.oiChange;
      const isAbovePrice = s.strikePrice > price;

      let buildupType = 'NEUTRAL';
      let buildupLabel = 'Neutral';

      if (s.call.oiChange > OI_THRESHOLD && isAbovePrice) buildupType = 'SHORT_BUILDUP';
      if (s.call.oiChange < -OI_THRESHOLD && isAbovePrice) buildupType = 'SHORT_COVERING';
      if (s.put.oiChange > OI_THRESHOLD && !isAbovePrice) buildupType = 'LONG_BUILDUP';
      if (s.put.oiChange < -OI_THRESHOLD && !isAbovePrice) buildupType = 'LONG_UNWINDING';

      return {
        strikePrice: s.strikePrice,
        callOIChange: s.call.oiChange,
        putOIChange: s.put.oiChange,
        callOI: s.call.oi,
        putOI: s.put.oi,
        buildupType,
        distanceFromPrice: Math.round(s.strikePrice - price),
        netOIChange,
        isAbovePrice,
        totalChange: Math.abs(s.call.oiChange) + Math.abs(s.put.oiChange),
      };
    })
    .filter(s => s.buildupType !== 'NEUTRAL')
    .sort((a, b) => b.totalChange - a.totalChange)
    .slice(0, 12);

  return (
    <div className="trading-card">
      <div className="trading-card-header">
        <Activity className="w-3.5 h-3.5 text-accent" />
        Momentum Detector
        <span className="text-[10px] text-text-muted ml-1">OI Buildup/Unwinding</span>
      </div>

      {significantStrikes.length === 0 ? (
        <div className="text-text-muted text-xs text-center py-6">
          <p>No significant OI activity detected</p>
          <p className="text-[10px] mt-1 opacity-60">Threshold: {formatOI(10000)} OI change</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {significantStrikes.map((strike) => {
            const config = BUILDUP_CONFIG[strike.buildupType as keyof typeof BUILDUP_CONFIG]
              || BUILDUP_CONFIG.NEUTRAL;

            const isBullish = ['LONG_BUILDUP', 'SHORT_COVERING'].includes(strike.buildupType);
            const isBearish = ['SHORT_BUILDUP', 'LONG_UNWINDING'].includes(strike.buildupType);

            return (
              <div
                key={strike.strikePrice}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
                  isBullish && 'bg-bullish/5 border-bullish/20',
                  isBearish && 'bg-bearish/5 border-bearish/20',
                )}
              >
                {/* Direction indicator */}
                <div className={clsx('w-6 h-6 rounded flex items-center justify-center shrink-0', config.bg)}>
                  {isBullish
                    ? <ArrowUp className={clsx('w-3.5 h-3.5', config.color)} />
                    : <ArrowDown className={clsx('w-3.5 h-3.5', config.color)} />
                  }
                </div>

                {/* Strike price */}
                <div className="shrink-0">
                  <div className="font-mono text-sm font-bold text-text-primary">
                    {formatPrice(strike.strikePrice)}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {strike.isAbovePrice ? '+' : ''}{strike.distanceFromPrice} pts
                  </div>
                </div>

                {/* Buildup type */}
                <div className="flex-1">
                  <span className={clsx('text-xs font-semibold', config.color)}>
                    {config.label}
                  </span>
                </div>

                {/* OI changes */}
                <div className="text-right shrink-0">
                  {Math.abs(strike.callOIChange) > 5000 && (
                    <div className={`text-[10px] font-mono ${strike.callOIChange > 0 ? 'text-bearish' : 'text-bullish'}`}>
                      C: {strike.callOIChange > 0 ? '+' : ''}{formatOI(strike.callOIChange)}
                    </div>
                  )}
                  {Math.abs(strike.putOIChange) > 5000 && (
                    <div className={`text-[10px] font-mono ${strike.putOIChange > 0 ? 'text-bullish' : 'text-bearish'}`}>
                      P: {strike.putOIChange > 0 ? '+' : ''}{formatOI(strike.putOIChange)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-text-secondary">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-bullish/60" />
            <span>Long Buildup = Fresh longs</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-bullish/40" />
            <span>Short Covering = Shorts exit</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-bearish/60" />
            <span>Short Buildup = Fresh shorts</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-bearish/40" />
            <span>Long Unwinding = Longs exit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
