'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMessageRouter } = require('../../src/main/network/messageRouter');

function createHarness() {
  const adminWs = { readyState: 1 };
  const calls = {
    urgentOverlay: 0,
    normalPopup: 0,
    forcedVideo: 0,
    forcedVideoStop: 0,
    lockScreen: 0,
    unlockScreen: 0
  };
  const emitted = [];
  const trustEvents = [];

  const state = {
    myProfile: { id: 'self-1', role: 'user' },
    myPortRef: { value: 5000 },
    peers: new Map([
      ['admin-1', { id: 'admin-1', role: 'super_admin', username: 'Admin', ws: adminWs, identityVerified: true, identityFingerprint: 'fp-admin' }],
      ['user-1', { id: 'user-1', role: 'user', username: 'User', ws: { readyState: 1 }, identityVerified: true, identityFingerprint: 'fp-user' }]
    ]),
    chatHistory: {},
    soundEnabled: true,
    helpRequests: []
  };

  const router = createMessageRouter({
    state,
    wsNet: { CHAT_PORT_BASE: 3000, safeSend: () => {} },
    helpSvc: { upsertHelpRequest: () => {} },
    bus: { emit: (event, payload) => emitted.push({ event, payload }) },
    EVENTS: {
      NETWORK_BROADCAST: 'NETWORK_BROADCAST',
      SCREEN_LOCKED: 'SCREEN_LOCKED',
      SCREEN_UNLOCKED: 'SCREEN_UNLOCKED',
      PLAY_SOUND: 'PLAY_SOUND',
      NETWORK_ACK: 'NETWORK_ACK',
      NETWORK_REPLY: 'NETWORK_REPLY',
      NETWORK_MESSAGE: 'NETWORK_MESSAGE',
      HELP_REQUEST: 'HELP_REQUEST',
      HELP_ACKED: 'HELP_ACKED',
      DEVICE_UPDATED: 'DEVICE_UPDATED'
    },
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    peerToSafe: (peer) => ({ id: peer.id }),
    updateTrayMenu: () => {},
    doSaveState: () => {},
    doSaveHistory: () => {},
    flushPendingHelpRequests: () => {},
    showNotification: () => {},
    showUrgentOverlay: () => { calls.urgentOverlay += 1; },
    showNormalBroadcastPopup: () => { calls.normalPopup += 1; },
    showHelpRequestPopup: () => {},
    showForcedVideoWindow: () => { calls.forcedVideo += 1; },
    closeForcedVideoWindow: (force) => { if (force) calls.forcedVideoStop += 1; },
    showLockScreen: () => { calls.lockScreen += 1; },
    unlockScreen: () => { calls.unlockScreen += 1; },
    buildSignedPeerIdentity: () => ({ id: 'self-1', role: 'user' }),
    verifySignedPeerIdentity: () => ({ valid: true, fingerprint: 'fp-admin' }),
    evaluateControlMessageTrust: ({ fromId, sender, origin, commandType }) => {
      if (!sender) return { trusted: false, reason: 'unknown-sender', mode: 'denied' };
      if (origin && origin.issuerId === fromId && origin.commandType === commandType) {
        return { trusted: true, reason: 'trusted-origin', mode: 'trusted' };
      }
      if (!origin) return { trusted: false, reason: 'origin-missing', mode: 'denied' };
      return { trusted: false, reason: 'origin-invalid', mode: 'denied' };
    },
    rememberTrustedPeer: () => ({ trusted: true, reason: 'fingerprint-match', mode: 'trusted' }),
    onTrustDecision: (entry) => trustEvents.push(entry)
  });

  return { router, calls, emitted, trustEvents, adminWs };
}

test('urgent broadcast uses urgent overlay path', () => {
  const { router, calls, adminWs } = createHarness();
  router.handleP2PMessage(adminWs, {
    type: 'broadcast',
    fromId: 'admin-1',
    text: 'urgent message',
    urgency: 'urgent',
    broadcastId: 'b1',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'broadcast'
    }
  });
  assert.equal(calls.urgentOverlay, 1);
  assert.equal(calls.normalPopup, 0);
});

