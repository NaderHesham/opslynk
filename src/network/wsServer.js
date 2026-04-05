// network/wsServer.js
// WebSocket server + outbound peer connections + P2P message router

const http      = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// These are injected via init() so wsServer has no circular dependency on main
let _peers            = null;   // Map<id, peer>
let _myProfile        = null;
let _myPortRef        = null;   // { value: number }  — writable ref
let _onMessage        = null;   // callback(ws, msg, remoteIp)
let _onPeerOnline     = null;   // callback(peer)
let _onPeerOffline    = null;   // callback(peerId)
let _getPendingMsgs   = null;   // (peerId) => []
let _clearPendingMsgs = null;   // (peerId) => void
let _hasAdminAccess   = null;
let _flushHelpRequests = null;

let wsServer = null;

const CHAT_PORT_BASE = 45679;

// ── INIT ─────────────────────────────────────────────────────────────────────
function init(deps) {
  _peers             = deps.peers;
  _myProfile         = deps.myProfile;
  _myPortRef         = deps.myPortRef;
  _onMessage         = deps.onMessage;
  _onPeerOnline      = deps.onPeerOnline;
  _onPeerOffline     = deps.onPeerOffline;
  _getPendingMsgs    = deps.getPendingMsgs;
  _clearPendingMsgs  = deps.clearPendingMsgs;
  _hasAdminAccess    = deps.hasAdminAccess;
  _flushHelpRequests = deps.flushHelpRequests;
}

// ── SERVER ────────────────────────────────────────────────────────────────────
function startWsServer(port) {
  return new Promise(resolve => {
    const tryPort = p => {
      const server = http.createServer();
      const wss    = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });
      server.listen(p, '0.0.0.0', () => {
        _myPortRef.value = p;
        wsServer         = wss;
        wss.on('connection', handleIncomingWS);
        resolve(p);
      });
      server.on('error', () => tryPort(p + 1));
    };
    tryPort(port);
  });
}

function handleIncomingWS(ws, req) {
  ws.on('message', raw => {
    try { _onMessage(ws, JSON.parse(raw), req.socket.remoteAddress); } catch (e) { console.error('ws parse err', e.message); }
  });
  ws.on('close', () => {
    for (const [id, peer] of _peers) {
      if (peer.ws === ws) {
        peer.ws     = null;
        peer.online = false;
        _onPeerOffline(id);
        break;
      }
    }
  });
}

// ── OUTBOUND CONNECTION ───────────────────────────────────────────────────────
function connectToPeer(peer) {
  if (peer.ws && (peer.ws.readyState === WebSocket.OPEN || peer.ws.readyState === WebSocket.CONNECTING)) return;
  const ws = new WebSocket(`ws://${peer.ip}:${peer.port}`, { maxPayload: 50 * 1024 * 1024 });

  ws.on('open', () => {
    peer.ws       = ws;
    peer.online   = true;
    peer.lastSeen = Date.now();
    ws.send(JSON.stringify({ type: 'hello', from: { ..._myProfile(), port: _myPortRef.value } }));

    // flush queued messages
    const queued = _getPendingMsgs(peer.id);
    queued.forEach(m => safeSend(ws, m));
    _clearPendingMsgs(peer.id);

    _onPeerOnline(peer);
    if (_hasAdminAccess(peer.role)) _flushHelpRequests(peer.id);
  });

  ws.on('message', raw => {
    try { _onMessage(ws, JSON.parse(raw), peer.ip); } catch {}
  });
  ws.on('close', () => {
    peer.ws     = null;
    peer.online = false;
    _onPeerOffline(peer.id);
  });
  ws.on('error', () => {});
}

// ── SEND HELPERS ──────────────────────────────────────────────────────────────
function safeSend(ws, data) {
  if (!data.msgId) data.msgId = uuidv4();
  try {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
  } catch {}
  return false;
}

function sendToPeer(peerId, data, queueOnFail) {
  const p = _peers.get(peerId);
  if (!p) return false;
  if (p.ws?.readyState === WebSocket.OPEN) {
    p.ws.send(JSON.stringify(data));
    return true;
  }
  if (queueOnFail) queueOnFail(peerId, data);
  connectToPeer(p);
  return true;
}

function broadcastToPeers(data, excludeId = null) {
  for (const [id] of _peers) {
    if (id !== excludeId) sendToPeer(id, data);
  }
}

function broadcastToSelectedPeers(targetPeerIds, data) {
  const ids = Array.isArray(targetPeerIds) && targetPeerIds.length
    ? [...new Set(targetPeerIds)]
    : [..._peers.keys()];
  for (const id of ids) sendToPeer(id, data);
}

module.exports = {
  CHAT_PORT_BASE,
  init,
  startWsServer,
  connectToPeer,
  safeSend,
  sendToPeer,
  broadcastToPeers,
  broadcastToSelectedPeers
};
