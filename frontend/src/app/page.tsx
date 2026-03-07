/**
 * NIFTY Intelligence — Pro Dashboard
 *
 * Section layout (top → bottom):
 *  ① Signal Score Hero (full width)
 *  ② Core Analysis  – Trade Rec | Technicals | Price/OI
 *  ③ Market Charts  – NIFTY Candlestick (2/3) + OI Summary (1/3)
 *  ④ Smart Analytics – Gamma | Market Structure | Institutional Flow
 *  ⑤ Price Context   – Opening Range | Liquidity Levels
 *  ⑥ Option Chain Heatmap (full width)
 *  ⑦ Signals Hub    – Signals | Momentum | Support & Resistance
 *  ⑧ AI Analyst     – Chat + quick prompts
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
import SignalScorePanel from '../components/SignalScorePanel';
import GammaExposurePanel from '../components/GammaExposurePanel';
import MarketStructurePanel from '../components/MarketStructurePanel';
import InstitutionalFlowPanel from '../components/InstitutionalFlowPanel';
import OpeningRangePanel from '../components/OpeningRangePanel';
import LiquidityLevelsPanel from '../components/LiquidityLevelsPanel';
import { Activity, Zap } from 'lucide-react';

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
    gammaExposure,
    liquidityLevels,
    marketStructure,
    openingRange,
    fiiDii,
    signalScore,
  } = useMarketData();

  const sentiment = getMarketSentiment(signals);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Header
        price={price}
        giftNifty={giftNifty}
        isMarketOpen={isMarketOpen}
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        reconnectCount={reconnectCount}
      />

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-5 animate-fade-in">
            {/* Animated ring */}
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-accent/15" />
              <div className="absolute inset-0 rounded-full border-2 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-bullish/50 border-b-transparent border-l-transparent animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity className="w-5 h-5 text-accent" />
              </div>
            </div>
            <div>
              <p className="text-text-primary font-semibold">Connecting to live market feed</p>
              <p className="text-text-muted text-sm mt-1">Fetching NSE option chain &amp; price data…</p>
            </div>
            {/* Skeleton placeholders */}
            <div className="flex gap-3 justify-center mt-4 opacity-40">
              {[80,120,96].map((w,i) => (
                <div key={i} className="skeleton h-8 rounded-lg" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && !isLoading && !price && (
        <div className="mx-4 mt-6 p-5 rounded-2xl border border-bearish/25 bg-bearish/5 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-bearish/15 border border-bearish/25 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-bearish text-sm">!</span>
            </div>
            <div>
              <p className="text-bearish font-semibold text-sm">{error}</p>
              <p className="text-text-secondary text-xs mt-1">
                Make sure the backend server is running on port 3001.{' '}
                Run: <code className="text-accent bg-card px-1.5 py-0.5 rounded font-mono text-[11px]">cd backend &amp;&amp; npm run dev</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard ────────────────────────────────────────────────────── */}
      {!isLoading && (
        <main className="flex-1 px-3 lg:px-5 py-4 space-y-5">

          {/* ① SIGNAL SCORE — Hero */}
          <div className="animate-fade-in" style={{ animationDelay: '0ms' }}>
            <div className="section-divider mb-3">
              <span>⚡ Signal Engine</span>
            </div>
            <SignalScorePanel signalScore={signalScore ?? null} isMarketOpen={isMarketOpen} />
          </div>

          {/* ② CORE ANALYSIS */}
          <div className="animate-fade-in" style={{ animationDelay: '40ms' }}>
            <div className="section-divider mb-3">
              <span>📋 Core Analysis</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <TradeRecommendation
                tradeSetup={tradeSetup ?? null}
                oiPattern={oiPattern ?? null}
                isMarketOpen={isMarketOpen}
                currentPrice={price?.price ?? null}
              />
              <TechnicalAnalysisPanel technicals={tradeSetup?.technicals ?? null} />
              <PriceOIAnalysis oiPattern={oiPattern ?? null} />
            </div>
          </div>

          {/* ③ MARKET CHART */}
          <div className="animate-fade-in" style={{ animationDelay: '80ms' }}>
            <div className="section-divider mb-3">
              <span>📈 Price Chart &amp; Open Interest</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <NiftyChart priceData={price} optionChain={optionChain} />
              </div>
              <div>
                <OISummary optionChain={optionChain} />
              </div>
            </div>
          </div>

          {/* ④ SMART ANALYTICS */}
          <div className="animate-fade-in" style={{ animationDelay: '120ms' }}>
            <div className="section-divider mb-3">
              <span>🧠 Smart Analytics</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <GammaExposurePanel
                gammaExposure={gammaExposure ?? null}
                currentPrice={price?.price ?? null}
              />
              <MarketStructurePanel marketStructure={marketStructure ?? null} />
              <InstitutionalFlowPanel fiiDii={fiiDii ?? null} />
            </div>
          </div>

          {/* ⑤ PRICE CONTEXT */}
          <div className="animate-fade-in" style={{ animationDelay: '160ms' }}>
            <div className="section-divider mb-3">
              <span>🎯 Price Context &amp; Liquidity</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OpeningRangePanel
                openingRange={openingRange ?? null}
                currentPrice={price?.price ?? null}
              />
              <LiquidityLevelsPanel
                liquidityLevels={liquidityLevels ?? null}
                currentPrice={price?.price ?? null}
              />
            </div>
          </div>

          {/* ⑥ OPTION CHAIN HEATMAP */}
          <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
            <div className="section-divider mb-3">
              <span>🔥 Option Chain Heatmap</span>
            </div>
            <OptionChainHeatmap
              optionChain={optionChain}
              currentPrice={price?.price ?? null}
            />
          </div>

          {/* ⑦ SIGNALS HUB */}
          <div className="animate-fade-in" style={{ animationDelay: '240ms' }}>
            <div className="section-divider mb-3">
              <span>📡 Signals Hub</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <SignalsPanel
                signals={signals}
                pcr={optionChain?.pcr}
                sentiment={sentiment}
              />
              <MomentumDetector
                optionChain={optionChain}
                currentPrice={price?.price ?? null}
              />
              <SupportResistancePanel
                priceData={price}
                optionChain={optionChain}
              />
            </div>
          </div>

          {/* ⑧ AI ANALYST */}
          <div className="animate-fade-in" style={{ animationDelay: '280ms' }}>
            <div className="section-divider mb-3">
              <span>🤖 AI Market Analyst</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <AIAnalysis />
              </div>
              <div className="trading-card flex flex-col items-center justify-center text-center gap-3 py-10 opacity-50">
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-secondary">Quick Prompts</p>
                  <p className="text-[11px] text-text-muted mt-1">One-click analysis templates — coming soon</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-6 border-t border-border/40">
            <p className="text-[10px] text-text-muted">
              NIFTY Intelligence — For analytical purposes only. Not investment advice.
            </p>
            <p className="text-[10px] text-text-muted mt-1">
              Data: NSE India · Yahoo Finance · Updates every 10 seconds · {new Date().getFullYear()}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
