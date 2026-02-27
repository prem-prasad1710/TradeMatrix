/**
 * NiftyChart — TradingView Lightweight Charts v4
 * Professional candlestick chart: native OHLC, volume histogram,
 * EMA 9/21, Bollinger Bands, RSI subplot (synced), drawn horizontal levels,
 * VWAP / Pivot / OI-wall price lines. All reactive to live data.
 */
'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type CandlestickData,
  type LineData,
  type HistogramData,
} from 'lightweight-charts';
import { TrendingUp, Minus, Trash2 } from 'lucide-react';
import { formatPrice } from '../lib/formatters';
import type { NiftyPrice, OptionChain } from '@/types';

/* ─── indicator meta ─────────────────────────────────────────────── */
type IndKey = 'ema9' | 'ema21' | 'bb' | 'rsi' | 'volume';
const IND_META: Record<IndKey, { label: string; color: string }> = {
  ema9:   { label: 'EMA 9',  color: '#f59e0b' },
  ema21:  { label: 'EMA 21', color: '#c084fc' },
  bb:     { label: 'BB',     color: '#22d3ee' },
  rsi:    { label: 'RSI',    color: '#f472b6' },
  volume: { label: 'Vol',    color: '#475569'  },
};

const DRAW_COLORS = ['#facc15', '#34d399', '#f87171', '#60a5fa', '#e879f9'];
let lineSeq = 0;

/* ─── math helpers ───────────────────────────────────────────────── */
function calcEMA(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let ema: number | null = null;
  for (const v of data) {
    ema = ema === null ? v : v * k + ema * (1 - k);
    out.push(+ema.toFixed(2));
  }
  return out;
}

function calcBB(closes: number[], period = 20, mult = 2) {
  const mid: (number | null)[] = [], up: (number | null)[] = [], dn: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { mid.push(null); up.push(null); dn.push(null); continue; }
    const sl = closes.slice(i - period + 1, i + 1);
    const sma = sl.reduce((a, b) => a + b, 0) / period;
    const sd  = Math.sqrt(sl.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
    mid.push(+sma.toFixed(2));
    up.push(+(sma + mult * sd).toFixed(2));
    dn.push(+(sma - mult * sd).toFixed(2));
  }
  return { mid, up, dn };
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  if (closes.length < period + 1) return new Array(closes.length).fill(null);
  const out: (number | null)[] = new Array(period).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    ag += d > 0 ? d : 0; al += d < 0 ? -d : 0;
  }
  ag /= period; al /= period;
  out.push(al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out.push(al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2));
  }
  return out;
}

function toLineData(vals: (number | null)[], times: UTCTimestamp[]): LineData[] {
  return vals
    .map((v, i) => (v != null ? { time: times[i], value: v } : null))
    .filter(Boolean) as LineData[];
}

/* ─── chart theme ────────────────────────────────────────────────── */
const C = {
  bg:        '#060b14',
  grid:      '#0d1929',
  border:    '#1a2744',
  text:      '#3d5270',
  crosshair: '#334155',
  label:     '#1e3352',
};

interface Props {
  priceData: NiftyPrice | null;
  optionChain: OptionChain | null;
}

interface DrawnLevel { id: number; price: number; color: string; priceLine: IPriceLine; }

