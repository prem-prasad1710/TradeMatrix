# 📊 Nifty Options Intelligence Dashboard

> A production-ready real-time dashboard for analyzing NIFTY 50 options data, open interest dynamics, support/resistance levels, and market sentiment — built for intraday prop traders.

![Dashboard Preview](https://img.shields.io/badge/Status-Production%20Ready-00d264?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square)

---

## ✨ Features

### 📈 Real-Time Data
- **NSE Option Chain** fetched every 10 seconds with anti-bot header handling
- **NIFTY spot price** via Yahoo Finance (free, no auth required)
- **WebSocket** broadcast to all connected clients simultaneously
- **Automatic reconnection** with exponential backoff

### 🧮 OI Analytics Engine
| Metric | Description |
|--------|-------------|
| **PCR** | Put/Call Ratio — key sentiment indicator |
| **Max Pain** | Strike where option buyers lose the most |
| **Call Wall** | Highest Call OI = key resistance level |
| **Put Wall** | Highest Put OI = key support level |
| **OI Change** | Track fresh positions vs position exits |
| **Buildup Detection** | Long Buildup / Short Buildup / Short Covering / Long Unwinding |

### 🎯 Signal Engine
Generates actionable signals based on multi-factor analysis:
- 🟢 **Bullish Momentum** — Price above VWAP + PCR > 1.0 + above prev close
- 🔴 **Bearish Momentum** — Price below VWAP + PCR < 0.7 + below prev close
- 🚀 **Possible Breakout** — Price breaking above Call Wall
- ⬇️ **Possible Breakdown** — Price breaking below Put Wall
- ⚡ **Short Covering** — Put OI unwinding + price rally
- 📈 **Long Buildup** — Fresh call OI accumulating
- ↔️ **Range Market** — Price near VWAP, neutral PCR

### 📊 Dashboard Panels
1. **NIFTY Chart** — 5-minute candlestick + VWAP line + S/R overlays
2. **Option Chain Heatmap** — Strike-by-strike OI visualization with heat bars
3. **OI Summary** — PCR gauge, max pain, call/put walls, level display
4. **Signals Panel** — Live signals with confidence scores
5. **Momentum Detector** — Highlights high-activity strikes with buildup classification
6. **Support & Resistance** — Pivot points (PP, R1-R3, S1-S3) + OI-based walls

---

## 🏗️ Architecture

```
nifty-dashboard/
├── backend/                    # Node.js + Express
│   ├── server.js               # Main HTTP + WebSocket server
│   ├── services/
│   │   ├── dataFetcher.js      # NSE + Yahoo Finance polling (10s interval)
│   │   ├── database.js         # SQLite cache (better-sqlite3)
│   │   └── websocket.js        # WebSocket broadcast server
│   ├── routes/
│   │   ├── optionChain.js      # REST: /api/option-chain/*
│   │   ├── marketData.js       # REST: /api/market/*
│   │   └── signals.js          # REST: /api/signals/*
│   ├── signals/
│   │   └── signalEngine.js     # Signal generation rules
│   └── utils/
│       ├── oiParser.js         # NSE JSON parsing + OI analysis
│       └── technicals.js       # VWAP, pivot points, swing levels
│
└── frontend/                   # Next.js 14 (App Router)
    └── src/
        ├── app/
        │   ├── layout.tsx      # Root layout (dark theme)
        │   ├── page.tsx        # Main dashboard page
        │   └── globals.css     # Tailwind + dark theme
        ├── components/
        │   ├── Header.tsx              # Price header
        │   ├── NiftyChart.tsx          # Candlestick chart (Recharts)
        │   ├── OISummary.tsx           # PCR, max pain, OI walls
        │   ├── OptionChainHeatmap.tsx  # Strike OI table
        │   ├── SignalsPanel.tsx        # Trading signals
        │   ├── MomentumDetector.tsx    # Buildup detection
        │   └── SupportResistancePanel.tsx  # Pivot + OI levels
        ├── hooks/
        │   └── useMarketData.ts   # WebSocket + HTTP fallback hook
        ├── lib/
        │   ├── formatters.ts      # Number/price formatting utilities
        │   └── marketUtils.ts     # Sentiment analysis helpers
        └── types/
            └── index.ts           # TypeScript type definitions
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18.0.0
- **npm** ≥ 8.0.0

### 1. Clone & Install

```bash
# Clone the repository
git clone <your-repo-url>
cd nifty-dashboard

# Install all dependencies (backend + frontend)
npm install
npm run install:all
```

### 2. Configure Environment

**Backend:**
```bash
# Copy and edit environment file
cp backend/.env.example backend/.env
# Edit backend/.env if needed (defaults work for local dev)
```

**Frontend:**
```bash
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local if needed (defaults work for local dev)
```

### 3. Run in Development

```bash
# Run both backend and frontend simultaneously
npm run dev

# Or run separately:
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** The backend first visits NSE homepage to get session cookies, then starts fetching option chain data. Initial data may take 5-10 seconds to appear.

---

## 🔌 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/market/snapshot` | Full market snapshot |
| GET | `/api/market/candles` | OHLC candle data |
| GET | `/api/option-chain/latest` | Latest option chain |
| GET | `/api/option-chain/strikes` | ATM ±15 strikes |
| GET | `/api/option-chain/oi-summary` | PCR, max pain, walls |
| GET | `/api/signals/current` | Active trading signals |
| GET | `/api/signals/momentum` | Buildup detection data |
| GET | `/api/signals/support-resistance` | All S/R levels |

### WebSocket

Connect to `ws://localhost:3001/ws`

**Client → Server messages:**
```json
{ "type": "REQUEST_SNAPSHOT" }   // Request immediate data
{ "type": "PING" }               // Keepalive ping
```

**Server → Client messages:**
```json
{
  "type": "MARKET_UPDATE",
  "timestamp": "2024-01-15T09:30:00.000Z",
  "isMarketOpen": true,
  "price": { "price": 21500, "vwap": 21480, ... },
  "optionChain": { "pcr": 1.25, "maxPain": 21400, ... },
  "signals": [{ "type": "BULLISH_MOMENTUM", ... }]
}
```

---

## 📡 Data Sources

| Source | URL | Used For |
|--------|-----|----------|
| NSE India | `nseindia.com/api/option-chain-indices?symbol=NIFTY` | Option chain (OI, IV, LTP) |
| Yahoo Finance | `query1.finance.yahoo.com/v8/finance/chart/%5ENSEI` | NIFTY spot price + OHLC |

### NSE Anti-Bot Handling
NSE blocks direct API requests. The backend:
1. Visits `nseindia.com` homepage first to get session cookies
2. Passes those cookies + proper browser headers with every API request
3. Refreshes the session every 4 minutes automatically
4. Retries with fresh session on 401/403 errors

---

## 🚢 Deployment

### Frontend → Vercel (Free)
```bash
cd frontend
npm run build

# Deploy to Vercel:
npx vercel

# Set environment variable in Vercel dashboard:
# NEXT_PUBLIC_API_URL = https://your-backend.onrender.com/api
# NEXT_PUBLIC_WS_URL = wss://your-backend.onrender.com/ws
```

### Backend → Render (Free)
1. Push code to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables:
   ```
   FRONTEND_URL=https://your-vercel-app.vercel.app
   NODE_ENV=production
   PORT=3001
   ```
> **Note:** Render free tier spins down after 15 min of inactivity. Consider using a cron job to keep it awake.

### Alternative: Railway (Free Tier)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy backend
cd backend
railway login
railway new
railway up
```

---

## 🔧 Configuration

### Fetch Interval
Edit `backend/services/dataFetcher.js`:
```js
// Change from 10s to 5s (be mindful of NSE rate limits)
cron.schedule('*/5 * * * * *', fetchAndProcess);
```

### Signal Thresholds
Edit `backend/signals/signalEngine.js`:
```js
// Adjust PCR thresholds
const bullishScore = [
  vwapPos.position === 'ABOVE' ? 2 : 0,
  pcr > 1.2 ? 2 : (pcr > 1.0 ? 1 : 0),  // ← Adjust here
  ...
```

### OI Strike Display Range
Edit `frontend/src/components/OptionChainHeatmap.tsx`:
```ts
const range = showAll ? strikes.length : 12;  // ← Adjust default visible strikes
```

---

## ⚠️ Disclaimer

This dashboard is built for **analytical and educational purposes only**. It does not:
- Execute any trades automatically
- Provide investment advice
- Guarantee accuracy of data

Always verify data independently. Trading involves significant risk.

---

## 📋 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Next.js 14 (App Router) |
| UI Library | React 18 |
| Styling | TailwindCSS |
| Charts | Recharts |
| Icons | Lucide React |
| Backend | Node.js + Express |
| Real-time | WebSocket (ws) |
| Database | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| HTTP Client | Axios |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
