// network/udpDiscovery.js
// UDP broadcast peer discovery — LAN only

const dgram = require('dgram');
const os    = require('os');
const WebSocket = require('ws');

const DISCOVERY_PORT   = 45678;
const BROADCAST_ADDR   = '255.255.255.255';
const ANNOUNCE_INTERVAL = 3000;
const PEER_TIMEOUT     = 30000;

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
    setInterval(cleanStalePeers, 5000);
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
          color   : d.color,
          title   : d.title,
          systemInfo: d.systemInfo || null,
          ip      : rinfo.address,
          port    : d.port,
          ws      : null,
          online  : false,
          lastSeen: Date.now()
        };
        _peers.set(d.id, peer);
      } else {
        peer.lastSeen = Date.now();
        Object.assign(peer, {
          username  : d.username,
          role      : d.role,
          color     : d.color,
          title     : d.title,
          systemInfo: d.systemInfo || peer.systemInfo || null,
          ip        : rinfo.address,
          port      : d.port
        });
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
    username  : profile.username,
    role      : profile.role,
    color     : profile.color,
    title     : profile.title,
    port      : _myPortRef.value,
    systemInfo: profile.systemInfo || null
  }));

  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const bcast = addr.address.split('.').slice(0, 3).join('.') + '.255';
        try { udpSocket.send(msg, DISCOVERY_PORT, bcast); } catch {}
      }
    }
  }
  try { udpSocket.send(msg, DISCOVERY_PORT, BROADCAST_ADDR); } catch {}
}

function cleanStalePeers() {
  const now = Date.now();
  for (const [id, peer] of _peers) {
    if (peer.ws?.readyState === WebSocket.OPEN) {
      peer.lastSeen = now;
      if (!peer.online) {
        peer.online = true;
        _onPeerOnline(peer);
      }
      continue;
    }
    if (now - peer.lastSeen > PEER_TIMEOUT && peer.online) {
      peer.online = false;
      _onPeerOffline(id);
    }
  }
}

function getSocket() { return udpSocket; }

module.exports = {
  DISCOVERY_PORT,
  BROADCAST_ADDR,
  ANNOUNCE_INTERVAL,
  PEER_TIMEOUT,
  init,
  startUdpDiscovery,
  announceMyself,
  cleanStalePeers,
  getSocket
};
