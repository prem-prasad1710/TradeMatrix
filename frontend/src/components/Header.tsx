/**
 * Dashboard Header
 * Shows: NIFTY price, change, GIFT NIFTY direction, market open status, live indicator
 */

'use client';

import { formatPrice, formatChange, formatChangePct, getColorClass, formatTime } from '../lib/formatters';
import type { NiftyPrice, GiftNifty } from '@/types';
import { TrendingUp, TrendingDown, Minus, Wifi, WifiOff, Activity } from 'lucide-react';

interface HeaderProps {
  price: NiftyPrice | null;
  giftNifty: GiftNifty | null;
  isMarketOpen: boolean;
  isConnected: boolean;
  lastUpdate: string | null;
  reconnectCount: number;
}

export default function Header({
  price,
  giftNifty,
  isMarketOpen,
  isConnected,
  lastUpdate,
  reconnectCount,
}: HeaderProps) {
  const change = price?.change ?? 0;
  const changePct = price?.changePct ?? 0;
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-50">
      {/* Top bar */}
      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary tracking-wide">
              NIFTY Options Intelligence
            </h1>
            <p className="text-[10px] text-text-muted">Real-time OI Analytics Dashboard</p>
          </div>
        </div>

        {/* NIFTY Price — Main focal point */}
        <div className="flex items-center gap-6">
          {/* Spot Price */}
          <div className="text-center">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">NIFTY 50</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-bold text-text-primary">
                {price ? formatPrice(price.price) : '—'}
              </span>
              <div className={`flex items-center gap-1 ${getColorClass(change)}`}>
                <TrendIcon className="w-4 h-4" />
                <div className="text-sm font-mono">
                  <div>{formatChange(change)}</div>
                  <div className="text-xs">{formatChangePct(changePct)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* VWAP */}
          {price?.vwap && (
            <div className="border-l border-border pl-4">
              <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">VWAP</div>
              <div className="font-mono text-lg font-semibold text-accent">
                {formatPrice(price.vwap)}
              </div>
              <div className={`text-[10px] font-mono ${price.price > price.vwap ? 'text-bullish' : 'text-bearish'}`}>
                {price.price > price.vwap ? '▲ Above VWAP' : '▼ Below VWAP'}
              </div>
            </div>
          )}

          {/* GIFT NIFTY */}
          {giftNifty && (
            <div className="border-l border-border pl-4">
              <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">
                SGX / GIFT
              </div>
              <div className="font-mono text-base font-semibold text-text-primary">
                {formatPrice(giftNifty.price)}
              </div>
              <div className={`text-[10px] font-mono ${giftNifty.direction === 'UP' ? 'text-bullish' : 'text-bearish'}`}>
                {giftNifty.direction === 'UP' ? '▲' : '▼'} {formatChangePct(giftNifty.changePct)}
              </div>
            </div>
          )}

          {/* Day High / Low */}
          {price && (
            <div className="border-l border-border pl-4 hidden md:block">
              <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Day Range</div>
              <div className="text-xs font-mono">
                <span className="text-bearish">{formatPrice(price.low)}</span>
                <span className="text-text-muted mx-1">—</span>
                <span className="text-bullish">{formatPrice(price.high)}</span>
              </div>
              <div className="text-[10px] text-text-secondary font-mono mt-0.5">
                Prev: {formatPrice(price.prevClose)}
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          {/* Market open/closed indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            isMarketOpen
              ? 'bg-bullish/10 border-bullish/30 text-bullish'
              : 'bg-text-muted/10 border-border text-text-muted'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isMarketOpen ? 'bg-bullish animate-pulse' : 'bg-text-muted'}`} />
            {isMarketOpen ? 'Market Open' : 'Market Closed'}
          </div>

          {/* WebSocket connection status */}
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-bullish' : 'text-bearish'}`}
            title={isConnected ? 'Live feed connected' : `Disconnected (retry ${reconnectCount})`}>
            {isConnected
              ? <Wifi className="w-3.5 h-3.5" />
              : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {isConnected ? 'Live' : `Retry ${reconnectCount}`}
            </span>
          </div>

          {/* Last update time */}
          {lastUpdate && (
            <div className="text-[10px] text-text-muted hidden lg:block">
              Updated: {formatTime(lastUpdate)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