/* ─── component ──────────────────────────────────────────────────── */
export default function NiftyChart({ priceData, optionChain }: Props) {
  const mainRef  = useRef<HTMLDivElement>(null);
  const rsiRef   = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChart = useRef<IChartApi | null>(null);

  const candleS  = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volS     = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9S    = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21S   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpS    = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMidS   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbDnS    = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiS     = useRef<ISeriesApi<'Line'> | null>(null);

  const refLines     = useRef<IPriceLine[]>([]);
  const drawnLevels  = useRef<DrawnLevel[]>([]);
  const drawModeRef  = useRef(false);
  const colorIdxRef  = useRef(0);

  const [ind, setInd] = useState<Record<IndKey, boolean>>({
    ema9: true, ema21: true, bb: false, rsi: false, volume: true,
  });
  const [drawMode, setDrawMode]     = useState(false);
  const [colorIdx, setColorIdx]     = useState(0);
  const [drawnCount, setDrawnCount] = useState(0);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { colorIdxRef.current = colorIdx; }, [colorIdx]);

  /* ── create charts once on mount ────────────────────────────── */
  // useLayoutEffect fires synchronously after DOM mutations, guaranteeing
  // clientWidth/clientHeight are non-zero before createChart() is called.
  useLayoutEffect(() => {
    if (!mainRef.current) return;

    const baseOpts = {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: C.label },
        horzLine: { color: C.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: C.label },
      },
      rightPriceScale: {
        borderColor: C.border, textColor: C.text,
        scaleMargins: { top: 0.06, bottom: 0.1 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: UTCTimestamp) =>
          new Date(t * 1000).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
          }),
      },
    };

    // clientWidth may be 0 on first paint in some SSR hydration scenarios
    // fall back to offsetWidth, then a safe default of 800
    const chartW = mainRef.current.clientWidth || mainRef.current.offsetWidth || 800;
    const chart = createChart(mainRef.current, {
      ...baseOpts,
      width:  chartW,
      height: 380,   // matches the explicit style on the wrapper div
    });
    chartRef.current = chart;

    /* candlestick series */
    const cs = chart.addCandlestickSeries({
      upColor: '#00d264', downColor: '#ff3d5a',
      borderUpColor: '#00d264', borderDownColor: '#ff3d5a',
      wickUpColor: '#22d264',   wickDownColor: '#ff5070',
    });
    candleS.current = cs;

    /* volume histogram */
    const vs = chart.addHistogramSeries({
      color: '#475569', priceFormat: { type: 'volume' }, priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    volS.current = vs;

    /* EMA lines */
    const lo = { crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false };
    ema9S.current  = chart.addLineSeries({ ...lo, color: '#f59e0b', lineWidth: 1 });
    ema21S.current = chart.addLineSeries({ ...lo, color: '#c084fc', lineWidth: 1 });

    /* Bollinger Bands */
    const bbo = { ...lo, color: '#22d3ee', lineWidth: 1 as const, lineStyle: LineStyle.Dashed };
    bbUpS.current  = chart.addLineSeries(bbo);
    bbMidS.current = chart.addLineSeries({ ...bbo, color: '#22d3ee55' });
    bbDnS.current  = chart.addLineSeries(bbo);

    /* draw level on click */
    chart.subscribeClick((param) => {
      if (!drawModeRef.current || !param.point) return;
      const px = candleS.current?.coordinateToPrice(param.point.y);
      if (px == null) return;
      const snapped = Math.round(px / 50) * 50;
      const color   = DRAW_COLORS[colorIdxRef.current % DRAW_COLORS.length];
      const pl = candleS.current!.createPriceLine({
        price: snapped, color, lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: `${snapped}`,
      });
      drawnLevels.current = [...drawnLevels.current, { id: ++lineSeq, price: snapped, color, priceLine: pl }];
      setDrawnCount(n => n + 1);
      setColorIdx(n => n + 1);
    });

    /* RSI sub-chart */
    if (rsiRef.current) {
      const rsiW = rsiRef.current.clientWidth || rsiRef.current.offsetWidth || 800;
      const rc = createChart(rsiRef.current, {
        ...baseOpts,
        width:  rsiW,
        height: 88,
        timeScale: { ...baseOpts.timeScale, visible: false },
      });
      rsiChart.current = rc;

      rsiS.current = rc.addLineSeries({
        color: '#f472b6', lineWidth: 1,
        crosshairMarkerVisible: true, priceLineVisible: false, lastValueVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 5, below: 5 },
        }),
      });
      rsiS.current.createPriceLine({ price: 70, color: '#ef444460', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '70' });
      rsiS.current.createPriceLine({ price: 30, color: '#22c55e60', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '30' });
      rsiS.current.createPriceLine({ price: 50, color: '#33415540', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });

      /* sync timescales */
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) rc.timeScale().setVisibleLogicalRange(range);
      });
      rc.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    /* resize observer */
    const ro = new ResizeObserver(() => {
      if (mainRef.current) chart.applyOptions({ width: mainRef.current.clientWidth || mainRef.current.offsetWidth });
      if (rsiRef.current && rsiChart.current)
        rsiChart.current.applyOptions({ width: rsiRef.current.clientWidth || rsiRef.current.offsetWidth });
    });
    if (mainRef.current) ro.observe(mainRef.current);
    if (rsiRef.current)  ro.observe(rsiRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      rsiChart.current?.remove();
      chartRef.current = null;
      rsiChart.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── update series when priceData / optionChain / ind change ── */
  useEffect(() => {
    if (!priceData || !candleS.current || !chartRef.current) return;

    const raw    = (priceData.candles ?? []).filter(c => c.open > 0 && c.close > 0).slice(-100);
    const times  = raw.map(c => Math.floor(c.time / 1000) as UTCTimestamp);
    const closes = raw.map(c => c.close);

    /* candles */
    const tvC: CandlestickData[] = raw.map(c => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleS.current.setData(tvC);

    /* volume */
    if (volS.current) {
      const vd: HistogramData[] = raw.map(c => ({
        time:  Math.floor(c.time / 1000) as UTCTimestamp,
        value: (c as any).volume ?? 0,
        color: c.close >= c.open ? '#00d26440' : '#ff3d5a40',
      }));
      volS.current.setData(vd);
      volS.current.applyOptions({ visible: ind.volume });
    }

    /* EMA 9 */
    if (ema9S.current) {
      ema9S.current.setData(toLineData(calcEMA(closes, 9), times));
      ema9S.current.applyOptions({ visible: ind.ema9 });
    }
    /* EMA 21 */
    if (ema21S.current) {
      ema21S.current.setData(toLineData(calcEMA(closes, 21), times));
      ema21S.current.applyOptions({ visible: ind.ema21 });
    }
    /* Bollinger Bands */
    if (bbUpS.current && bbMidS.current && bbDnS.current) {
      const bb = calcBB(closes);
      bbUpS.current.setData(toLineData(bb.up, times));
      bbMidS.current.setData(toLineData(bb.mid, times));
      bbDnS.current.setData(toLineData(bb.dn, times));
      [bbUpS, bbMidS, bbDnS].forEach(s => s.current?.applyOptions({ visible: ind.bb }));
    }
    /* RSI */
    if (rsiS.current) {
      rsiS.current.setData(toLineData(calcRSI(closes), times));
    }

    /* ── VWAP / Pivot / OI Wall price lines ── */
    refLines.current.forEach(pl => { try { candleS.current?.removePriceLine(pl); } catch (_) {} });
    refLines.current = [];

    const addLine = (
      price: number | null | undefined,
      color: string,
      title: string,
      dash: LineStyle = LineStyle.Dashed,
    ) => {
      if (!price || price <= 0 || !candleS.current) return;
      const pl = candleS.current.createPriceLine({
        price, color, lineWidth: 1, lineStyle: dash, axisLabelVisible: true, title,
      });
      refLines.current.push(pl);
    };

    addLine(priceData.vwap,       '#f59e0b', 'VWAP');
    addLine(priceData.pivots?.PP, '#818cf8', 'PP');
    addLine(priceData.pivots?.R1, '#fca5a5', 'R1');
    addLine(priceData.pivots?.R2, '#f87171', 'R2');
    addLine(priceData.pivots?.S1, '#86efac', 'S1');
    addLine(priceData.pivots?.S2, '#4ade80', 'S2');
    addLine(optionChain?.highestCallStrike, '#ef4444', 'Call Wall', LineStyle.LargeDashed);
    addLine(optionChain?.highestPutStrike,  '#22c55e', 'Put Wall',  LineStyle.LargeDashed);

    chartRef.current.timeScale().fitContent();
  }, [priceData, optionChain, ind]);

  /* ── clear user-drawn levels ─────────────────────────────────── */
  const clearLevels = useCallback(() => {
    drawnLevels.current.forEach(l => {
      try { candleS.current?.removePriceLine(l.priceLine); } catch (_) {}
    });
    drawnLevels.current = [];
    setDrawnCount(0);
  }, []);

  /* ── empty state ─────────────────────────────────────────────── */
  const hasData = !!(priceData && priceData.candles?.length);

  // NOTE: we always render the chart divs so mainRef is never null on mount.
  // The loading overlay sits on top and is removed once data arrives.

  const bull0  = priceData && priceData.change >= 0;
  const ltpCol = bull0 ? '#00d264' : '#ff3d5a';

  return (
    <div className="bg-[#060b14] rounded-xl border border-[#1a2744] overflow-hidden flex flex-col shadow-2xl">

      {/* ── toolbar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2 flex-shrink-0 border-b border-[#111e38]">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-[11px] font-bold text-slate-200 tracking-wider uppercase">
            NIFTY 50 · 5M
          </span>
          {(priceData as any)?.isMock && (
            <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-semibold">
              SIMULATED
            </span>
          )}
          <span className="flex items-center gap-1 text-[9px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
          {hasData && priceData && (
            <>
              <span className="ml-2 font-mono text-sm font-bold" style={{ color: ltpCol }}>
                {formatPrice(priceData.price)}
              </span>
              <span className="text-[10px] font-mono" style={{ color: ltpCol }}>
                {bull0 ? '+' : ''}{priceData.change.toFixed(0)}&nbsp;({bull0 ? '+' : ''}{priceData.changePct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(Object.entries(IND_META) as [IndKey, { label: string; color: string }][]).map(([k, m]) => (
            <button
              key={k}
              onClick={() => setInd(prev => ({ ...prev, [k]: !prev[k] }))}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                ind[k]
                  ? 'border-transparent text-black'
                  : 'border-[#1e2d4a] text-slate-500 bg-transparent hover:text-slate-300'
              }`}
              style={ind[k] ? { background: m.color } : {}}
            >
              {m.label}
            </button>
          ))}

          <button
            onClick={() => setDrawMode(d => !d)}
            title="Draw horizontal level — snaps to ×50"
            className={`ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
              drawMode
                ? 'bg-yellow-400 text-black border-transparent'
                : 'border-[#1e2d4a] text-slate-500 hover:text-slate-300'
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>

          {drawnCount > 0 && (
            <button
              onClick={clearLevels}
              title="Clear drawn levels"
              className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {drawMode && (
        <div className="text-center text-[9px] text-yellow-400/70 py-0.5 bg-yellow-400/5 border-b border-yellow-400/10 animate-pulse flex-shrink-0">
          ✏ Click to place level (snaps ×50) · Drag to pan · Scroll to zoom
        </div>
      )}

      {/* ── TradingView main chart + loading overlay ──────────── */}
      <div className="relative w-full flex-shrink-0">
        {/* chart target div — explicit 380px height so clientHeight is always correct */}
        <div
          ref={mainRef}
          className="w-full"
          style={{ height: 380, cursor: drawMode ? 'crosshair' : 'default' }}
        />
        {/* Loading overlay sits on top until first candle data arrives */}
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#060b14] z-10" style={{ height: 380 }}>
            <TrendingUp className="w-10 h-10 text-blue-400 opacity-25" />
            <p className="text-slate-500 text-sm">Connecting to market data…</p>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* ── RSI subplot (rendered only when enabled) ──────────── */}
      {ind.rsi && (
        <div className="border-t border-[#111e38] relative flex-shrink-0">
          <span className="absolute top-1 left-2 text-[9px] text-pink-400/60 font-mono z-10 pointer-events-none select-none">
            RSI (14)
          </span>
          <div ref={rsiRef} className="w-full" style={{ height: 88 }} />
        </div>
      )}

      {/* ── OHLC day summary footer ───────────────────────────── */}
      <div className="grid grid-cols-5 border-t border-[#111e38] text-[10px] flex-shrink-0">
        {([
          { label: 'OPEN',       val: priceData?.open,      color: '#cbd5e1' },
          { label: 'HIGH',       val: priceData?.high,      color: '#22c55e' },
          { label: 'LOW',        val: priceData?.low,       color: '#ef4444' },
          { label: 'PREV CLOSE', val: priceData?.prevClose, color: '#94a3b8' },
          { label: 'LTP',        val: priceData?.price,     color: ltpCol ?? '#cbd5e1' },
        ] as const).map(({ label, val, color }) => (
          <div key={label} className="flex flex-col items-center py-2 border-r border-[#111e38] last:border-0">
            <span className="text-slate-600 mb-0.5">{label}</span>
            <span className="font-mono font-semibold" style={{ color }}>{val != null ? formatPrice(val) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

