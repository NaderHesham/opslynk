// network/wsServer.js
// WebSocket server + outbound peer connections + P2P message router
// All messages are AES-256-GCM encrypted after ECDH key exchange.

const http      = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { generateKeyPair, deriveSharedKey, encrypt, decrypt } = require('../services/encryptionService');

// These are injected via init() so wsServer has no circular dependency on main
let _peers            = null;
let _myProfile        = null;
let _myPortRef        = null;
let _onMessage        = null;
let _onPeerOnline     = null;
let _onPeerOffline    = null;
let _getPendingMsgs   = null;
let _clearPendingMsgs = null;
let _hasAdminAccess   = null;
let _flushHelpRequests = null;

let wsServer = null;

// Per-socket encryption state
const sessionKeys  = new Map(); // ws → Buffer (32-byte AES key)
const pendingECDH  = new Map(); // ws → ECDH object (during handshake)

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
      server.once('error', () => tryPort(p + 1));
      server.listen(p, '0.0.0.0', () => {
        _myPortRef.value = p;
        wsServer         = wss;
        wss.on('connection', handleIncomingWS);
        resolve(p);
      });
    };
    tryPort(port);
  });
}

function cleanupSocket(ws) {
  sessionKeys.delete(ws);
  pendingECDH.delete(ws);
}

function handleIncomingWS(ws, req) {
  const remoteIp = req.socket.remoteAddress;

  const markOffline = () => {
    cleanupSocket(ws);
    for (const [id, peer] of _peers) {
      if (peer.ws !== ws) continue;
      peer.ws = null;
      peer.online = false;
      _onPeerOffline(id);
      break;
    }
  };

  // Respond to ECDH key-exchange from the connector
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);

      // Key-exchange: initiator sends { _kx: pubKeyHex }
      if (msg._kx && !sessionKeys.has(ws)) {
        const ecdh      = generateKeyPair();
        const sharedKey = deriveSharedKey(ecdh, msg._kx);
        sessionKeys.set(ws, sharedKey);
        // Reply with our pubkey (plain — handshake is before encryption)
        ws.send(JSON.stringify({ _kx: ecdh.getPublicKey('hex') }));
        return;
      }

      // Encrypted envelope
      if (msg._e) {
        const key = sessionKeys.get(ws);
        if (!key) return; // no key yet — drop
        const decrypted = decrypt(key, msg._e);
        _onMessage(ws, decrypted, remoteIp);
        return;
      }

      // Fallback: plaintext (should not happen in normal operation)
      _onMessage(ws, msg, remoteIp);
    } catch (e) { console.error('[ws] parse/decrypt err', e.message); }
  });

  ws.on('close', markOffline);
  ws.on('error', markOffline);
}

// ── OUTBOUND CONNECTION ───────────────────────────────────────────────────────
function connectToPeer(peer) {
  if (peer.ws && (peer.ws.readyState === WebSocket.OPEN || peer.ws.readyState === WebSocket.CONNECTING)) return;
  const ws = new WebSocket(`ws://${peer.ip}:${peer.port}`, { maxPayload: 50 * 1024 * 1024 });

  const markOffline = () => {
    cleanupSocket(ws);
    if (peer.ws !== ws) return;
    peer.ws = null;
    peer.online = false;
    _onPeerOffline(peer.id);
  };

  ws.on('open', () => {
    peer.ws       = ws;
    peer.lastSeen = Date.now();

    // Initiate ECDH: generate our keypair, send pubkey
    const ecdh = generateKeyPair();
    pendingECDH.set(ws, ecdh);
    ws.send(JSON.stringify({ _kx: ecdh.getPublicKey('hex') }));
    // hello + queued messages sent after key exchange completes (in 'message' handler below)
  });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);

      // Key-exchange response: remote sends back their pubkey
      if (msg._kx && pendingECDH.has(ws)) {
        const ecdh      = pendingECDH.get(ws);
        const sharedKey = deriveSharedKey(ecdh, msg._kx);
        sessionKeys.set(ws, sharedKey);
        pendingECDH.delete(ws);

        // Now encryption is ready — send hello + queued messages
        peer.online = true;
        encryptSend(ws, { type: 'hello', from: { ..._myProfile(), port: _myPortRef.value } });
        const queued = _getPendingMsgs(peer.id);
        queued.forEach(m => encryptSend(ws, m));
        _clearPendingMsgs(peer.id);
        _onPeerOnline(peer);
        if (_hasAdminAccess(peer.role)) _flushHelpRequests(peer.id);
        return;
      }

      // Encrypted envelope
      if (msg._e) {
        const key = sessionKeys.get(ws);
        if (!key) return;
        const decrypted = decrypt(key, msg._e);
        _onMessage(ws, decrypted, peer.ip);
        return;
      }

      // Fallback plaintext
      _onMessage(ws, msg, peer.ip);
    } catch {}
  });

  ws.on('close', markOffline);
  ws.on('error', markOffline);
}

// ── SEND HELPERS ──────────────────────────────────────────────────────────────
function encryptSend(ws, data) {
  if (!data.msgId) data.msgId = uuidv4();
  try {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    const key = sessionKeys.get(ws);
    if (key) {
      ws.send(JSON.stringify({ _e: encrypt(key, data) }));
    } else {
      // No session key yet (e.g. key-exchange in progress) — send plaintext as fallback
      ws.send(JSON.stringify(data));
    }
    return true;
  } catch {}
  return false;
}

function safeSend(ws, data) {
  return encryptSend(ws, data);
}

function sendToPeer(peerId, data, queueOnFail) {
  const p = _peers.get(peerId);
  if (!p) return false;
  if (p.ws?.readyState === WebSocket.OPEN) {
    encryptSend(p.ws, data);
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
