/**
 * Nifty Options Intelligence Dashboard - Main Page
 *
 * Real-time dashboard layout:
 * ┌─────────────────────────────────────────────┐
 * │  HEADER: Price | VWAP | GIFT NIFTY | Status │
 * ├────────────────────┬────────────────────────┤
 * │  NIFTY Chart       │  OI Summary            │
 * │  (Candlestick +    │  (PCR, Max Pain,        │
 * │   VWAP + Levels)   │   Call/Put Walls)       │
 * ├────────────────────┼────────────────────────┤
 * │  Option Chain      │  Signals Panel         │
 * │  Heatmap           │  + Momentum Detector   │
 * │  (Strike OI table) │  + S/R Panel           │
 * └────────────────────┴────────────────────────┘
 */

'use client';

import { useMarketData } from '../hooks/useMarketData';
import Header from '../components/Header';
import NiftyChart from '../components/NiftyChart';
import OISummary from '../components/OISummary';
import OptionChainHeatmap from '../components/OptionChainHeatmap';
import SignalsPanel from '../components/SignalsPanel';
import MomentumDetector from '../components/MomentumDetector';
import SupportResistancePanel from '../components/SupportResistancePanel';
import PriceOIAnalysis from '../components/PriceOIAnalysis';
import TradeRecommendation from '../components/TradeRecommendation';
import TechnicalAnalysisPanel from '../components/TechnicalAnalysisPanel';
import { getMarketSentiment } from '../lib/marketUtils';
import AIAnalysis from '../components/AIAnalysis';

export default function DashboardPage() {
  const {
    price,
    giftNifty,
    optionChain,
    signals,
    oiPattern,
    tradeSetup,
    isMarketOpen,
    isConnected,
    isLoading,
    lastUpdate,
    reconnectCount,
    error,
  } = useMarketData();

  const sentiment = getMarketSentiment(signals);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Sticky Header ───────────────────────────────────────────────────── */}
      <Header
        price={price}
        giftNifty={giftNifty}
        isMarketOpen={isMarketOpen}
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        reconnectCount={reconnectCount}
      />

      {/* ── Loading State ────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary text-sm">Connecting to live market feed...</p>
            <p className="text-text-muted text-xs mt-1">Fetching NSE option chain & price data</p>
          </div>
        </div>
      )}

      {/* ── Error State ──────────────────────────────────────────────────── */}
      {error && !isLoading && !price && (
        <div className="mx-4 mt-4 p-4 bg-bearish/10 border border-bearish/30 rounded-xl">
          <p className="text-bearish font-medium text-sm">⚠️ {error}</p>
          <p className="text-text-secondary text-xs mt-1">
            Make sure the backend server is running on port 3001.
            Run: <code className="text-accent bg-card px-1 rounded">cd backend && npm run dev</code>
          </p>
        </div>
      )}

      {/* ── Main Dashboard Grid ──────────────────────────────────────────── */}
      {!isLoading && (
        <main className="flex-1 p-3 lg:p-4 space-y-3">

          {/* Row 0: Trade Recommendation + Technical Analysis + Price vs OI */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <TradeRecommendation
              tradeSetup={tradeSetup ?? null}
              oiPattern={oiPattern ?? null}
              isMarketOpen={isMarketOpen}
              currentPrice={price?.price ?? null}
            />
            <TechnicalAnalysisPanel
              technicals={tradeSetup?.technicals ?? null}
            />
            <PriceOIAnalysis oiPattern={oiPattern ?? null} />
          </div>

          {/* Row 1: Chart + OI Summary */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {/* NIFTY Chart — takes 2/3 width on large screens */}
            <div className="xl:col-span-2">
              <NiftyChart priceData={price} optionChain={optionChain} />
            </div>

            {/* OI Summary — takes 1/3 width */}
            <div>
              <OISummary optionChain={optionChain} />
            </div>
          </div>

          {/* Row 4: Option Chain Heatmap (full width) */}
          <div>
            <OptionChainHeatmap
              optionChain={optionChain}
              currentPrice={price?.price ?? null}
            />
          </div>

          {/* Row 5: Signals + Momentum + Support/Resistance */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {/* Trading Signals */}
            <SignalsPanel
              signals={signals}
              pcr={optionChain?.pcr}
              sentiment={sentiment}
            />

            {/* Momentum Detector */}
            <MomentumDetector
              optionChain={optionChain}
              currentPrice={price?.price ?? null}
            />

            {/* Support & Resistance */}
            <SupportResistancePanel
              priceData={price}
              optionChain={optionChain}
            />
          </div>

          {/* Row 6: AI Market Analyst (Ollama) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-2">
              <AIAnalysis />
            </div>
            <div className="flex flex-col gap-3">
              {/* Placeholder for future AI-powered widget */}
              <div className="trading-card text-center text-text-muted text-xs py-8 opacity-60">
                <p className="font-medium">Quick Prompts</p>
                <p className="mt-2 text-[10px]">Coming soon — one-click analysis templates</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 text-[10px] text-slate-600 border-t border-[#111e38]">
            <p>Nifty Options Intelligence Dashboard — For analytical purposes only. Not investment advice.</p>
            <p className="mt-1">
              Data: NSE India (Option Chain) · Yahoo Finance (Price) · Updates every 10 seconds
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
