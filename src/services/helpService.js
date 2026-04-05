// services/helpService.js
// Manages help-request delivery, peer message queue, and export formatting

const WebSocket = require('ws');

// ── PEER MESSAGE QUEUE ────────────────────────────────────────────────────────
const pendingPeerMessages = new Map();   // peerId → msg[]

const QUEUE_MAX_SIZE  = 50;
const QUEUE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function queuePeerMessage(peerId, data) {
  if (!peerId || !data) return;
  const list = pendingPeerMessages.get(peerId) || [];
  list.push({ ...data, _queuedAt: Date.now() });
  // Drop oldest if over max size
  pendingPeerMessages.set(peerId, list.slice(-QUEUE_MAX_SIZE));
}

function getPendingMessages(peerId) {
  const list = pendingPeerMessages.get(peerId) || [];
  const now  = Date.now();
  // Filter out messages older than 5 minutes
  const fresh = list.filter(m => (now - (m._queuedAt || now)) < QUEUE_MAX_AGE_MS);
  if (fresh.length !== list.length) pendingPeerMessages.set(peerId, fresh);
  // Strip internal _queuedAt before returning
  return fresh.map(({ _queuedAt, ...m }) => m);
}

function clearPendingMessages(peerId) {
  pendingPeerMessages.delete(peerId);
}

// ── PEER HELPERS ──────────────────────────────────────────────────────────────
function getTargetPeers(peers, targetPeerIds) {
  const ids = Array.isArray(targetPeerIds) && targetPeerIds.length
    ? [...new Set(targetPeerIds)]
    : [...peers.keys()];
  return ids.map(id => peers.get(id)).filter(Boolean);
}

// ── HELP REQUEST CRUD ─────────────────────────────────────────────────────────
function upsertHelpRequest(helpRequests, req, saveState) {
  const idx = helpRequests.findIndex(item => item.reqId === req.reqId);
  if (idx >= 0) helpRequests[idx] = { ...helpRequests[idx], ...req };
  else          helpRequests.unshift(req);
  saveState();
}

/**
 * Delivers a single help request to one admin peer.
 * Returns true if the message was sent (or already delivered).
 */
function deliverHelpRequestToAdmin(peer, req, sendToPeer, hasAdminAccess, saveState) {
  if (!peer || !hasAdminAccess(peer.role))           return false;
  if (!Array.isArray(req.deliveredAdminIds)) req.deliveredAdminIds = [];
  if (req.deliveredAdminIds.includes(peer.id))       return false;

  const sent = sendToPeer(peer.id, {
    type           : 'help-request',
    fromId         : req.fromId,
    username       : req.username,
    machine        : req.machine,
    description    : req.description,
    priority       : req.priority,
    reqId          : req.reqId,
    timestamp      : req.timestamp,
    screenshotB64  : req.screenshotB64  || null,
    screenshotName : req.screenshotName || null,
    screenshotSize : req.screenshotSize || 0
  });

  if (sent) {
    req.deliveredAdminIds.push(peer.id);
    req.lastDeliveryAt = new Date().toISOString();
    saveState();
  }
  return sent;
}

/**
 * Flushes any queued outgoing help requests to online admins.
 */
function flushPendingHelpRequests(
  pendingOutgoingHelpRequests,
  peers,
  sendToPeer,
  hasAdminAccess,
  saveState,
  targetAdminId = null
) {
  if (!pendingOutgoingHelpRequests.length) return;

  const admins = [...peers.values()].filter(peer =>
    hasAdminAccess(peer.role) &&
    peer.online &&
    peer.ws?.readyState === WebSocket.OPEN &&
    (!targetAdminId || peer.id === targetAdminId)
  );
  if (!admins.length) return;

  const remaining = pendingOutgoingHelpRequests.filter(req => {
    admins.forEach(peer => deliverHelpRequestToAdmin(peer, req, sendToPeer, hasAdminAccess, saveState));
    return !(Array.isArray(req.deliveredAdminIds) && req.deliveredAdminIds.length > 0);
  });

  // Mutate in place so main keeps the same reference
  pendingOutgoingHelpRequests.length = 0;
  remaining.forEach(r => pendingOutgoingHelpRequests.push(r));
  saveState();
}

// ── EXPORT HELPERS ────────────────────────────────────────────────────────────
function getPeerExportPayload(peer) {
  if (!peer) return null;
  return {
    id         : peer.id,
    username   : peer.username,
    role       : peer.role,
    title      : peer.title || '',
    online     : !!peer.online,
    collectedAt: new Date().toISOString(),
    systemInfo : peer.systemInfo || null
  };
}

function formatPeerSpecsText(peer) {
  const payload = getPeerExportPayload(peer);
  if (!payload) return '';
  const sys  = payload.systemInfo || {};
  const disk = sys.disk           || {};
  return [
    'OpsLynk User Specs Export',
    '========================',
    `Name         : ${payload.username  || '-'}`,
    `Role         : ${payload.role      || '-'}`,
    `Title        : ${payload.title     || '-'}`,
    `Online       : ${payload.online ? 'Yes' : 'No'}`,
    `Collected At : ${payload.collectedAt}`,
    '',
    'System',
    '------',
    `Hostname     : ${sys.hostname     || '-'}`,
    `Manufacturer : ${sys.manufacturer || '-'}`,
    `Model        : ${sys.modelName    || '-'}`,
    `Serial       : ${sys.serialNumber || '-'}`,
    `OS           : ${sys.version || sys.os || '-'}`,
    `Architecture : ${sys.arch         || '-'}`,
    `CPU          : ${sys.cpuModel     || '-'}`,
    `CPU Cores    : ${sys.cpuCores  ?? '-'}`,
    `RAM          : ${sys.ramGb ? `${sys.ramGb} GB` : '-'}`,
    `Disk Drive   : ${disk.drive   || '-'}`,
    `Disk Total   : ${disk.totalGb ? `${disk.totalGb} GB` : '-'}`,
    `Disk Free    : ${disk.freeGb  ? `${disk.freeGb} GB`  : '-'}`,
    '',
    'Network',
    '-------',
    `IP           : ${sys.ip  || '-'}`,
    `MAC          : ${sys.mac || '-'}`
  ].join('\n');
}

module.exports = {
  queuePeerMessage,
  getPendingMessages,
  clearPendingMessages,
  getTargetPeers,
  upsertHelpRequest,
  deliverHelpRequestToAdmin,
  flushPendingHelpRequests,
  getPeerExportPayload,
  formatPeerSpecsText
};