test('forced video start/stop routes remain intact', () => {
  const { router, calls, adminWs } = createHarness();

  router.handleP2PMessage(adminWs, {
    type: 'forced-video-broadcast',
    fromId: 'admin-1',
    videoB64: 'abc',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'forced-video-broadcast'
    }
  });
  router.handleP2PMessage(adminWs, {
    type: 'forced-video-broadcast-stop',
    fromId: 'admin-1',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'forced-video-broadcast-stop'
    }
  });

  assert.equal(calls.forcedVideo, 1);
  assert.equal(calls.forcedVideoStop, 1);
});

test('screen lock/unlock only accept admin sender role', () => {
  const { router, calls, emitted, adminWs } = createHarness();

  router.handleP2PMessage(adminWs, { type: 'screen-lock', fromId: 'user-1', message: 'x' });
  assert.equal(calls.lockScreen, 0);

  router.handleP2PMessage(adminWs, {
    type: 'screen-lock',
    fromId: 'admin-1',
    message: 'locked',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'screen-lock'
    }
  });
  assert.equal(calls.lockScreen, 1);
  assert.equal(emitted.find((x) => x.event === 'SCREEN_LOCKED').payload.message, 'locked');

  router.handleP2PMessage(adminWs, {
    type: 'screen-unlock',
    fromId: 'admin-1',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'screen-unlock'
    }
  });
  assert.equal(calls.unlockScreen, 1);
  assert.ok(emitted.find((x) => x.event === 'SCREEN_UNLOCKED'));
});

test('untrusted sensitive command is denied before control action', () => {
  const { router, calls, adminWs } = createHarness();
  router.handleP2PMessage(adminWs, {
    type: 'screen-lock',
    fromId: 'unknown-admin',
    message: 'locked',
    origin: {
      issuerId: 'unknown-admin',
      issuerDeviceId: 'unknown-admin',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'screen-lock'
    }
  });
  assert.equal(calls.lockScreen, 0);
});

test('trusted command origin is audited in trust decision stream', () => {
  const { router, trustEvents, adminWs } = createHarness();
  router.handleP2PMessage(adminWs, {
    type: 'broadcast',
    fromId: 'admin-1',
    text: 'urgent message',
    urgency: 'urgent',
    broadcastId: 'b1',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'broadcast'
    }
  });
  const entry = trustEvents.find((x) => x.commandType === 'broadcast');
  assert.ok(entry);
  assert.equal(entry.trusted, true);
});

test('missing origin metadata rejects sensitive control message', () => {
  const { router, calls, adminWs } = createHarness();
  router.handleP2PMessage(adminWs, {
    type: 'forced-video-broadcast',
    fromId: 'admin-1',
    videoB64: 'abc'
  });
  assert.equal(calls.forcedVideo, 0);
});

test('invalid origin metadata rejects sensitive control message', () => {
  const { router, calls, adminWs } = createHarness();
  router.handleP2PMessage(adminWs, {
    type: 'broadcast',
    fromId: 'admin-1',
    text: 'urgent message',
    urgency: 'urgent',
    broadcastId: 'b1',
    origin: {
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType: 'screen-lock'
    }
  });
  assert.equal(calls.urgentOverlay, 0);
  assert.equal(calls.normalPopup, 0);
});

