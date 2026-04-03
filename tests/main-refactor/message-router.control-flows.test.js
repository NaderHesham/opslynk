'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMessageRouter } = require('../../src/main/network/messageRouter');

function createHarness() {
  const calls = {
    urgentOverlay: 0,
    normalPopup: 0,
    forcedVideo: 0,
    forcedVideoStop: 0,
    lockScreen: 0,
    unlockScreen: 0
  };
  const emitted = [];

  const state = {
    myProfile: { id: 'self-1', role: 'user' },
    myPortRef: { value: 5000 },
    peers: new Map([
      ['admin-1', { id: 'admin-1', role: 'super_admin', username: 'Admin', ws: { readyState: 1 } }],
      ['user-1', { id: 'user-1', role: 'user', username: 'User' }]
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
    unlockScreen: () => { calls.unlockScreen += 1; }
  });

  return { router, calls, emitted };
}

test('urgent broadcast uses urgent overlay path', () => {
  const { router, calls } = createHarness();
  router.handleP2PMessage(null, {
    type: 'broadcast',
    fromId: 'admin-1',
    text: 'urgent message',
    urgency: 'urgent',
    broadcastId: 'b1'
  });
  assert.equal(calls.urgentOverlay, 1);
  assert.equal(calls.normalPopup, 0);
});

test('forced video start/stop routes remain intact', () => {
  const { router, calls } = createHarness();

  router.handleP2PMessage(null, { type: 'forced-video-broadcast', fromId: 'admin-1', videoB64: 'abc' });
  router.handleP2PMessage(null, { type: 'forced-video-broadcast-stop', fromId: 'admin-1' });

  assert.equal(calls.forcedVideo, 1);
  assert.equal(calls.forcedVideoStop, 1);
});

test('screen lock/unlock only accept admin sender role', () => {
  const { router, calls, emitted } = createHarness();

  router.handleP2PMessage(null, { type: 'screen-lock', fromId: 'user-1', message: 'x' });
  assert.equal(calls.lockScreen, 0);

  router.handleP2PMessage(null, { type: 'screen-lock', fromId: 'admin-1', message: 'locked' });
  assert.equal(calls.lockScreen, 1);
  assert.equal(emitted.find((x) => x.event === 'SCREEN_LOCKED').payload.message, 'locked');

  router.handleP2PMessage(null, { type: 'screen-unlock', fromId: 'admin-1' });
  assert.equal(calls.unlockScreen, 1);
  assert.ok(emitted.find((x) => x.event === 'SCREEN_UNLOCKED'));
});
