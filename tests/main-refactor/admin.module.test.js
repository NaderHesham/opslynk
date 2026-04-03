'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdminPolicies } = require('../../src/main/admin/adminPolicies');
const { createAdminController } = require('../../src/main/admin/adminController');
const { createAdminCommands } = require('../../src/main/admin/adminCommands');
const { ADMIN_COMMANDS } = require('../../src/main/admin/adminTypes');

function createBaseDeps() {
  const sentPackets = [];
  const broadcastPackets = [];
  const busEvents = [];

  const state = {
    myProfile: { id: 'admin-1', username: 'Local Operator', role: 'super_admin' },
    peers: new Map([
      ['peer-1', { id: 'peer-1', username: 'peer1' }],
      ['peer-2', { id: 'peer-2', username: 'peer2' }]
    ]),
    helpRequests: [{ reqId: 'req-1', status: 'open' }],
    userGroups: []
  };

  const deps = {
    state,
    wsNet: {
      broadcastToSelectedPeers: (peerIds, packet) => broadcastPackets.push({ peerIds, packet })
    },
    helpSvc: {
      getTargetPeers: (_peers, peerIds) => {
        if (Array.isArray(peerIds) && peerIds.length) return peerIds.map((id) => ({ id }));
        return [...state.peers.values()];
      },
      getPeerExportPayload: (peer) => ({ id: peer.id, username: peer.username }),
      formatPeerSpecsText: (peer) => `User: ${peer.username}`
    },
    sendToPeer: (peerId, packet) => sentPackets.push({ peerId, packet }),
    broadcastToPeers: (packet) => broadcastPackets.push({ peerIds: null, packet }),
    doSaveState: () => { deps.saveCount += 1; },
    updateTrayMenu: () => { deps.trayUpdates += 1; },
    showMainWindow: () => { deps.mainWindowShown += 1; },
    closeHelpPopup: (reqId) => { deps.closedHelpPopup = reqId; },
    bus: { emit: (event, payload) => busEvents.push({ event, payload }) },
    EVENTS: { GOTO_TAB: 'goto-tab', FOCUS_HELP: 'focus-help' },
    uuidv4: () => 'uuid-fixed',
    app: { getPath: () => 'C:\\Docs' },
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fs: { writeFileSync: () => {} },
    path: require('path'),
    buildCommandOrigin: (commandType) => ({
      issuerId: 'admin-1',
      issuerDeviceId: 'admin-1',
      issuerRole: 'super_admin',
      issuedAt: new Date().toISOString(),
      commandType
    }),
    saveCount: 0,
    trayUpdates: 0,
    mainWindowShown: 0,
    closedHelpPopup: null,
    sentPackets,
    broadcastPackets,
    busEvents
  };

  return deps;
}

test('admin policies enforce admin/super-admin boundaries', () => {
  const state = { myProfile: { role: 'user' } };
  const policies = createAdminPolicies({
    state,
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    isSuperAdmin: (role) => role === 'super_admin'
  });

  const basic = policies.check(ADMIN_COMMANDS.SEND_BROADCAST);
  assert.deepEqual(basic, { allowed: false, error: 'Admin only.' });

  const superOnly = policies.check(ADMIN_COMMANDS.LOCK_ALL_SCREENS);
  assert.deepEqual(superOnly, { allowed: false, error: 'Super Admin only.' });
});

test('admin controller normalizes payload and executes command', async () => {
  let received;
  const controller = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async (command, payload) => { received = { command, payload }; return { ok: true }; } }
  });

  const result = await controller.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: 'hello' });
  assert.deepEqual(result, { ok: true });
  assert.equal(received.command, ADMIN_COMMANDS.SEND_BROADCAST);
  assert.equal(received.payload.peerIds, null);
});

test('send broadcast command keeps packet structure', async () => {
  const deps = createBaseDeps();
  const commands = createAdminCommands(deps);

  const result = await commands.execute(ADMIN_COMMANDS.SEND_BROADCAST, {
    text: 'alert',
    urgency: 'urgent',
    durationSeconds: 20,
    peerIds: ['peer-1']
  });

  assert.equal(result.broadcastId, 'uuid-fixed');
  assert.equal(result.targetCount, 1);
  assert.equal(deps.broadcastPackets.length, 1);
  assert.equal(deps.broadcastPackets[0].packet.type, 'broadcast');
  assert.equal(deps.broadcastPackets[0].packet.fromId, 'admin-1');
});

test('lock/unlock commands preserve control packets', async () => {
  const deps = createBaseDeps();
  const commands = createAdminCommands(deps);

  const lockResult = await commands.execute(ADMIN_COMMANDS.LOCK_ALL_SCREENS, {});
  assert.equal(lockResult.success, true);
  assert.equal(lockResult.targetCount, deps.state.peers.size);
  assert.equal(deps.broadcastPackets[0].packet.type, 'screen-lock');
  assert.equal(deps.broadcastPackets[0].packet.message, 'Your screen has been locked by the administrator.');

  const unlockResult = await commands.execute(ADMIN_COMMANDS.UNLOCK_ALL_SCREENS);
  assert.equal(unlockResult.success, true);
  assert.equal(deps.broadcastPackets[1].packet.type, 'screen-unlock');
});

test('forced video command rejects missing payload and keeps stop command format', async () => {
  const deps = createBaseDeps();
  const commands = createAdminCommands(deps);

  const missing = await commands.execute(ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST, { videoB64: '' });
  assert.deepEqual(missing, { success: false, error: 'No video selected.' });

  const stop = await commands.execute(ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST, {});
  assert.equal(stop.success, true);
  assert.equal(deps.broadcastPackets[0].packet.type, 'forced-video-broadcast-stop');
  assert.equal(deps.broadcastPackets[0].packet.broadcastId, null);
});

test('ack-help keeps side effects and emits focus events', async () => {
  const deps = createBaseDeps();
  const commands = createAdminCommands(deps);

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };
  try {
    const result = await commands.execute(ADMIN_COMMANDS.ACK_HELP, { peerId: 'peer-1', reqId: 'req-1' });
    assert.equal(result.success, true);
    assert.equal(deps.sentPackets[0].packet.type, 'help-ack');
    assert.equal(deps.state.helpRequests[0].status, 'acked');
    assert.equal(deps.closedHelpPopup, 'req-1');
    assert.equal(deps.saveCount, 1);
    assert.equal(deps.mainWindowShown, 1);
    assert.equal(deps.trayUpdates, 1);
    assert.equal(deps.busEvents[0].event, 'goto-tab');
    assert.equal(deps.busEvents[1].event, 'focus-help');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
