/**
 * OI Summary Panel — Enhanced
 * Shows: PCR gauge, Max Pain, ATM IV, Straddle, IV Skew, Top 5 Walls,
 *        OI Change totals, Market Breadth, Support/Resistance
 */

'use client';

import { useState } from 'react';
import { formatOI, formatPrice, getPCRLabel } from '../lib/formatters';
import type { OptionChain } from '@/types';
import {
  Shield, TrendingDown, TrendingUp, Target, Activity,
  BarChart2, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';

interface OISummaryProps {
  optionChain: OptionChain | null;
}

function fmtOIChange(v: number) {
  if (v === 0) return '—';
  const abs = Math.abs(v);
  const s = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
    ? `${(abs / 1_000).toFixed(1)}K`
    : `${abs}`;
  return (v > 0 ? '+' : '−') + s;
}

function IVSkewBadge({ label }: { label?: string }) {
  if (!label) return null;
  const cfg: Record<string, { text: string; cls: string }> = {
    HIGH_PUT_SKEW:   { text: 'High Put Skew',   cls: 'bg-bearish/20 text-bearish border-bearish/30' },
    MILD_PUT_SKEW:   { text: 'Mild Put Skew',   cls: 'bg-bearish/10 text-bearish/80 border-bearish/20' },
    HIGH_CALL_SKEW:  { text: 'High Call Skew',  cls: 'bg-bullish/20 text-bullish border-bullish/30' },
    MILD_CALL_SKEW:  { text: 'Mild Call Skew',  cls: 'bg-bullish/10 text-bullish/80 border-bullish/20' },
    NEUTRAL_SKEW:    { text: 'Neutral Skew',    cls: 'bg-neutral/10 text-neutral border-neutral/20' },
  };
  const c = cfg[label] ?? { text: label, cls: 'bg-surface text-text-secondary border-border' };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${c.cls}`}>
      {c.text}
    </span>
  );
}

export default function OISummary({ optionChain }: OISummaryProps) {
  const [showCallWalls, setShowCallWalls] = useState(false);
  const [showPutWalls,  setShowPutWalls]  = useState(false);

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
  const pcrMin   = 0.4;
  const pcrMax   = 1.8;
  const pcrPct   = Math.min(100, Math.max(0, ((optionChain.pcr - pcrMin) / (pcrMax - pcrMin)) * 100));
  const totalOI  = (optionChain.totalCallOI || 0) + (optionChain.totalPutOI || 0);
  const callPct  = totalOI > 0 ? (optionChain.totalCallOI / totalOI) * 100 : 50;

  const { straddlePrice, atmIV, atmCeIV, atmPeIV, ivSkew, ivSkewLabel,
          totalCallOIChange, totalPutOIChange,
          top5CallWalls, top5PutWalls,
          topCallOIGainer, topPutOIGainer,
          marketBreadth, distToCallWall, distToPutWall,
          bullishStrikes, bearishStrikes } = optionChain;

  // Straddle implies an expected ± range
  const currentPrice = optionChain.underlyingValue;
  const straddleHigh = straddlePrice ? +(currentPrice + straddlePrice).toFixed(0) : null;
  const straddleLow  = straddlePrice ? +(currentPrice - straddlePrice).toFixed(0) : null;

  return (
    <div className="trading-card space-y-4">
      {/* Header */}
      <div className="trading-card-header">
        <Target className="w-3.5 h-3.5" />
        OI Summary
        {optionChain.fetchTime && (
          <span className="ml-auto text-[9px] text-text-muted font-normal">
            {new Date(optionChain.fetchTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* ── PCR Gauge ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-text-secondary">Put/Call Ratio</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-text-primary">
              {optionChain.pcr.toFixed(2)}
            </span>
            <span className={`text-xs font-semibold ${pcrLabel.color}`}>
              {pcrLabel.label}
            </span>
          </div>
        </div>
        <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-bearish via-neutral to-bullish opacity-30" />
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

      {/* ── ATM IV + Straddle ─────────────────────────────────────────────── */}
      {(atmIV !== undefined || straddlePrice !== undefined) && (
        <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
          {/* ATM IV */}
          <div className="bg-surface/50 rounded-lg p-2.5 space-y-1">
            <div className="text-[9px] text-text-muted uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-2.5 h-2.5" />
              ATM IV
            </div>
            <div className="font-mono text-base font-bold text-text-primary">
              {atmIV?.toFixed(1)}%
            </div>
            <div className="flex gap-2 text-[9px]">
              <span className="text-bearish">CE: {atmCeIV?.toFixed(1)}%</span>
              <span className="text-bullish">PE: {atmPeIV?.toFixed(1)}%</span>
            </div>
          </div>

          {/* Straddle */}
          <div className="bg-surface/50 rounded-lg p-2.5 space-y-1">
            <div className="text-[9px] text-text-muted uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              Straddle
            </div>
            <div className="font-mono text-base font-bold text-accent">
              ₹{straddlePrice?.toFixed(0)}
            </div>
            {straddleHigh && straddleLow && (
              <div className="text-[9px] text-text-secondary">
                {formatPrice(straddleLow)} – {formatPrice(straddleHigh)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── IV Skew ───────────────────────────────────────────────────────── */}
      {ivSkew !== undefined && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] text-text-secondary flex items-center gap-1">
              <BarChart2 className="w-3 h-3" />
              IV Skew (Put − Call)
            </div>
            <IVSkewBadge label={ivSkewLabel} />
          </div>
          <div className="flex items-center gap-2">
            {/* Skew bar: centre = 0, left = negative (call > put), right = positive (put > call) */}
            <div className="flex-1 h-2 bg-border rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {ivSkew >= 0 ? (
                <div
                  className="absolute top-0 h-full bg-bearish/60 rounded-r-full"
                  style={{ left: '50%', width: `${Math.min(50, Math.abs(ivSkew) * 5)}%` }}
                />
              ) : (
                <div
                  className="absolute top-0 h-full bg-bullish/60 rounded-l-full"
                  style={{ right: '50%', width: `${Math.min(50, Math.abs(ivSkew) * 5)}%` }}
                />
              )}
            </div>
            <span className={`font-mono text-xs font-semibold ${ivSkew > 0 ? 'text-bearish' : ivSkew < 0 ? 'text-bullish' : 'text-neutral'}`}>
              {ivSkew > 0 ? '+' : ''}{ivSkew?.toFixed(1)}
            </span>
          </div>
          <div className="text-[9px] text-text-muted mt-0.5">
            {ivSkew > 1 ? 'Market buying protection (bearish fear)' : ivSkew < -1 ? 'Market complacent (bullish bias)' : 'Balanced sentiment'}
          </div>
        </div>
      )}

      {/* ── Max Pain ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-text-secondary text-xs">
          <Target className="w-3 h-3" />
          Max Pain
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-neutral">
            {formatPrice(optionChain.maxPain)}
          </span>
          {currentPrice && (
            <span className="text-[9px] text-text-muted">
              ({currentPrice > optionChain.maxPain ? '↓' : '↑'}
              {Math.abs(currentPrice - optionChain.maxPain).toFixed(0)} pts away)
            </span>
          )}
        </div>
      </div>

      {/* ── Primary Call/Put Walls ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bearish/5 border border-bearish/20 rounded-lg p-3">
          <div className="flex items-center gap-1 text-bearish text-[10px] font-medium uppercase tracking-wider mb-1.5">
            <TrendingDown className="w-3 h-3" />
            Call Wall #1
          </div>
          <div className="font-mono text-base font-bold text-text-primary">
            {formatPrice(optionChain.highestCallStrike)}
          </div>
          <div className="text-[10px] text-text-secondary mt-0.5">
            {formatOI(optionChain.highestCallOI)}
          </div>
          {distToCallWall != null && (
            <div className="text-[9px] text-bearish/70 mt-0.5">+{distToCallWall} pts away</div>
          )}
        </div>

        <div className="bg-bullish/5 border border-bullish/20 rounded-lg p-3">
          <div className="flex items-center gap-1 text-bullish text-[10px] font-medium uppercase tracking-wider mb-1.5">
            <TrendingUp className="w-3 h-3" />
            Put Wall #1
          </div>
          <div className="font-mono text-base font-bold text-text-primary">
            {formatPrice(optionChain.highestPutStrike)}
          </div>
          <div className="text-[10px] text-text-secondary mt-0.5">
            {formatOI(optionChain.highestPutOI)}
          </div>
          {distToPutWall != null && (
            <div className="text-[9px] text-bullish/70 mt-0.5">−{distToPutWall} pts away</div>
          )}
        </div>
      </div>

      {/* ── Top 5 Call Walls (collapsible) ───────────────────────────────── */}
      {top5CallWalls && top5CallWalls.length > 1 && (
        <div className="border-t border-border pt-2">
          <button
            className="w-full flex items-center justify-between text-[10px] text-text-secondary hover:text-bearish transition-colors py-1"
            onClick={() => setShowCallWalls(v => !v)}
          >
            <span className="flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-bearish" />
              Top 5 Call Walls (Resistance)
            </span>
            {showCallWalls ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showCallWalls && (
            <div className="mt-1 space-y-1">
              {top5CallWalls.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="text-text-muted w-4">R{i + 1}</span>
                  <span className="font-mono text-bearish font-semibold w-14">{formatPrice(w.strike)}</span>
                  <span className="text-text-secondary flex-1">{formatOI(w.oi)}</span>
                  <span className={`font-mono ${w.oiChange > 0 ? 'text-bearish' : 'text-bullish'}`}>
                    {fmtOIChange(w.oiChange)}
                  </span>
                  {w.iv > 0 && <span className="text-text-muted">{w.iv.toFixed(1)}%</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Top 5 Put Walls (collapsible) ────────────────────────────────── */}
      {top5PutWalls && top5PutWalls.length > 1 && (
        <div className="border-t border-border pt-2">
          <button
            className="w-full flex items-center justify-between text-[10px] text-text-secondary hover:text-bullish transition-colors py-1"
            onClick={() => setShowPutWalls(v => !v)}
          >
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-bullish" />
              Top 5 Put Walls (Support)
            </span>
            {showPutWalls ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showPutWalls && (
            <div className="mt-1 space-y-1">
              {top5PutWalls.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="text-text-muted w-4">S{i + 1}</span>
                  <span className="font-mono text-bullish font-semibold w-14">{formatPrice(w.strike)}</span>
                  <span className="text-text-secondary flex-1">{formatOI(w.oi)}</span>
                  <span className={`font-mono ${w.oiChange > 0 ? 'text-bullish' : 'text-bearish'}`}>
                    {fmtOIChange(w.oiChange)}
                  </span>
                  {w.iv > 0 && <span className="text-text-muted">{w.iv.toFixed(1)}%</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── OI Change Summary ─────────────────────────────────────────────── */}
      {(totalCallOIChange !== undefined || totalPutOIChange !== undefined) && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3" />
            OI Change This Cycle
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-bearish/5 rounded p-2">
              <div className="text-[9px] text-bearish/70 mb-1">Call OI Δ</div>
              <div className={`font-mono font-bold ${(totalCallOIChange ?? 0) > 0 ? 'text-bearish' : 'text-bullish'}`}>
                {fmtOIChange(totalCallOIChange ?? 0)}
              </div>
              <div className="text-[9px] text-text-muted mt-0.5">
                {(totalCallOIChange ?? 0) > 0 ? 'New shorts added' : 'Short covering'}
              </div>
            </div>
            <div className="bg-bullish/5 rounded p-2">
              <div className="text-[9px] text-bullish/70 mb-1">Put OI Δ</div>
              <div className={`font-mono font-bold ${(totalPutOIChange ?? 0) > 0 ? 'text-bullish' : 'text-bearish'}`}>
                {fmtOIChange(totalPutOIChange ?? 0)}
              </div>
              <div className="text-[9px] text-text-muted mt-0.5">
                {(totalPutOIChange ?? 0) > 0 ? 'New longs added' : 'Long unwinding'}
              </div>
            </div>
          </div>

          {/* OI Gainers this cycle */}
          {(topCallOIGainer || topPutOIGainer) && (
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {topCallOIGainer && (
                <div className="flex items-center gap-1 text-bearish/80">
                  <TrendingDown className="w-2.5 h-2.5" />
                  <span>New wall: <span className="font-mono font-semibold">{formatPrice(topCallOIGainer.strike)}</span></span>
                </div>
              )}
              {topPutOIGainer && (
                <div className="flex items-center gap-1 text-bullish/80">
                  <TrendingUp className="w-2.5 h-2.5" />
                  <span>New floor: <span className="font-mono font-semibold">{formatPrice(topPutOIGainer.strike)}</span></span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Total OI bar ─────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-3">
        <div className="flex justify-between text-[10px] text-text-secondary mb-1.5">
          <span className="text-bearish">Total Call OI</span>
          <span className="text-bullish">Total Put OI</span>
        </div>
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
          <div
            className="bg-bearish/60 transition-all duration-500"
            style={{ width: `${callPct}%` }}
          />
          <div className="bg-bullish/60 flex-1 transition-all duration-500" />
        </div>
        <div className="flex justify-between text-[10px] font-mono mt-1.5">
          <span className="text-bearish">{formatOI(optionChain.totalCallOI)}</span>
          <span className="text-bullish">{formatOI(optionChain.totalPutOI)}</span>
        </div>
      </div>

      {/* ── Market Breadth ────────────────────────────────────────────────── */}
      {marketBreadth !== undefined && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-text-secondary flex items-center gap-1">
              <BarChart2 className="w-3 h-3" />
              OI Breadth
            </span>
            <span className={`text-[10px] font-semibold ${marketBreadth >= 55 ? 'text-bullish' : marketBreadth <= 45 ? 'text-bearish' : 'text-neutral'}`}>
              {marketBreadth.toFixed(0)}% bullish strikes
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${marketBreadth >= 50 ? 'bg-bullish/60' : 'bg-bearish/60'}`}
              style={{ width: `${marketBreadth}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted mt-1">
            <span>{bearishStrikes} bearish</span>
            <span>{bullishStrikes} bullish</span>
          </div>
        </div>
      )}

      {/* ── OI-Based S/R Levels ───────────────────────────────────────────── */}
      {(optionChain.resistanceLevels.length > 0 || optionChain.supportLevels.length > 0) && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            OI-Based Levels
          </div>
          <div className="space-y-1.5">
            {optionChain.resistanceLevels.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-bearish/70">R{i + 1}</span>
                <span className="font-mono text-bearish font-semibold">{formatPrice(r.strike)}</span>
                <span className="text-text-muted text-[10px]">{formatOI(r.oi)}</span>
              </div>
            ))}
            {optionChain.supportLevels.slice(0, 2).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-bullish/70">S{i + 1}</span>
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
