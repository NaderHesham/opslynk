'use strict';

const TIMEOUT_MS = 8000; // 8 seconds before marking as failed

const pending = new Map();
// Map<msgId, { peerId, payload, timer, onDelivered, onFailed, retries }>

function track(msgId, peerId, payload, { onDelivered, onFailed, maxRetries = 2, _retryCount = 0 } = {}) {
  const timer = setTimeout(() => {
    const entry = pending.get(msgId);
    if (!entry) return;
    pending.delete(msgId);
    if (entry.retries < maxRetries) {
      // retry with new msgId
      const newId = require('uuid').v4();
      payload.msgId = newId;
      track(newId, peerId, payload, { onDelivered, onFailed, maxRetries, _retryCount: entry.retries + 1 });
      entry.retrySend?.(peerId, payload);
    } else {
      onFailed?.(msgId, peerId);
    }
  }, TIMEOUT_MS);

  pending.set(msgId, { peerId, payload, timer, onDelivered, onFailed, retries: _retryCount });
}

function confirm(msgId) {
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
