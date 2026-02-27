/**
 * Option Chain Heatmap
 *
 * Displays strike-by-strike Call/Put OI in a visual table.
 * - Wider green bars = stronger put support at that strike
 * - Wider red bars = stronger call resistance at that strike
 * - ATM row highlighted in blue
 * - OI change shown with directional arrows
 */

'use client';

import { useMemo, useState } from 'react';
import { formatOI, formatPrice, getOIHeatColor, getColorClass } from '@/lib/formatters';
import type { OptionChain, StrikeData } from '@/types';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface OptionChainHeatmapProps {
  optionChain: OptionChain | null;
  currentPrice: number | null;
}

export default function OptionChainHeatmap({ optionChain, currentPrice }: OptionChainHeatmapProps) {
  const [showAll, setShowAll] = useState(false);

  const { strikes, maxCallOI, maxPutOI, displayStrikes } = useMemo(() => {
    if (!optionChain?.strikes) return { strikes: [], maxCallOI: 1, maxPutOI: 1, displayStrikes: [] };

    const strikes = optionChain.strikes;
    const maxCallOI = Math.max(...strikes.map(s => s.call.oi), 1);
    const maxPutOI = Math.max(...strikes.map(s => s.put.oi), 1);

    // Find ATM index
    const price = currentPrice || optionChain.underlyingValue;
    const atmIdx = strikes.reduce((closest, s, i) =>
      Math.abs(s.strikePrice - price) < Math.abs(strikes[closest].strikePrice - price) ? i : closest, 0);

    // Show ±12 strikes around ATM by default
    const range = showAll ? strikes.length : 12;
    const start = Math.max(0, atmIdx - range);
    const end = Math.min(strikes.length, atmIdx + range + 1);
    const displayStrikes = strikes.slice(start, end).reverse(); // Show highest strike first

    return { strikes, maxCallOI, maxPutOI, displayStrikes };
  }, [optionChain, currentPrice, showAll]);

  if (!optionChain) {
    return (
      <div className="trading-card">
        <div className="trading-card-header">Option Chain Heatmap</div>
        <div className="text-text-muted text-sm text-center py-10 animate-pulse">
          Waiting for option chain data...
        </div>
      </div>
    );
  }

  const price = currentPrice || optionChain.underlyingValue;

  return (
    <div className="trading-card">
      <div className="flex items-center justify-between mb-3">
        <div className="trading-card-header mb-0">
          Option Chain Heatmap
          <span className="text-text-muted ml-2">Expiry: {optionChain.expiryDate}</span>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-accent hover:text-accent/80 border border-accent/20 rounded px-2 py-0.5"
        >
          {showAll ? 'Show Less' : 'Show All'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="border-b border-border">
              {/* Call side */}
              <th className="text-right text-bearish/80 w-16">OI Chg</th>
              <th className="text-right text-bearish/80 w-16">Volume</th>
              <th className="text-right text-bearish/80 w-20">IV%</th>
              <th className="text-right text-bearish/80 w-24 pr-4">
                <div className="flex items-center justify-end gap-1">
                  <div className="w-16 h-1 bg-bearish/30 rounded" />
                  Call OI
                </div>
              </th>
              {/* Center */}
              <th className="text-center w-24 text-text-primary font-semibold">Strike</th>
              {/* Put side */}
              <th className="text-left text-bullish/80 w-24 pl-4">
                <div className="flex items-center gap-1">
                  Put OI
                  <div className="w-16 h-1 bg-bullish/30 rounded" />
                </div>
              </th>
              <th className="text-left text-bullish/80 w-20">IV%</th>
              <th className="text-left text-bullish/80 w-16">Volume</th>
              <th className="text-left text-bullish/80 w-16">OI Chg</th>
            </tr>
          </thead>
          <tbody>
            {displayStrikes.map((strike) => {
              const isATM = Math.abs(strike.strikePrice - price) < 75;
              const isMaxCallOI = strike.strikePrice === optionChain.highestCallStrike;
              const isMaxPutOI = strike.strikePrice === optionChain.highestPutStrike;
              const isMaxPain = strike.strikePrice === optionChain.maxPain;

              return (
                <tr
                  key={strike.strikePrice}
                  className={`border-b border-border/30 transition-colors ${
                    isATM ? 'atm-row' : 'hover:bg-border/20'
                  }`}
                >
                  {/* Call OI Change */}
                  <td className={`text-right text-xs ${getColorClass(strike.call.oiChange)}`}>
                    <OIChangeCell value={strike.call.oiChange} />
                  </td>

                  {/* Call Volume */}
                  <td className="text-right text-text-secondary text-xs">
                    {formatOI(strike.call.volume)}
                  </td>

                  {/* Call IV */}
                  <td className="text-right text-text-secondary text-xs">
                    {strike.call.iv > 0 ? `${strike.call.iv.toFixed(1)}%` : '-'}
                  </td>

                  {/* Call OI Bar */}
                  <td className="text-right pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-xs text-text-primary">
                        {formatOI(strike.call.oi)}
                      </span>
                      {/* Heat bar */}
                      <div className="h-4 rounded-sm overflow-hidden" style={{ width: '60px', minWidth: '60px' }}>
                        <div
                          className="h-full rounded-sm transition-all duration-300 float-right"
                          style={{
                            width: `${(strike.call.oi / maxCallOI) * 100}%`,
                            backgroundColor: getOIHeatColor(strike.call.oi, maxCallOI, 'call'),
                            boxShadow: isMaxCallOI ? '0 0 8px rgba(255,61,90,0.4)' : 'none',
                          }}
                        />
                      </div>
                    </div>
                    {isMaxCallOI && (
                      <div className="text-[9px] text-bearish text-right mt-0.5">▲ MAX RESISTANCE</div>
                    )}
                  </td>

                  {/* Strike Price (center) */}
                  <td className="text-center">
                    <div className={`font-mono font-bold text-sm inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                      isATM ? 'bg-accent/10 text-accent border border-accent/20' : 'text-text-primary'
                    }`}>
                      {isMaxPain && <span className="text-neutral text-[8px]">⚡</span>}
                      {strike.strikePrice.toLocaleString('en-IN')}
                      {isATM && <span className="text-[8px] text-accent ml-1">ATM</span>}
                    </div>
                  </td>

                  {/* Put OI Bar */}
                  <td className="text-left pl-4">
                    <div className="flex items-center gap-2">
                      {/* Heat bar */}
                      <div className="h-4 rounded-sm overflow-hidden" style={{ width: '60px', minWidth: '60px' }}>
                        <div
                          className="h-full rounded-sm transition-all duration-300"
                          style={{
                            width: `${(strike.put.oi / maxPutOI) * 100}%`,
                            backgroundColor: getOIHeatColor(strike.put.oi, maxPutOI, 'put'),
                            boxShadow: isMaxPutOI ? '0 0 8px rgba(0,210,100,0.4)' : 'none',
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-text-primary">
                        {formatOI(strike.put.oi)}
                      </span>
                    </div>
                    {isMaxPutOI && (
                      <div className="text-[9px] text-bullish mt-0.5">▼ MAX SUPPORT</div>
                    )}
                  </td>

                  {/* Put IV */}
                  <td className="text-left text-text-secondary text-xs">
                    {strike.put.iv > 0 ? `${strike.put.iv.toFixed(1)}%` : '-'}
                  </td>

                  {/* Put Volume */}
                  <td className="text-left text-text-secondary text-xs">
                    {formatOI(strike.put.volume)}
                  </td>

                  {/* Put OI Change */}
                  <td className={`text-left text-xs ${getColorClass(strike.put.oiChange)}`}>
                    <OIChangeCell value={strike.put.oiChange} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-[10px] text-text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-bearish/40 rounded-sm" />
          <span>Call OI (Resistance)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-bullish/40 rounded-sm" />
          <span>Put OI (Support)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-accent/30 rounded-sm" />
          <span>ATM Strike</span>
        </div>
        <div className="flex items-center gap-1">
          <span>⚡</span>
          <span>Max Pain</span>
        </div>
      </div>
    </div>
  );
}

function OIChangeCell({ value }: { value: number }) {
  if (!value || Math.abs(value) < 100) return <span className="text-text-muted">—</span>;

  const formatted = formatOI(Math.abs(value));
  if (value > 0) return (
    <span className="text-bullish flex items-center justify-end gap-0.5">
      <ArrowUp className="w-2.5 h-2.5" />{formatted}
    </span>
  );
  return (
    <span className="text-bearish flex items-center justify-end gap-0.5">
      <ArrowDown className="w-2.5 h-2.5" />{formatted}
    </span>
  );
}
