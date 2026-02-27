/**
 * WebSocket Server Service
 * 
 * Manages WebSocket connections and broadcasts real-time market data
 * to all connected frontend clients.
 */

const WebSocket = require('ws');

let wss = null;
let clientCount = 0;

/**
 * Initialize WebSocket server attached to existing HTTP server.
 * This allows ws:// on the same port as HTTP (no extra port needed).
 */
function initWebSocketServer(server) {
  wss = new WebSocket.Server({
    server,
    path: '/ws',
    // Keep connection alive with pings every 30s
    perMessageDeflate: {
      zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
      threshold: 1024,
    },
  });

  wss.on('connection', (ws, req) => {
    clientCount++;
    const clientId = Date.now();
    const clientIp = req.socket.remoteAddress;

    console.log(`[WS] Client connected: ${clientIp} (total: ${clientCount})`);

    // Send welcome message with current state
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'Connected to Nifty Options Intelligence Dashboard',
      clientId,
      timestamp: new Date().toISOString(),
    }));

    // Heartbeat ping to detect dead connections
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Handle incoming messages from client
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch (e) {
        console.warn('[WS] Invalid message from client:', e.message);
      }
    });

    ws.on('close', () => {
      clientCount = Math.max(0, clientCount - 1);
      console.log(`[WS] Client disconnected (total: ${clientCount})`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  // Ping all clients every 30 seconds to keep connections alive
  const pingInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  console.log(`[WS] WebSocket server initialized on /ws`);
  return wss;
}

/**
 * Handle messages received from connected clients.
 * Clients can request specific data or subscribe to channels.
 */
function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      break;

    case 'REQUEST_SNAPSHOT':
      // Client wants latest data immediately (on page load)
      const { getCachedData } = require('./dataFetcher');
      const data = getCachedData();
      ws.send(JSON.stringify({
        type: 'SNAPSHOT',
        ...data,
        timestamp: new Date().toISOString(),
      }));
      break;

    default:
      console.log('[WS] Unknown message type:', msg.type);
  }
}

/**
 * Broadcast data to ALL connected WebSocket clients.
 * Called by the data fetcher every 10 seconds.
 */
function broadcastToClients(data) {
  if (!wss || wss.clients.size === 0) return;

  const payload = JSON.stringify(data);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  if (sent > 0) {
    console.log(`[WS] Broadcasted to ${sent} client(s) at ${new Date().toLocaleTimeString()}`);
  }
}

/**
 * Get current WebSocket connection count.
 */
function getClientCount() {
  return clientCount;
}

module.exports = { initWebSocketServer, broadcastToClients, getClientCount };
