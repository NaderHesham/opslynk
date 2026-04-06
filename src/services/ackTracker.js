'use strict';

const TIMEOUT_MS = 4000; // 4 seconds before marking as failed

const pending = new Map();
// Map<msgId, { peerId, payload, timer, onDelivered, onFailed }>

function track(msgId, peerId, payload, { onDelivered, onFailed } = {}) {
  const timer = setTimeout(() => {
    const entry = pending.get(msgId);
    if (!entry) return;
    pending.delete(msgId);
    onFailed?.(msgId, peerId);
  }, TIMEOUT_MS);

  pending.set(msgId, { peerId, payload, timer, onDelivered, onFailed });
}

function confirm(msgId) {
  console.log('[ACK-DEBUG] confirmed:', msgId);
  const entry = pending.get(msgId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(msgId);
  entry.onDelivered?.(msgId, entry.peerId);
}

function cancel(msgId) {
  const entry = pending.get(msgId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(msgId);
}

function getPendingCount() {
  return pending.size;
}

module.exports = { track, confirm, cancel, getPendingCount };
