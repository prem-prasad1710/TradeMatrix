/**
 * OI Summary Panel
 * Shows: PCR, Max Pain, Highest Call/Put OI strikes, total OI
 */

'use client';

import { formatOI, formatPrice, getPCRLabel } from '../lib/formatters';
import type { OptionChain } from '@/types';
import { Shield, TrendingDown, TrendingUp, Target } from 'lucide-react';

interface OISummaryProps {
  optionChain: OptionChain | null;
}

export default function OISummary({ optionChain }: OISummaryProps) {
  if (!optionChain) {
    return (
      <div className="trading-card">
        <div className="trading-card-header">OI Summary</div>
        <div className="text-text-muted text-sm text-center py-6 animate-pulse">
          Loading option chain data...
        </div>
      </div>
    );
  }

  const pcrLabel = getPCRLabel(optionChain.pcr);

  // PCR gauge: visualize between 0.4 and 1.8
  const pcrMin = 0.4;
  const pcrMax = 1.8;
  const pcrPct = Math.min(100, Math.max(0, ((optionChain.pcr - pcrMin) / (pcrMax - pcrMin)) * 100));

  return (
    <div className="trading-card space-y-4">
      <div className="trading-card-header">
        <Target className="w-3.5 h-3.5" />
        OI Summary
      </div>

      {/* PCR with visual gauge */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-text-secondary">Put/Call Ratio (PCR)</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-text-primary">
              {optionChain.pcr.toFixed(2)}
            </span>
            <span className={`text-xs font-medium ${pcrLabel.color}`}>
              {pcrLabel.label}
            </span>
          </div>
        </div>
        {/* PCR gauge bar */}
        <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
          {/* Background gradient: red (bearish) → yellow → green (bullish) */}
          <div className="absolute inset-0 bg-gradient-to-r from-bearish via-neutral to-bullish opacity-30" />
          {/* Indicator needle */}
          <div
            className="absolute top-0 w-1 h-full bg-text-primary rounded-full shadow-lg transition-all duration-500"
            style={{ left: `calc(${pcrPct}% - 2px)` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-text-muted mt-1">
          <span>Bearish (0.4)</span>
          <span>Neutral (1.0)</span>
          <span>Bullish (1.8)</span>
        </div>
      </div>

      {/* Max Pain */}
      <div className="flex items-center justify-between py-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-text-secondary text-xs">
          <Target className="w-3 h-3" />
          Max Pain Level
        </div>
        <span className="font-mono font-semibold text-neutral">
          {formatPrice(optionChain.maxPain)}
        </span>
      </div>

      {/* Highest OI Strikes */}
      <div className="grid grid-cols-2 gap-3">
        {/* Call Wall (Resistance) */}
        <div className="bg-bearish/5 border border-bearish/20 rounded-lg p-3">
          <div className="flex items-center gap-1 text-bearish text-[10px] font-medium uppercase tracking-wider mb-2">
            <TrendingDown className="w-3 h-3" />
            Call Wall
          </div>
          <div className="font-mono text-lg font-bold text-text-primary">
            {formatPrice(optionChain.highestCallStrike)}
          </div>
          <div className="text-[10px] text-text-secondary mt-1">
            OI: {formatOI(optionChain.highestCallOI)}
          </div>
          <div className="text-[10px] text-bearish/80 mt-0.5">Key Resistance</div>
        </div>

        {/* Put Wall (Support) */}
        <div className="bg-bullish/5 border border-bullish/20 rounded-lg p-3">
          <div className="flex items-center gap-1 text-bullish text-[10px] font-medium uppercase tracking-wider mb-2">
            <TrendingUp className="w-3 h-3" />
            Put Wall
          </div>
          <div className="font-mono text-lg font-bold text-text-primary">
            {formatPrice(optionChain.highestPutStrike)}
          </div>
          <div className="text-[10px] text-text-secondary mt-1">
            OI: {formatOI(optionChain.highestPutOI)}
          </div>
          <div className="text-[10px] text-bullish/80 mt-0.5">Key Support</div>
        </div>
      </div>

      {/* Total OI bar */}
      <div className="border-t border-border pt-3">
        <div className="flex justify-between text-[10px] text-text-secondary mb-2">
          <span>Total Call OI</span>
          <span>Total Put OI</span>
        </div>
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
          {/* Call OI (bearish — red shows call supply) */}
          <div
            className="bg-bearish/60 transition-all duration-500"
            style={{
              width: `${(optionChain.totalCallOI / (optionChain.totalCallOI + optionChain.totalPutOI)) * 100}%`,
            }}
          />
          {/* Put OI (bullish — green shows put support) */}
          <div className="bg-bullish/60 flex-1 transition-all duration-500" />
        </div>
        <div className="flex justify-between text-[10px] font-mono mt-1.5">
          <span className="text-bearish">{formatOI(optionChain.totalCallOI)}</span>
          <span className="text-bullish">{formatOI(optionChain.totalPutOI)}</span>
        </div>
      </div>

      {/* Support & Resistance levels */}
      {(optionChain.resistanceLevels.length > 0 || optionChain.supportLevels.length > 0) && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            OI-Based Levels
          </div>
          <div className="space-y-1.5">
            {optionChain.resistanceLevels.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-bearish/70">R{i + 1} (Call Wall)</span>
                <span className="font-mono text-bearish font-semibold">{formatPrice(r.strike)}</span>
                <span className="text-text-muted text-[10px]">{formatOI(r.oi)}</span>
              </div>
            ))}
            {optionChain.supportLevels.slice(0, 2).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-bullish/70">S{i + 1} (Put Wall)</span>
                <span className="font-mono text-bullish font-semibold">{formatPrice(s.strike)}</span>
                <span className="text-text-muted text-[10px]">{formatOI(s.oi)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
