/**
 * TypeScript types for the Nifty Options Intelligence Dashboard
 */

export interface NiftyPrice {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  vwap: number | null;
  pivots: PivotPoints | null;
  candles: OHLCCandle[];
  change: number;
  changePct: number;
  timestamp: number;
}

export interface OHLCCandle {
  time: number;  // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PivotPoints {
  PP: number;
  R1: number;
  R2: number;
  R3: number;
  S1: number;
  S2: number;
  S3: number;
}

export interface GiftNifty {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  direction: 'UP' | 'DOWN';
}

export interface StrikeData {
  strikePrice: number;
  expiryDate: string;
  call: {
    oi: number;
    oiChange: number;
    oiChangePct: number;
    volume: number;
    iv: number;
    ltp: number;
    bid: number;
    ask: number;
    delta: number;
  };
  put: {
    oi: number;
    oiChange: number;
    oiChangePct: number;
    volume: number;
    iv: number;
    ltp: number;
    bid: number;
    ask: number;
    delta: number;
  };
  netOI: number;
  atm: boolean;
}

export interface OptionChain {
  underlyingValue: number;
  expiryDate: string;
  allExpiryDates: string[];
  strikes: StrikeData[];
  fetchTime: string;
  // Analysis fields
  pcr: number;
  pcrSentiment: PCRSentiment;
  maxPain: number;
  highestCallOI: number;
  highestCallStrike: number;
  highestPutOI: number;
  highestPutStrike: number;
  totalCallOI: number;
  totalPutOI: number;
  resistanceLevels: SupportResistanceLevel[];
  supportLevels: SupportResistanceLevel[];
  callOIHeat: StrikeData[];
  putOIHeat: StrikeData[];
  atmStrike: number;
}

export type PCRSentiment =
  | 'EXTREMELY_BULLISH'
  | 'BULLISH'
  | 'NEUTRAL'
  | 'BEARISH'
  | 'EXTREMELY_BEARISH';

export interface SupportResistanceLevel {
  strike: number;
  oi: number;
  type: 'CALL_WALL' | 'PUT_WALL';
}

export type SignalType =
  | 'BULLISH_MOMENTUM'
  | 'BEARISH_MOMENTUM'
  | 'POSSIBLE_BREAKOUT'
  | 'POSSIBLE_BREAKDOWN'
  | 'SHORT_COVERING'
  | 'LONG_BUILDUP'
  | 'RANGE_MARKET'
  | 'EXTREME_PCR_BULLISH'
  | 'EXTREME_PCR_BEARISH';

export type SignalIndicator = 'bullish' | 'bearish' | 'neutral' | 'warning';

export interface TradingSignal {
  id: string;
  type: SignalType;
  label: string;
  description: string;
  confidence: number;
  indicator: SignalIndicator;
  metadata: Record<string, unknown>;
  timestamp: string;
  isNew: boolean;
}

export type MarketSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type BuildupType =
  | 'LONG_BUILDUP'
  | 'SHORT_BUILDUP'
  | 'LONG_UNWINDING'
  | 'SHORT_COVERING'
  | 'NEUTRAL';

export interface OISnapshot {
  ts: number;
  price: number;
  totalCallOI: number;
  totalPutOI: number;
  totalOI: number;
}

export interface OIPattern {
  pattern: BuildupType;
  priceChange: number;      // pts since 5-min ago
  oiChange: number;         // contracts since 5-min ago
  priceChangePct: number;
  oiChangePct: number;
  description: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  history: OISnapshot[];
  // Confirmation & simulation flags
  isSimulation?: boolean;   // true when market is closed (mock simulation)
  isConfirmed?: boolean;    // true once pattern persists ≥ 3 cycles
  confirmedCycles?: number; // how many consecutive ticks pattern has held
}

export type TradeBias = 'BUY_CE' | 'BUY_PE' | 'WAIT';

export interface TradeSetup {
  bias: TradeBias;
  strike: number;
  type: 'CE' | 'PE' | null;
  ltp: number;
  lots: number;               // affordable lots with ₹10k capital
  investment: number;         // actual capital deployed
  entry: number;              // entry premium
  target: number;             // target premium
  stopLoss: number;           // stop loss premium
  rewardRisk: string;         // e.g. "1:1.6"
  oiPattern: BuildupType;
  confidence: number;         // 0-100
  reasons: string[];          // list of reasons supporting the trade
  warnings: string[];         // risk warnings
  timeframe: '5m' | '15m';
  capital: number;            // total capital (10000)
  pnlTarget: number;          // INR profit target
  pnlSL: number;              // INR stop loss amount
  // Confirmation & simulation flags
  isSimulation?: boolean;     // true when market is closed
  isConfirmed?: boolean;      // pattern confirmed over ≥ 3 cycles
  patternStreak?: number;     // consecutive cycles showing same pattern
  bullScore?: number;
  bearScore?: number;
}

export interface MarketUpdate {
  type: 'MARKET_UPDATE' | 'SNAPSHOT' | 'CONNECTED' | 'PONG';
  timestamp: string;
  isMarketOpen: boolean;
  price: NiftyPrice | null;
  giftNifty: GiftNifty | null;
  optionChain: OptionChain | null;
  signals: TradingSignal[];
  oiPattern?: OIPattern | null;
  tradeSetup?: TradeSetup | null;
  lastFetch?: string;
}
