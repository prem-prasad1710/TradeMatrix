#!/usr/bin/env python3
"""Overwrites the corrupted NiftyChart.tsx with clean SVG candlestick implementation."""
import os

DEST = '/Users/premprasad/Desktop/desktop/Trade/nifty-dashboard/frontend/src/components/NiftyChart.tsx'

CONTENT = """/**
 * NIFTY Chart — Pure SVG Candlestick with VWAP, Pivot Lines, OI Walls
 * Renders real OHLC candles using computed axis coordinates.
 * 5M intraday view with hover tooltip, VWAP, Pivot Points, OI walls.
 */
'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { BarChart2 } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import type { NiftyPrice, OptionChain, OHLCCandle } from '@/types';

interface Props {
  priceData: NiftyPrice | null;
  optionChain: OptionChain | null;
}

const PAD = { top: 14, right: 68, bottom: 36, left: 6 };

function toIST(ms: number) {
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function fmt(v: number) {
  if (!v) return '';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export default function NiftyChart({ priceData, optionChain }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 820, h: 380 });
  const [tooltip, setTooltip] = useState<{ x: number; c: OHLCCandle } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: Math.max(e.contentRect.width, 300), h: 380 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const candles = useMemo<OHLCCandle[]>(() => {
    return (priceData?.candles ?? [])
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null
                && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
      .slice(-78);
  }, [priceData?.candles]);

  const chartW = size.w - PAD.left - PAD.right;
  const chartH = size.h - PAD.top - PAD.bottom;

  const { yMin, yMax } = useMemo(() => {
    if (!candles.length) return { yMin: 0, yMax: 1 };
    let lo = Math.min(...candles.map(c => c.low));
    let hi = Math.max(...candles.map(c => c.high));
    const extras: number[] = [];
    if (priceData?.vwap) extras.push(priceData.vwap);
    if (priceData?.pivots) extras.push(...(Object.values(priceData.pivots) as number[]).filter(Boolean));
    if (optionChain?.highestCallStrike) extras.push(optionChain.highestCallStrike);
    if (optionChain?.highestPutStrike)  extras.push(optionChain.highestPutStrike);
    const valid = extras.filter(v => v > lo * 0.97 && v < hi * 1.03);
    if (valid.length) { lo = Math.min(lo, ...valid); hi = Math.max(hi, ...valid); }
    const buf = (hi - lo) * 0.05;
    return { yMin: lo - buf, yMax: hi + buf };
  }, [candles, priceData, optionChain]);

  const xScale = useCallback((i: number) => {
    const barW = chartW / Math.max(candles.length, 1);
    return PAD.left + i * barW + barW / 2;
  }, [candles.length, chartW]);

  const yScale = useCallback((v: number) => {
    if (yMax === yMin) return PAD.top + chartH / 2;
    return PAD.top + ((yMax - v) / (yMax - yMin)) * chartH;
  }, [yMin, yMax, chartH]);

  const barHalfW = Math.max(1, (chartW / Math.max(candles.length, 1)) * 0.35);

  const yTicks = useMemo(() => {
    if (yMax <= yMin) return [];
    const range = yMax - yMin;
    const rough = range / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = mag * (rough / mag < 2 ? 1 : rough / mag < 5 ? 2 : 5);
    const start = Math.ceil(yMin / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= yMax + 0.001; v = Math.round((v + step) * 100) / 100)
      ticks.push(Math.round(v));
    return ticks;
  }, [yMin, yMax]);

  const xTicks = useMemo(() => {
    if (!candles.length) return [];
    const step = Math.max(1, Math.floor(candles.length / 8));
    return candles.map((c, i) => ({ i, t: c.time })).filter((_, i) => i % step === 0);
  }, [candles]);

  const refLines = useMemo(() => {
    const lines: { v: number; color: string; dash?: string; label: string }[] = [];
    if (priceData?.vwap)
      lines.push({ v: priceData.vwap, color: '#f59e0b', label: `VWAP ${fmt(priceData.vwap)}` });
    const p = priceData?.pivots;
    if (p?.PP) lines.push({ v: p.PP, color: '#818cf8', dash: '4,3', label: `PP ${fmt(p.PP)}` });
    if (p?.R1) lines.push({ v: p.R1, color: '#fca5a5', dash: '3,3', label: `R1 ${fmt(p.R1)}` });
    if (p?.R2) lines.push({ v: p.R2, color: '#f87171', dash: '3,3', label: `R2 ${fmt(p.R2)}` });
    if (p?.S1) lines.push({ v: p.S1, color: '#86efac', dash: '3,3', label: `S1 ${fmt(p.S1)}` });
    if (p?.S2) lines.push({ v: p.S2, color: '#4ade80', dash: '3,3', label: `S2 ${fmt(p.S2)}` });
    if (optionChain?.highestCallStrike)
      lines.push({ v: optionChain.highestCallStrike, color: '#ef4444', dash: '6,3',
        label: `Call Wall ${fmt(optionChain.highestCallStrike)}` });
    if (optionChain?.highestPutStrike)
      lines.push({ v: optionChain.highestPutStrike, color: '#22c55e', dash: '6,3',
        label: `Put Wall ${fmt(optionChain.highestPutStrike)}` });
    return lines;
  }, [priceData, optionChain]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!candles.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - PAD.left;
    const barW = chartW / candles.length;
    const i = Math.max(0, Math.min(candles.length - 1, Math.round(mx / barW)));
    setTooltip({ x: xScale(i), c: candles[i] });
  }, [candles, chartW, xScale]);

  if (!priceData || !candles.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 h-[420px] flex flex-col items-center justify-center gap-3">
        <BarChart2 className="w-10 h-10 text-text-muted opacity-30" />
        <p className="text-text-secondary text-sm">Waiting for price data…</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            NIFTY 50 — Intraday (5M Candles)
          </span>
          {(priceData as any).isMock && (
            <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-semibold">
              SIMULATED DATA
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-text-secondary">
          {[
            { color: '#f59e0b', label: 'VWAP' },
            { color: '#818cf8', label: 'Pivot' },
            { color: '#ef4444', label: 'R/CallWall' },
            { color: '#22c55e', label: 'S/PutWall' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span style={{ display: 'inline-block', width: 14, height: 2, background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* SVG chart */}
      <div ref={containerRef} className="flex-1 w-full" style={{ height: size.h }}>
        <svg
          width={size.w} height={size.h}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ display: 'block', userSelect: 'none' }}
        >
          {/* Chart background */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
            fill="#070d1a" rx={2} />

          {/* Horizontal grid */}
          {yTicks.map(v => {
            const py = yScale(v);
            return py >= PAD.top && py <= PAD.top + chartH ? (
              <line key={v} x1={PAD.left} x2={size.w - PAD.right} y1={py} y2={py}
                stroke="#12202e" strokeWidth={1} />
            ) : null;
          })}

          {/* Reference lines (VWAP, Pivots, OI Walls) */}
          {refLines.map(({ v, color, dash, label }) => {
            const py = yScale(v);
            if (py < PAD.top - 2 || py > PAD.top + chartH + 2) return null;
            return (
              <g key={label}>
                <line x1={PAD.left} x2={size.w - PAD.right} y1={py} y2={py}
                  stroke={color} strokeWidth={1} strokeDasharray={dash} opacity={0.75} />
                <text x={size.w - PAD.right + 3} y={py + 3}
                  fontSize={8.5} fill={color} fontFamily="ui-monospace,monospace">
                  {label}
                </text>
              </g>
            );
          })}

          {/* Candlestick bodies */}
          {candles.map((c, i) => {
            const cx  = xScale(i);
            const oY  = yScale(c.open);
            const cY  = yScale(c.close);
            const hiY = yScale(c.high);
            const loY = yScale(c.low);
            const bull = c.close >= c.open;
            const col  = bull ? '#00d264' : '#ff3d5a';
            const bTop = Math.min(oY, cY);
            const bH   = Math.max(1.5, Math.abs(cY - oY));
            return (
              <g key={c.time}>
                <line x1={cx} x2={cx} y1={hiY} y2={loY} stroke={col} strokeWidth={1} />
                <rect
                  x={cx - barHalfW} y={bTop} width={barHalfW * 2} height={bH}
                  fill={col} fillOpacity={0.88}
                  stroke={col} strokeWidth={0.5} rx={0.5}
                />
              </g>
            );
          })}

          {/* Current LTP line */}
          {(() => {
            const py = yScale(priceData.price);
            if (py < PAD.top || py > PAD.top + chartH) return null;
            const col = priceData.change >= 0 ? '#00d264' : '#ff3d5a';
            return (
              <g>
                <line x1={PAD.left} x2={size.w - PAD.right} y1={py} y2={py}
                  stroke={col} strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
                <rect x={size.w - PAD.right + 1} y={py - 8} width={64} height={15}
                  fill={col} rx={2} />
                <text x={size.w - PAD.right + 4} y={py + 4}
                  fontSize={9} fill="#000" fontFamily="ui-monospace,monospace" fontWeight="bold">
                  {fmt(priceData.price)}
                </text>
              </g>
            );
          })()}

          {/* Y-axis labels */}
          {yTicks.map(v => {
            const py = yScale(v);
            return py >= PAD.top && py <= PAD.top + chartH ? (
              <text key={v + 'l'} x={size.w - PAD.right + 3} y={py + 3}
                fontSize={8} fill="#2d3f52" fontFamily="ui-monospace,monospace">
                {fmt(v)}
              </text>
            ) : null;
          })}

          {/* X-axis labels */}
          {xTicks.map(({ i, t }) => (
            <text key={i + 'x'} x={xScale(i)} y={size.h - 4}
              fontSize={9} fill="#2d3f52" textAnchor="middle"
              fontFamily="ui-monospace,monospace">
              {toIST(t)}
            </text>
          ))}

          {/* Hover crosshair + tooltip */}
          {tooltip && (() => {
            const { x, c } = tooltip;
            const bull = c.close >= c.open;
            const col  = bull ? '#00d264' : '#ff3d5a';
            const panelX = x + 10 > size.w - PAD.right - 125 ? x - 125 : x + 10;
            const panelY = Math.max(PAD.top, Math.min(PAD.top + chartH - 96, yScale(c.close) - 48));
            const chg = c.close - c.open;
            const pct = ((chg / c.open) * 100).toFixed(2);
            return (
              <g>
                <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + chartH}
                  stroke="#ffffff20" strokeWidth={1} />
                <rect x={panelX} y={panelY} width={118} height={92}
                  fill="#0d1524" stroke="#1e293b" rx={4} />
                <text x={panelX+8} y={panelY+14} fontSize={9} fill="#64748b" fontFamily="ui-monospace,monospace">
                  {toIST(c.time)}
                </text>
                {[
                  { label: 'O', val: fmt(c.open),  color: '#cbd5e1' },
                  { label: 'H', val: fmt(c.high),  color: '#22c55e' },
                  { label: 'L', val: fmt(c.low),   color: '#ef4444' },
                  { label: 'C', val: fmt(c.close), color: col },
                ].map(({ label, val, color }, j) => (
                  <text key={label} x={panelX+8} y={panelY + 28 + j * 13}
                    fontSize={9} fill="#64748b" fontFamily="ui-monospace,monospace">
                    {label} <tspan fill={color}>{val}</tspan>
                  </text>
                ))}
                <text x={panelX+8} y={panelY+82} fontSize={9} fill="#64748b" fontFamily="ui-monospace,monospace">
                  Chg <tspan fill={col}>{chg > 0 ? '+' : ''}{chg.toFixed(0)} ({pct}%)</tspan>
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* OHLC footer */}
      <div className="grid grid-cols-4 border-t border-border text-[10px] flex-shrink-0">
        {([
          { label: 'OPEN',       val: priceData.open,      color: '#cbd5e1' },
          { label: 'HIGH',       val: priceData.high,      color: '#22c55e' },
          { label: 'LOW',        val: priceData.low,       color: '#ef4444' },
          { label: 'PREV CLOSE', val: priceData.prevClose, color: '#94a3b8' },
        ] as const).map(({ label, val, color }) => (
          <div key={label} className="flex flex-col items-center py-2 border-r border-border last:border-0">
            <span className="text-text-muted mb-0.5">{label}</span>
            <span className="font-mono font-semibold" style={{ color }}>
              {formatPrice(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
"""

with open(DEST, 'w') as f:
    f.write(CONTENT)

print(f'OK: wrote {len(CONTENT)} chars to NiftyChart.tsx')
