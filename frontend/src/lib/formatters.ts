/**
 * Frontend formatting utilities
 */

/**
 * Format a number as Indian currency (lakhs/crores system).
 * 10000 → 10K, 100000 → 1L, 10000000 → 1Cr
 */
export function formatOI(value: number): string {
  if (!value && value !== 0) return '-';
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absVal >= 10_000_000) return `${sign}${(absVal / 10_000_000).toFixed(2)}Cr`;
  if (absVal >= 100_000) return `${sign}${(absVal / 100_000).toFixed(2)}L`;
  if (absVal >= 1_000) return `${sign}${(absVal / 1_000).toFixed(1)}K`;
  return `${sign}${absVal.toString()}`;
}

/**
 * Format price with commas (Indian number system).
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format change with +/- sign.
 */
export function formatChange(value: number | null | undefined): string {
  if (value == null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

export function formatChangePct(value: number | null | undefined): string {
  if (value == null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Get CSS class based on value sign.
 */
export function getColorClass(value: number | null | undefined): string {
  if (value == null) return 'text-text-secondary';
  if (value > 0) return 'text-bullish';
  if (value < 0) return 'text-bearish';
  return 'text-text-primary';
}

export function getSignalClass(indicator: string): string {
  switch (indicator) {
    case 'bullish': return 'signal-bullish';
    case 'bearish': return 'signal-bearish';
    case 'warning': return 'signal-warning';
    default: return 'signal-neutral';
  }
}

/**
 * Compute OI bar width as percentage of max OI in the chain.
 */
export function computeOIBarWidth(oi: number, maxOI: number): number {
  if (!maxOI || !oi) return 0;
  return Math.min(100, (oi / maxOI) * 100);
}

/**
 * PCR sentiment display.
 */
export function getPCRLabel(pcr: number): { label: string; color: string } {
  if (pcr >= 1.5) return { label: 'Extremely Bullish', color: 'text-bullish' };
  if (pcr >= 1.2) return { label: 'Bullish', color: 'text-bullish' };
  if (pcr >= 0.9) return { label: 'Neutral', color: 'text-neutral' };
  if (pcr >= 0.7) return { label: 'Bearish', color: 'text-bearish' };
  return { label: 'Extremely Bearish', color: 'text-bearish' };
}

/**
 * Format time in IST.
 */
export function formatTime(timestamp: string | number | null): string {
  if (!timestamp) return '-';
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Get heatmap intensity color for OI visualization.
 * Returns RGBA string with opacity proportional to OI level.
 */
export function getOIHeatColor(oi: number, maxOI: number, type: 'call' | 'put'): string {
  if (!maxOI || !oi) return 'transparent';
  const intensity = Math.min(1, oi / maxOI);
  const opacity = 0.08 + intensity * 0.35;

  if (type === 'call') return `rgba(255, 61, 90, ${opacity.toFixed(2)})`;
  return `rgba(0, 210, 100, ${opacity.toFixed(2)})`;
}

/**
 * Buildup type display config.
 */
export const BUILDUP_CONFIG = {
  LONG_BUILDUP: { label: 'Long Buildup', color: 'text-bullish', bg: 'bg-bullish/10' },
  SHORT_BUILDUP: { label: 'Short Buildup', color: 'text-bearish', bg: 'bg-bearish/10' },
  SHORT_COVERING: { label: 'Short Covering', color: 'text-bullish', bg: 'bg-bullish/10' },
  LONG_UNWINDING: { label: 'Long Unwinding', color: 'text-bearish', bg: 'bg-bearish/10' },
  NEUTRAL: { label: 'Neutral', color: 'text-text-secondary', bg: 'bg-transparent' },
} as const;
