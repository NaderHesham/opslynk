// network/udpDiscovery.js
// UDP broadcast peer discovery — LAN only

const dgram = require('dgram');
const WebSocket = require('ws');
const { getLanInterfaces } = require('../system/systemInfo');

const DISCOVERY_PORT   = 45678;
const BROADCAST_ADDR   = '255.255.255.255';
const LOOPBACK_ADDR    = '127.0.0.1';
const ANNOUNCE_INTERVAL = 1000;
const PEER_TIMEOUT     = 4000;

let udpSocket    = null;
let _peers       = null;
let _myProfile   = null;
let _myPortRef   = null;
let _connectToPeer    = null;
let _onPeerOnline     = null;
let _onPeerOffline    = null;
let _broadcastToRenderer = null;

function init(deps) {
  _peers              = deps.peers;
  _myProfile          = deps.myProfile;       // getter fn
  _myPortRef          = deps.myPortRef;
  _connectToPeer      = deps.connectToPeer;
  _onPeerOnline       = deps.onPeerOnline;
  _onPeerOffline      = deps.onPeerOffline;
  _broadcastToRenderer = deps.broadcastToRenderer;
}

function startUdpDiscovery() {
  udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udpSocket.bind(DISCOVERY_PORT, () => {
    udpSocket.setBroadcast(true);
    announceMyself();
    setInterval(announceMyself,  ANNOUNCE_INTERVAL);
    setInterval(cleanStalePeers, 1000);
  });

  udpSocket.on('message', (msg, rinfo) => {
    try {
      const d = JSON.parse(msg.toString());
      if (d.type !== 'announce' || d.id === _myProfile().id) return;

      let peer   = _peers.get(d.id);
      const isNew = !peer;

      if (!peer) {
        peer = {
          id      : d.id,
          username: d.username,
          role    : d.role,
          deviceId: d.deviceId || d.id,
          publicKey: d.publicKey || '',
          identityFingerprint: d.identityFingerprint || '',
          color   : d.color,
          title   : d.title,
          systemInfo: d.systemInfo || null,
          ip      : rinfo.address,
          port    : d.port,
          ws      : null,
          connectionState: 'discovering',
          identityVerified: false,
          identityRejected: false,
          online  : false,
          lastSeen: Date.now()
        };
        _peers.set(d.id, peer);
      } else {
        peer.lastSeen = Date.now();
        Object.assign(peer, {
          username  : d.username,
          role      : d.role,
          deviceId  : d.deviceId || d.id,
          publicKey : d.publicKey || peer.publicKey || '',
          identityFingerprint: d.identityFingerprint || peer.identityFingerprint || '',
          color     : d.color,
          title     : d.title,
          systemInfo: d.systemInfo || peer.systemInfo || null,
          ip        : rinfo.address,
          port      : d.port
        });
        if (!peer.online && peer.connectionState !== 'handshaking') {
          peer.connectionState = 'discovering';
        }
      }

      if (isNew || !peer.online) _connectToPeer(peer);
    } catch {}
  });
}

function announceMyself() {
  const profile = _myProfile();
  const msg = Buffer.from(JSON.stringify({
    type      : 'announce',
    id        : profile.id,
    deviceId  : profile.deviceId || profile.id,
    username  : profile.username,
    role      : profile.role,
    publicKey : profile.publicKey || '',
    identityFingerprint: profile.identityFingerprint || '',
    color     : profile.color,
    title     : profile.title,
    port      : _myPortRef.value,
    systemInfo: profile.systemInfo || null
  }));

  const ifaces = getLanInterfaces();
  for (const addr of ifaces) {
    const octets = String(addr.address || '').split('.');
    if (octets.length !== 4) continue;
    const bcast = octets.slice(0, 3).join('.') + '.255';
    try { udpSocket.send(msg, DISCOVERY_PORT, bcast); } catch {}
  }
  try { udpSocket.send(msg, DISCOVERY_PORT, BROADCAST_ADDR); } catch {}
  try { udpSocket.send(msg, DISCOVERY_PORT, LOOPBACK_ADDR); } catch {}
}

function cleanStalePeers() {
  const now = Date.now();
  for (const [id, peer] of _peers) {
    const wsState = peer.ws?.readyState;
    if (wsState === WebSocket.OPEN) {
      peer.lastSeen = now;
      if (!peer.online) {
        peer.online = true;
        peer.connectionState = 'connected';
        _onPeerOnline(peer);
      }
      continue;
    }
    if (wsState === WebSocket.CONNECTING) {
      peer.connectionState = 'handshaking';
      continue;
    }
    if (now - peer.lastSeen > PEER_TIMEOUT && peer.online) {
      peer.online = false;
      peer.ws = null;
      peer.connectionState = 'degraded';
      _onPeerOffline(id);
    }
  }
}

function getSocket() { return udpSocket; }

module.exports = {
  DISCOVERY_PORT,
  BROADCAST_ADDR,
  LOOPBACK_ADDR,
  ANNOUNCE_INTERVAL,
  PEER_TIMEOUT,
  init,
  startUdpDiscovery,
  announceMyself,
  cleanStalePeers,
  getSocket
};
