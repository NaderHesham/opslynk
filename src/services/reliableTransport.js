'use strict';

const DEFAULT_POLICIES = {
  'chat-direct': { maxAttempts: 3, retryDelaysMs: [2000, 5000] },
  'help-request': { maxAttempts: 4, retryDelaysMs: [2000, 5000, 10000] }
};

function createReliableTransport({
  state,
  sendToPeer,
  broadcastToRenderer,
  doSaveState
}) {
  const pending = new Map();

  function emitStatus(kind, eventName, data) {
    if (kind === 'chat-direct') broadcastToRenderer(eventName, data);
  }

  function toSerializable(entry) {
    return {
      msgId: entry.msgId,
      kind: entry.kind,
      peerId: entry.peerId,
      payload: entry.payload,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts,
      retryDelaysMs: entry.retryDelaysMs,
      persist: entry.persist,
      createdAt: entry.createdAt,
      lastAttemptAt: entry.lastAttemptAt
    };
  }

  function syncState() {
    state.pendingReliableMessages = [...pending.values()]
      .filter((entry) => entry.persist)
      .map(toSerializable);
    doSaveState();
  }

  function clearTimer(entry) {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  function finalizeFailure(entry) {
    emitStatus(entry.kind, 'chat:failed', { msgId: entry.msgId, peerId: entry.peerId });
    clearTimer(entry);
    pending.delete(entry.msgId);
    syncState();
  }

  function scheduleRetry(entry) {
    clearTimer(entry);
    if (entry.attempts >= entry.maxAttempts) {
      finalizeFailure(entry);
      return;
    }

    const retryIndex = Math.max(0, entry.attempts - 1);
    const delay = entry.retryDelaysMs[Math.min(retryIndex, entry.retryDelaysMs.length - 1)] || 2000;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      entry.attempts += 1;
      entry.lastAttemptAt = new Date().toISOString();
      emitStatus(entry.kind, 'chat:retrying', { msgId: entry.msgId, peerId: entry.peerId, attempt: entry.attempts });
      sendToPeer(entry.peerId, entry.payload);
      syncState();
      scheduleRetry(entry);
    }, delay);
  }

  function track({
    kind,
    peerId,
    payload,
    persist = false,
    maxAttempts,
    retryDelaysMs
  }) {
    if (!payload?.msgId || !peerId) return false;
    const policy = DEFAULT_POLICIES[kind] || DEFAULT_POLICIES['chat-direct'];
    const entry = {
      msgId: String(payload.msgId),
      kind,
      peerId,
      payload,
      attempts: 1,
      maxAttempts: Number(maxAttempts || policy.maxAttempts),
      retryDelaysMs: Array.isArray(retryDelaysMs) && retryDelaysMs.length ? retryDelaysMs : [...policy.retryDelaysMs],
      persist: !!persist,
      createdAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      timer: null
    };

    pending.set(entry.msgId, entry);
    sendToPeer(peerId, payload);
    syncState();
    scheduleRetry(entry);
    return true;
  }

  function confirm(msgId) {
    const entry = pending.get(String(msgId || ''));
    if (!entry) return false;
    clearTimer(entry);
    pending.delete(entry.msgId);
    emitStatus(entry.kind, 'chat:delivered', { msgId: entry.msgId, peerId: entry.peerId });
    syncState();
    return true;
  }

  function notifyPeerAvailable(peerId) {
    for (const entry of pending.values()) {
      if (entry.peerId !== peerId) continue;
      clearTimer(entry);
      entry.lastAttemptAt = new Date().toISOString();
      sendToPeer(entry.peerId, entry.payload);
      syncState();
      scheduleRetry(entry);
    }
  }

  function hydrate() {
    for (const raw of state.pendingReliableMessages || []) {
      if (!raw?.msgId || !raw?.peerId || !raw?.payload) continue;
      pending.set(String(raw.msgId), {
        msgId: String(raw.msgId),
        kind: raw.kind || 'chat-direct',
        peerId: String(raw.peerId),
        payload: raw.payload,
        attempts: Number(raw.attempts || 1),
        maxAttempts: Number(raw.maxAttempts || DEFAULT_POLICIES['chat-direct'].maxAttempts),
        retryDelaysMs: Array.isArray(raw.retryDelaysMs) && raw.retryDelaysMs.length ? raw.retryDelaysMs : [...DEFAULT_POLICIES['chat-direct'].retryDelaysMs],
        persist: raw.persist !== false,
        createdAt: String(raw.createdAt || new Date().toISOString()),
        lastAttemptAt: String(raw.lastAttemptAt || new Date().toISOString()),
        timer: null
      });
    }
    syncState();
    for (const entry of pending.values()) scheduleRetry(entry);
  }

  return {
    track,
    confirm,
    notifyPeerAvailable,
    hydrate
  };
}

module.exports = { createReliableTransport };
