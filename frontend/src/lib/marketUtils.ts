/**
 * Market utility functions for the frontend.
 */

import type { TradingSignal, MarketSentiment } from '@/types';

/**
 * Get overall market sentiment based on active signals.
 * Used to determine the header sentiment indicator.
 */
export function getMarketSentiment(signals: TradingSignal[]): MarketSentiment {
  if (!signals || signals.length === 0) return 'NEUTRAL';

  const bullishCount = signals.filter(s => s.indicator === 'bullish').length;
  const bearishCount = signals.filter(s => s.indicator === 'bearish').length;

  if (bullishCount > bearishCount + 1) return 'BULLISH';
  if (bearishCount > bullishCount + 1) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * Get the color class for a signal indicator.
 */
export function getSentimentColor(sentiment: MarketSentiment): string {
  switch (sentiment) {
    case 'BULLISH': return 'text-bullish';
    case 'BEARISH': return 'text-bearish';
    default: return 'text-neutral';
  }
}

/**
 * Format large numbers (OI in lakhs/crores).
 */
export function formatLargeNumber(num: number): string {
  if (Math.abs(num) >= 10_000_000) return `${(num / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(num) >= 100_000) return `${(num / 100_000).toFixed(1)}L`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toString();
}
