'use client';

/**
 * GammaExposurePanel
 *
 * Visualizes dealer Gamma Exposure (GEX) across NIFTY strikes.
 *
 * Understanding the chart:
 *  - Green bars = Positive GEX strikes → dealers long gamma → stabilising
 *  - Red bars   = Negative GEX strikes → dealers short gamma → volatile
 *  - Gamma Flip Level = where GEX crosses zero — THE key level to watch
 *  - Above flip: price tends to mean-revert (low vol, range trades)
 *  - Below flip: price tends to trend (high vol, momentum trades)
 */

import { BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { GammaExposure } from '@/types';
import { Activity } from 'lucide-react';

interface GammaExposurePanelProps {
  gammaExposure: GammaExposure | null;
  currentPrice: number | null;
}

// Custom tooltip for the GEX bar chart
function GEXTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isPos = d.netGEX >= 0;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="font-bold text-text-primary">Strike {d.strike}</p>
      <p className={isPos ? 'text-bullish' : 'text-bearish'}>
        Net GEX: {(d.netGEX / 1e9).toFixed(2)}B
      </p>
      <p className="text-text-muted">Call GEX: +{(d.callGEX / 1e9).toFixed(2)}B</p>
      <p className="text-text-muted">Put GEX:  {(d.putGEX  / 1e9).toFixed(2)}B</p>
      <p className="text-text-muted">OI: {d.callOI.toLocaleString('en-IN')} / {d.putOI.toLocaleString('en-IN')}</p>
      <p className="text-text-muted">IV: {d.iv}%</p>
    </div>
  );
}

export default function GammaExposurePanel({ gammaExposure, currentPrice }: GammaExposurePanelProps) {
  if (!gammaExposure?.strikeGEX?.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Gamma Exposure (GEX)
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="text-2xl mb-2">📈</span>
          <p className="text-xs">Computing gamma profile…</p>
        </div>
      </div>
    );
  }

  const {
    strikeGEX, netGEX, netGEXBillions, gammaFlipLevel,
    positiveGammaZone, negativeGammaZone, squeezeLevels, summary, bias, isPositiveGamma
  } = gammaExposure;

  // Filter to ±600 pts from current price for chart readability
  const spot = currentPrice ?? (strikeGEX.find(s => s.isATM)?.strike ?? 0);
  const chartData = strikeGEX
    .filter(s => Math.abs(s.strike - spot) <= 600)
    .sort((a, b) => a.strike - b.strike)
    .map(s => ({
      ...s,
      gexB:   parseFloat((s.netGEX / 1e9).toFixed(3)), // billions for display
      isSpot: s.isATM,
    }));

  const maxAbs = Math.max(...chartData.map(d => Math.abs(d.gexB)));
  const yDomain: [number, number] = [-(maxAbs * 1.1), maxAbs * 1.1];

  const biasColor = isPositiveGamma ? 'text-bullish' : 'text-bearish';
  const biasBg    = isPositiveGamma ? 'bg-bullish/10 border-bullish/30' : 'bg-bearish/10 border-bearish/30';

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Gamma Exposure (GEX)
        </h2>
        <div className={`text-xs font-bold px-2 py-1 rounded border ${biasBg} ${biasColor}`}>
          {isPositiveGamma ? '🟢 +GEX' : '🔴 −GEX'} {netGEXBillions > 0 ? '+' : ''}{netGEXBillions}B
        </div>
      </div>

      {/* ── Key Metrics Row ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-background rounded-lg p-2 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Net GEX</p>
          <p className={`text-sm font-bold tabular-nums ${biasColor}`}>
            {netGEXBillions > 0 ? '+' : ''}{netGEXBillions}B
          </p>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Gamma Flip</p>
          <p className="text-sm font-bold text-warning tabular-nums">
            {gammaFlipLevel ? gammaFlipLevel.toLocaleString('en-IN') : '—'}
          </p>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">Price vs Flip</p>
          <p className={`text-sm font-bold tabular-nums ${
            (gammaExposure.priceVsFlip ?? 0) > 0 ? 'text-bullish' : 'text-bearish'
          }`}>
            {gammaExposure.priceVsFlip !== null
              ? `${gammaExposure.priceVsFlip > 0 ? '+' : ''}${gammaExposure.priceVsFlip}`
              : '—'}
          </p>
        </div>
      </div>

      {/* ── GEX Bar Chart ── */}
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="10%" margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis
              dataKey="strike"
              tick={{ fill: '#64748b', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#64748b', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(1)}B`}
            />
            <Tooltip content={<GEXTooltip />} />
            {/* Zero line */}
            <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
            {/* Current price line */}
            {spot && (
              <ReferenceLine
                x={Math.round(spot / 50) * 50}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: 'Spot', fill: '#f59e0b', fontSize: 8, position: 'insideTopRight' }}
              />
            )}
            {/* Gamma flip line */}
            {gammaFlipLevel && (
              <ReferenceLine
                x={gammaFlipLevel}
                stroke="#e879f9"
                strokeWidth={1.5}
                strokeDasharray="3 2"
                label={{ value: 'Flip', fill: '#e879f9', fontSize: 8, position: 'insideTopLeft' }}
              />
            )}
            <Bar dataKey="gexB" maxBarSize={18} radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.gexB >= 0 ? '#10b981' : '#ef4444'}
                  fillOpacity={entry.isSpot ? 1 : 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Gamma Zones Summary ── */}
      <div className="space-y-1.5">
        {gammaFlipLevel && (
          <div className="rounded-lg bg-background/50 border border-border/50 p-2">
            <p className="text-[10px] text-text-secondary leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Squeeze levels */}
        {squeezeLevels.length > 0 && (
          <div>
            <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium mb-1">Key Squeeze Levels</p>
            <div className="space-y-1">
              {squeezeLevels.slice(0, 3).map((sq, i) => (
                <div key={i} className="flex justify-between items-center text-[10px]">
                  <span className="text-text-muted">{sq.strike.toLocaleString('en-IN')}</span>
                  <span className={sq.type === 'POSITIVE' ? 'text-bullish' : 'text-bearish'}>
                    {sq.label.split('(')[0].trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[9px] text-text-muted opacity-60">
        GEX approximated from NSE OI data using Black-Scholes gamma
      </p>
    </div>
  );
}
