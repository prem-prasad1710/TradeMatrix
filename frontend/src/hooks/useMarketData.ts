/**
 * useMarketData Hook
 *
 * Connects to the WebSocket server and maintains real-time market data state.
 * Falls back to HTTP polling if WebSocket connection fails.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarketUpdate, NiftyPrice, OptionChain, TradingSignal, GiftNifty, OIPattern, TradeSetup } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface MarketDataState {
  price: NiftyPrice | null;
  giftNifty: GiftNifty | null;
  optionChain: OptionChain | null;
  signals: TradingSignal[];
  oiPattern: OIPattern | null;
  tradeSetup: TradeSetup | null;
  isMarketOpen: boolean;
  isConnected: boolean;
  isLoading: boolean;
  lastUpdate: string | null;
  error: string | null;
  reconnectCount: number;
}

const initialState: MarketDataState = {
  price: null,
  giftNifty: null,
  optionChain: null,
  signals: [],
  oiPattern: null,
  tradeSetup: null,
  isMarketOpen: false,
  isConnected: false,
  isLoading: true,
  lastUpdate: null,
  error: null,
  reconnectCount: 0,
};

export function useMarketData() {
  const [state, setState] = useState<MarketDataState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);

  const updateState = useCallback((update: Partial<MarketUpdate>) => {
    setState(prev => ({
      ...prev,
      price: update.price ?? prev.price,
      giftNifty: update.giftNifty ?? prev.giftNifty,
      optionChain: update.optionChain ?? prev.optionChain,
      signals: update.signals?.length ? update.signals : prev.signals,
      oiPattern: update.oiPattern ?? prev.oiPattern,
      tradeSetup: update.tradeSetup ?? prev.tradeSetup,
      isMarketOpen: update.isMarketOpen ?? prev.isMarketOpen,
      lastUpdate: update.timestamp ?? prev.lastUpdate,
      isLoading: false,
      error: null,
    }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to market data stream');
        reconnectCountRef.current = 0;
        setState(prev => ({ ...prev, isConnected: true, error: null, reconnectCount: 0 }));

        // Request initial snapshot immediately on connect
        ws.send(JSON.stringify({ type: 'REQUEST_SNAPSHOT' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MarketUpdate;

          if (data.type === 'CONNECTED') {
            console.log('[WS] Server acknowledged connection');
            return;
          }

          if (data.type === 'PONG') return;

          if (data.type === 'MARKET_UPDATE' || data.type === 'SNAPSHOT') {
            updateState(data);
          }
        } catch (e) {
          console.error('[WS] Message parse error:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] WebSocket error:', err);
        setState(prev => ({ ...prev, isConnected: false, error: 'Connection error' }));
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isConnected: false }));
        wsRef.current = null;

        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30000);
        reconnectCountRef.current += 1;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);

        setState(prev => ({ ...prev, reconnectCount: reconnectCountRef.current }));

        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      console.error('[WS] Connection failed, falling back to HTTP polling');
      startHTTPPolling();
    }
  }, [updateState]);

  // ── HTTP Polling Fallback ──────────────────────────────────────────────────
  // Used when WebSocket is unavailable (e.g., behind a proxy)
  const startHTTPPolling = useCallback(() => {
    async function poll() {
      try {
        const [priceRes, ocRes, signalsRes] = await Promise.all([
          fetch(`${API_URL}/market/snapshot`),
          fetch(`${API_URL}/option-chain/latest`),
          fetch(`${API_URL}/signals/current`),
        ]);

        const [priceData, ocData, signalsData] = await Promise.all([
          priceRes.json(),
          ocRes.json(),
          signalsRes.json(),
        ]);

        updateState({
          price: priceData.data?.nifty,
          giftNifty: priceData.data?.giftNifty,
          isMarketOpen: priceData.data?.isMarketOpen,
          optionChain: ocData.data,
          signals: signalsData.data?.signals || [],
          timestamp: new Date().toISOString(),
          type: 'MARKET_UPDATE',
        });
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to fetch market data', isLoading: false }));
      }
    }

    poll();
    const interval = setInterval(poll, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [updateState]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    ...state,
    // Expose reconnect for manual retry button
    reconnect: connect,
  };
}
