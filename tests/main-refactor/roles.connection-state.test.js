'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getPeerConnectionState, peerToSafe } = require('../../dist-ts/main/utils/roles');

test('getPeerConnectionState prefers explicit connection state and degraded rejected peers', () => {
  assert.equal(getPeerConnectionState({ online: true, connectionState: 'handshaking' }), 'handshaking');
  assert.equal(getPeerConnectionState({ online: true, identityRejected: true }), 'degraded');
  assert.equal(getPeerConnectionState({ online: true }), 'connected');
  assert.equal(getPeerConnectionState({ online: false }), 'offline');
});

test('peerToSafe exposes computed connection state', () => {
  const safe = peerToSafe({
    id: 'peer-1',
    username: 'Peer',
    role: 'user',
    online: false,
    title: 'Operator',
    avatar: null,
    identityVerified: false,
    identityRejected: false,
    systemInfo: null
  });

  assert.equal(safe.id, 'peer-1');
  assert.equal(safe.connectionState, 'offline');
  assert.equal(safe.online, false);
});
