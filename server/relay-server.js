'use strict';

const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_FRAME = 256; // Gravel packets are ~48 bytes including id/timestamp.

const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: 1024 });
const clients = new Map(); // ws -> { id, seed, lastFrame, lastSeen }

function roomPeers(seed, except) {
  const out = [];
  for (const [ws, c] of clients) {
    if (ws !== except && c.seed === seed && c.id) out.push(c);
  }
  return out;
}

function sendJSON(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function leave(ws) {
  const c = clients.get(ws);
  if (!c) return;
  clients.delete(ws);
  if (!c.id || c.seed === null) return;
  const msg = JSON.stringify({ kind: 'bye', id: c.id });
  for (const [other, o] of clients) {
    if (o.seed === c.seed && other.readyState === WebSocket.OPEN) other.send(msg);
  }
}

wss.on('connection', ws => {
  const state = { id: null, seed: null, lastFrame: null, lastSeen: Date.now(), alive: true };
  clients.set(ws, state);

  ws.on('pong', () => { state.alive = true; state.lastSeen = Date.now(); });

  ws.on('message', (data, isBinary) => {
    state.lastSeen = Date.now();

    if (!isBinary) {
      let msg;
      try { msg = JSON.parse(data.toString()); }
      catch (_) { return sendJSON(ws, { kind: 'error', message: 'invalid hello' }); }

      if (msg.kind !== 'hello') return;
      const id = String(msg.id || '').slice(0, 48);
      const seed = Number(msg.seed);
      if (!id || !Number.isFinite(seed)) {
        return sendJSON(ws, { kind: 'error', message: 'invalid room' });
      }

      state.id = id;
      state.seed = seed | 0;
      sendJSON(ws, { kind: 'ready', id, seed: state.seed });

      // Prime a new joiner with the most recent snapshot from riders already in
      // the room. That makes existing bikes appear immediately instead of
      // waiting for their next 15 Hz update.
      for (const peer of roomPeers(state.seed, ws)) {
        if (peer.lastFrame && ws.readyState === WebSocket.OPEN) ws.send(peer.lastFrame);
      }
      return;
    }

    if (!state.id || state.seed === null) return;
    if (data.length < 1 || data.length > MAX_FRAME) return;

    // The browser already prefixes each binary frame with its rider id and
    // timestamp. The relay intentionally stays dumb and just scopes it to seed.
    const frame = Buffer.from(data);
    state.lastFrame = frame;
    for (const [other, o] of clients) {
      if (other === ws || o.seed !== state.seed) continue;
      if (other.readyState === WebSocket.OPEN) other.send(frame);
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

const heartbeat = setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) {
      try { ws.terminate(); } catch (_) {}
      leave(ws);
      continue;
    }
    c.alive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 15000);

wss.on('close', () => clearInterval(heartbeat));
console.log(`Gravel relay listening on ws://${HOST}:${PORT}`);
