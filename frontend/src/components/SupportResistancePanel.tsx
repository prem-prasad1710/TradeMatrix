/**
 * Support & Resistance Panel
 * Shows pivot points, OI-based walls, and day high/low.
 */

'use client';

import { formatPrice } from '../lib/formatters';
import type { NiftyPrice, OptionChain } from '@/types';
import { Layers } from 'lucide-react';

interface SupportResistancePanelProps {
  priceData: NiftyPrice | null;
  optionChain: OptionChain | null;
}

export default function SupportResistancePanel({ priceData, optionChain }: SupportResistancePanelProps) {
  if (!priceData?.pivots) {
    return (
      <div className="trading-card">
        <div className="trading-card-header">
          <Layers className="w-3.5 h-3.5" />
          Support & Resistance
        </div>
        <div className="text-text-muted text-xs text-center py-4 animate-pulse">Loading levels...</div>
      </div>
    );
  }

  const { pivots, price, high, low, prevClose } = priceData;

  // Combine OI-based levels and pivot levels into a sorted list
  const levels: { label: string; price: number; type: 'resistance' | 'support' | 'neutral'; source: string }[] = [
    { label: 'R3', price: pivots.R3, type: 'resistance', source: 'Pivot' },
    { label: 'R2', price: pivots.R2, type: 'resistance', source: 'Pivot' },
    { label: 'R1', price: pivots.R1, type: 'resistance', source: 'Pivot' },
    { label: 'PP', price: pivots.PP, type: 'neutral', source: 'Pivot' },
    { label: 'S1', price: pivots.S1, type: 'support', source: 'Pivot' },
    { label: 'S2', price: pivots.S2, type: 'support', source: 'Pivot' },
    { label: 'S3', price: pivots.S3, type: 'support', source: 'Pivot' },
  ];

  // Add OI-based walls
  if (optionChain) {
    optionChain.resistanceLevels.forEach((r, i) => {
      levels.push({ label: `CR${i + 1}`, price: r.strike, type: 'resistance', source: 'Call Wall' });
    });
    optionChain.supportLevels.forEach((s, i) => {
      levels.push({ label: `PS${i + 1}`, price: s.strike, type: 'support', source: 'Put Wall' });
    });
    if (optionChain.maxPain) {
      levels.push({ label: 'MaxPain', price: optionChain.maxPain, type: 'neutral', source: 'OI' });
    }
  }

  // Sort descending by price
  const sorted = levels.sort((a, b) => b.price - a.price);

  // Visual range for the price ladder
  const minPrice = Math.min(...sorted.map(l => l.price)) - 100;
  const maxPrice = Math.max(...sorted.map(l => l.price)) + 100;
  const range = maxPrice - minPrice;

  return (
    <div className="trading-card">
      <div className="trading-card-header">
        <Layers className="w-3.5 h-3.5" />
        Support & Resistance Levels
        <span className="text-text-muted ml-1 text-[10px]">(Pivot + OI Walls)</span>
      </div>

      {/* Price ladder visualization */}
      <div className="relative space-y-0.5 mb-4">
        {sorted.map((level, i) => {
          const positionPct = ((level.price - minPrice) / range) * 100;
          const isCurrentPrice = Math.abs(level.price - price) < 50;
          const isAbove = level.price > price;

          return (
            <div key={`${level.label}-${i}`} className="flex items-center gap-2">
              {/* Label */}
              <div className={`w-14 text-right text-[10px] font-mono font-semibold flex-shrink-0 ${
                level.type === 'resistance' ? 'text-bearish/80' :
                level.type === 'support' ? 'text-bullish/80' : 'text-neutral/80'
              }`}>
                {level.label}
              </div>

              {/* Price bar */}
              <div className="flex-1 relative">
                <div className={`h-5 rounded flex items-center px-2 relative transition-all duration-300 ${
                  isCurrentPrice ? 'bg-accent/10 border border-accent/30' :
                  level.type === 'resistance' ? 'bg-bearish/5 border border-bearish/10' :
                  level.type === 'support' ? 'bg-bullish/5 border border-bullish/10' :
                  'bg-border/30 border border-border'
                }`}>
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    {formatPrice(level.price)}
                  </span>
                  {isCurrentPrice && (
                    <span className="ml-2 text-[9px] text-accent animate-pulse">◄ CURRENT</span>
                  )}
                </div>
              </div>

              {/* Source badge */}
              <div className="w-14 flex-shrink-0">
                <span className="text-[9px] text-text-muted bg-border/30 px-1 py-0.5 rounded">
                  {level.source}
                </span>
              </div>
            </div>
          );
        })}

        {/* Current price indicator */}
        <div className="flex items-center gap-2 border-t-2 border-accent/40 pt-1">
          <div className="w-14 text-right text-[10px] font-mono font-bold text-accent flex-shrink-0">SPOT</div>
          <div className="flex-1 relative">
            <div className="h-5 rounded bg-accent/10 border border-accent/30 flex items-center px-2">
              <span className="font-mono text-xs font-bold text-accent">{formatPrice(price)}</span>
            </div>
          </div>
          <div className="w-14 flex-shrink-0">
            <span className="text-[9px] text-accent bg-accent/10 px-1 py-0.5 rounded">NSE</span>
          </div>
        </div>
      </div>

      {/* Day stats */}
      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <div>
          <div className="text-[9px] text-text-muted uppercase">Day Low</div>
          <div className="font-mono text-xs font-semibold text-bearish">{formatPrice(low)}</div>
        </div>
        <div>
          <div className="text-[9px] text-text-muted uppercase">Prev Close</div>
          <div className="font-mono text-xs font-semibold text-text-secondary">{formatPrice(prevClose)}</div>
        </div>
        <div>
          <div className="text-[9px] text-text-muted uppercase">Day High</div>
          <div className="font-mono text-xs font-semibold text-bullish">{formatPrice(high)}</div>
        </div>
      </div>
    </div>
  );
}