test('verified hello marks peer as connected and emits safe connection state', () => {
  const state = {
    myProfile: { id: 'self-1', role: 'user' },
    myPortRef: { value: 5000 },
    peers: new Map(),
    chatHistory: {},
    soundEnabled: true,
    helpRequests: []
  };
  const emitted = [];
  const ws = { readyState: 1 };
  const router = createMessageRouter({
    state,
    wsNet: { CHAT_PORT_BASE: 3000, safeSend: () => {} },
    helpSvc: { upsertHelpRequest: () => {} },
    bus: { emit: (event, payload) => emitted.push({ event, payload }) },
    EVENTS: { DEVICE_JOINED: 'DEVICE_JOINED', DEVICE_UPDATED: 'DEVICE_UPDATED' },
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    peerToSafe: (peer) => ({ id: peer.id, connectionState: peer.connectionState, online: peer.online }),
    updateTrayMenu: () => {},
    doSaveState: () => {},
    doSaveHistory: () => {},
    flushPendingHelpRequests: () => {},
    showNotification: () => {},
    showUrgentOverlay: () => {},
    showNormalBroadcastPopup: () => {},
    showHelpRequestPopup: () => {},
    showForcedVideoWindow: () => {},
    closeForcedVideoWindow: () => {},
    showLockScreen: () => {},
    unlockScreen: () => {},
    buildSignedPeerIdentity: () => ({ id: 'self-1', role: 'user' }),
    verifySignedPeerIdentity: () => ({ valid: true, fingerprint: 'fp-peer-1' }),
    evaluateControlMessageTrust: () => ({ trusted: false, reason: 'n/a', mode: 'denied' }),
    rememberTrustedPeer: () => ({ trusted: true, reason: 'fingerprint-match', mode: 'trusted' })
  });

  router.handleP2PMessage(ws, {
    type: 'hello',
    from: { id: 'peer-1', username: 'Peer', role: 'user', port: 45679 }
  }, '10.0.0.5');

  const peer = state.peers.get('peer-1');
  assert.ok(peer);
  assert.equal(peer.online, true);
  assert.equal(peer.connectionState, 'connected');
  assert.equal(emitted[0].event, 'DEVICE_JOINED');
  assert.deepEqual(emitted[0].payload, { id: 'peer-1', connectionState: 'connected', online: true });
});

test('invalid peer identity degrades existing peer state', () => {
  const ws = { readyState: 1, close: () => {} };
  const state = {
    myProfile: { id: 'self-1', role: 'user' },
    myPortRef: { value: 5000 },
    peers: new Map([
      ['peer-1', {
        id: 'peer-1',
        role: 'user',
        username: 'Peer',
        ws,
        online: true,
        connectionState: 'connected',
        identityVerified: true
      }]
    ]),
    chatHistory: {},
    soundEnabled: true,
    helpRequests: []
  };
  const router = createMessageRouter({
    state,
    wsNet: { CHAT_PORT_BASE: 3000, safeSend: () => {} },
    helpSvc: { upsertHelpRequest: () => {} },
    bus: { emit: () => {} },
    EVENTS: {},
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    peerToSafe: (peer) => peer,
    updateTrayMenu: () => {},
    doSaveState: () => {},
    doSaveHistory: () => {},
    flushPendingHelpRequests: () => {},
    showNotification: () => {},
    showUrgentOverlay: () => {},
    showNormalBroadcastPopup: () => {},
    showHelpRequestPopup: () => {},
    showForcedVideoWindow: () => {},
    closeForcedVideoWindow: () => {},
    showLockScreen: () => {},
    unlockScreen: () => {},
    buildSignedPeerIdentity: () => ({ id: 'self-1', role: 'user' }),
    verifySignedPeerIdentity: () => ({ valid: false, reason: 'bad-signature' }),
    evaluateControlMessageTrust: () => ({ trusted: false, reason: 'n/a', mode: 'denied' }),
    rememberTrustedPeer: () => ({ trusted: true, reason: 'fingerprint-match', mode: 'trusted' })
  });

  router.handleP2PMessage(ws, {
    type: 'hello',
    from: { id: 'peer-1', username: 'Peer', role: 'user', port: 45679 }
  }, '10.0.0.5');

  const peer = state.peers.get('peer-1');
  assert.ok(peer);
  assert.equal(peer.online, false);
  assert.equal(peer.connectionState, 'degraded');
  assert.equal(peer.identityRejected, true);
});

