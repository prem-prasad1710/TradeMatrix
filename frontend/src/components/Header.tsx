/**
 * Dashboard Header — Professional Trading Terminal Style
 *
 * THREE-ZONE layout:
 *  LEFT   Brand + logo pill + live indicator
 *  CENTER NIFTY price (hero), change pct, VWAP, GIFT NIFTY, day range bar
 *  RIGHT  Market status, WS connection, update time
 */

'use client';

import {
  formatPrice, formatChange, formatChangePct, formatTime,
} from '../lib/formatters';
import type { NiftyPrice, GiftNifty } from '@/types';
import { TrendingUp, TrendingDown, Minus, Wifi, WifiOff, Activity, Zap } from 'lucide-react';

interface HeaderProps {
  price: NiftyPrice | null;
  giftNifty: GiftNifty | null;
  isMarketOpen: boolean;
  isConnected: boolean;
  lastUpdate: string | null;
  reconnectCount: number;
}

export default function Header({
  price, giftNifty, isMarketOpen, isConnected, lastUpdate, reconnectCount,
}: HeaderProps) {
  const change    = price?.change    ?? 0;
  const changePct = price?.changePct ?? 0;
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  const priceColor = change > 0 ? 'text-bullish' : change < 0 ? 'text-bearish' : 'text-text-primary';
  const accentLine = change > 0
    ? 'linear-gradient(90deg,transparent 0%,#00e676 30%,#00bcd4 70%,transparent 100%)'
    : change < 0
    ? 'linear-gradient(90deg,transparent 0%,#ff1744 30%,#ff6d00 70%,transparent 100%)'
    : 'linear-gradient(90deg,transparent 0%,#3b82f6 50%,transparent 100%)';

  const rangePct = price
    ? Math.min(100, Math.max(0, ((price.price - price.low) / Math.max(0.01, price.high - price.low)) * 100))
    : 50;

  return (
    <header className="glass-header sticky top-0 z-50">
      {/* ── Colour accent line ─────────────────────────────────── */}
      <div className="h-[2px] w-full" style={{ background: accentLine }} />

      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">

        {/* ═══ LEFT — Brand ═══════════════════════════════════════ */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-accent/12 border border-accent/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-accent" />
            </div>
            {isMarketOpen && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-bullish border-2 border-[#060910] live-dot" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-text-primary whitespace-nowrap">
                NIFTY Intelligence
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-accent/10 border border-accent/20 text-accent">
                <Zap className="w-2.5 h-2.5" />PRO
              </span>
            </div>
            <p className="text-[10px] text-text-muted leading-none mt-0.5 hidden sm:block">
              Real-time Options Analytics
            </p>
          </div>
        </div>

        {/* ═══ CENTER — Price metrics ══════════════════════════════ */}
        <div className="flex items-center divide-x divide-border/50 flex-wrap">

          {/* NIFTY Spot — hero */}
          <div className="flex items-start gap-3 pr-5">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted mb-0.5">NIFTY 50</div>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span
                  className={`text-[2rem] font-bold font-mono tracking-tight tabular-nums leading-none ${priceColor}`}
                  style={change !== 0 ? {
                    textShadow: change > 0
                      ? '0 0 28px rgba(0,230,118,0.5)'
                      : '0 0 28px rgba(255,23,68,0.5)',
                  } : {}}
                >
                  {price ? formatPrice(price.price) : (
                    <span className="skeleton inline-block w-36 h-9 align-middle" />
                  )}
                </span>
                {price && (
                  <div className={`flex flex-col ${priceColor}`}>
                    <div className="flex items-center gap-1 text-sm font-semibold font-mono leading-tight">
                      <TrendIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      {formatChange(change)}
                    </div>
                    <span className="text-[11px] font-mono opacity-75">{formatChangePct(changePct)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* VWAP */}
          {price?.vwap && (
            <div className="px-5 hidden md:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted mb-0.5">VWAP</div>
              <div className="text-lg font-mono font-bold text-accent tabular-nums leading-tight">
                {formatPrice(price.vwap)}
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${price.price > price.vwap ? 'text-bullish' : 'text-bearish'}`}>
                {price.price > price.vwap ? '▲ Above' : '▼ Below'} VWAP
              </div>
            </div>
          )}

          {/* GIFT NIFTY */}
          {giftNifty && (
            <div className="px-5 hidden lg:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted mb-0.5">GIFT Nifty</div>
              <div className="text-base font-mono font-bold text-text-primary tabular-nums leading-tight">
                {formatPrice(giftNifty.price)}
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${giftNifty.direction === 'UP' ? 'text-bullish' : 'text-bearish'}`}>
                {giftNifty.direction === 'UP' ? '▲' : '▼'} {formatChangePct(giftNifty.changePct)}
              </div>
            </div>
          )}

          {/* Day Range */}
          {price && (
            <div className="px-5 hidden xl:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted mb-1">Day Range</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-bearish tabular-nums">{formatPrice(price.low)}</span>
                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(24,32,54,0.9)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${rangePct}%`,
                      background: change >= 0
                        ? 'linear-gradient(90deg,#00e676,#00bcd4)'
                        : 'linear-gradient(90deg,#ff1744,#ff6d00)',
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono text-bullish tabular-nums">{formatPrice(price.high)}</span>
              </div>
              <div className="text-[10px] text-text-muted font-mono mt-0.5 tabular-nums">
                Prev close: {formatPrice(price.prevClose)}
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT — Status ══════════════════════════════════════ */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Market pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
            isMarketOpen
              ? 'bg-bullish/8 border-bullish/22 text-bullish'
              : 'bg-surface border-border text-text-muted'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isMarketOpen ? 'live-dot' : 'bg-text-muted'}`} />
            {isMarketOpen ? 'LIVE' : 'CLOSED'}
          </div>

          {/* WS pill */}
          <div
            title={isConnected ? 'WebSocket connected' : `Disconnected — retry #${reconnectCount}`}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border cursor-default ${
              isConnected
                ? 'bg-accent/8 border-accent/18 text-accent'
                : 'bg-bearish/8 border-bearish/22 text-bearish'
            }`}
          >
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden sm:inline">{isConnected ? 'WS' : `×${reconnectCount}`}</span>
          </div>

          {/* Time */}
          {lastUpdate && (
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] text-text-muted uppercase tracking-wider">Updated</span>
              <span className="text-[10px] font-mono text-text-secondary tabular-nums">{formatTime(lastUpdate)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
