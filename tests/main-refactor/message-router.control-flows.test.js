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