test('out-of-order activity transition is ignored when older than current state', () => {
  const ws = { readyState: 1 };
  const state = {
    myProfile: { id: 'self-1', role: 'admin' },
    myPortRef: { value: 5000 },
    peers: new Map([
      ['peer-1', {
        id: 'peer-1',
        role: 'user',
        username: 'Peer',
        ws,
        online: true,
        connectionState: 'connected',
        identityVerified: true,
        activityState: 'idle',
        lastStateChangeAt: 2000,
        lastInputAt: 1500,
        activityEvents: [{ type: 'idle', at: 2000 }]
      }]
    ]),
    chatHistory: {},
    soundEnabled: true,
    helpRequests: []
  };
  const router = createMessageRouter({
    state,
    wsNet: { CHAT_PORT_BASE: 3000, safeSend: () => {} },
    helpSvc: { upsertHelpRequest: () => {} },
    bus: { emit: () => {} },
    EVENTS: { DEVICE_UPDATED: 'DEVICE_UPDATED' },
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    peerToSafe: (peer) => peer,
    updateTrayMenu: () => {},
    doSaveState: () => {},
    doSaveHistory: () => {},
    flushPendingHelpRequests: () => {},
    showNotification: () => {},
    showUrgentOverlay: () => {},
    showNormalBroadcastPopup: () => {},
    showHelpRequestPopup: () => {},
    showForcedVideoWindow: () => {},
    closeForcedVideoWindow: () => {},
    showLockScreen: () => {},
    unlockScreen: () => {},
    buildSignedPeerIdentity: () => ({ id: 'self-1', role: 'admin' }),
    verifySignedPeerIdentity: () => ({ valid: true, fingerprint: 'fp-peer-1' }),
    evaluateControlMessageTrust: () => ({ trusted: false, reason: 'n/a', mode: 'denied' }),
    rememberTrustedPeer: () => ({ trusted: true, reason: 'fingerprint-match', mode: 'trusted' })
  });

  router.handleP2PMessage(ws, {
    type: 'activity-transition',
    fromId: 'peer-1',
    transition: { type: 'active', at: 1500 },
    activity: {
      state: 'active',
      lastInputAt: 1500,
      lastStateChangeAt: 1500,
      idleThresholdMs: 300000
    }
  }, '10.0.0.5');

  const peer = state.peers.get('peer-1');
  assert.equal(peer.activityState, 'idle');
  assert.equal(peer.lastStateChangeAt, 2000);
});

test('out-of-order heartbeat snapshot is ignored when older than known activity state', () => {
  const ws = { readyState: 1 };
  const state = {
    myProfile: { id: 'self-1', role: 'admin' },
    myPortRef: { value: 5000 },
    peers: new Map([
      ['peer-1', {
        id: 'peer-1',
        role: 'user',
        username: 'Peer',
        ws,
        online: true,
        connectionState: 'connected',
        identityVerified: true,
        activityState: 'idle',
        lastStateChangeAt: 3000,
        lastInputAt: 2500,
        activityEvents: [{ type: 'idle', at: 3000 }]
      }]
    ]),
    chatHistory: {},
    soundEnabled: true,
    helpRequests: []
  };
  const router = createMessageRouter({
    state,
    wsNet: { CHAT_PORT_BASE: 3000, safeSend: () => {} },
    helpSvc: { upsertHelpRequest: () => {} },
    bus: { emit: () => {} },
    EVENTS: { DEVICE_UPDATED: 'DEVICE_UPDATED', PEER_HEARTBEAT: 'PEER_HEARTBEAT' },
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    peerToSafe: (peer) => peer,
    updateTrayMenu: () => {},
    doSaveState: () => {},
    doSaveHistory: () => {},
    flushPendingHelpRequests: () => {},
    showNotification: () => {},
    showUrgentOverlay: () => {},
    showNormalBroadcastPopup: () => {},
    showHelpRequestPopup: () => {},
    showForcedVideoWindow: () => {},
    closeForcedVideoWindow: () => {},
    showLockScreen: () => {},
    unlockScreen: () => {},
    buildSignedPeerIdentity: () => ({ id: 'self-1', role: 'admin' }),
    verifySignedPeerIdentity: () => ({ valid: true, fingerprint: 'fp-peer-1' }),
    evaluateControlMessageTrust: () => ({ trusted: false, reason: 'n/a', mode: 'denied' }),
    rememberTrustedPeer: () => ({ trusted: true, reason: 'fingerprint-match', mode: 'trusted' })
  });

  router.handleP2PMessage(ws, {
    type: 'heartbeat',
    fromId: 'peer-1',
    timestamp: 2500,
    activity: {
      state: 'active',
      lastInputAt: 2400,
      lastStateChangeAt: 2500,
      idleThresholdMs: 300000
    }
  }, '10.0.0.5');

  const peer = state.peers.get('peer-1');
  assert.equal(peer.activityState, 'idle');
  assert.equal(peer.lastStateChangeAt, 3000);
  assert.equal(peer.lastInputAt, 2500);
});
