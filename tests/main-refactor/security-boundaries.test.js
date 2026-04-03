'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthorizationBoundary } = require('../../src/main/auth/authorizationBoundary');
const { createAdminCommandValidators, createCommandValidation } = require('../../src/main/admin/commandValidation');
const { createAdminController } = require('../../src/main/admin/adminController');
const { createAuditLogger } = require('../../src/main/audit/auditLogger');
const { ADMIN_COMMANDS } = require('../../src/main/admin/adminTypes');
const { createAdminModule } = require('../../src/main/admin');

test('authorization boundary preserves policy decision path', () => {
  const boundary = createAuthorizationBoundary({
    checkPolicy: (command) => (
      command !== ADMIN_COMMANDS.LOCK_ALL_SCREENS
        ? { allowed: true }
        : { allowed: false, error: 'blocked' }
    )
  });

  const denied = boundary.authorize({ command: ADMIN_COMMANDS.LOCK_ALL_SCREENS, payload: {} });
  const allowed = boundary.authorize({ command: ADMIN_COMMANDS.UNLOCK_ALL_SCREENS, payload: {} });

  assert.deepEqual(denied, { allowed: false, error: 'blocked', mode: 'policy' });
  assert.deepEqual(allowed, { allowed: true, error: undefined, mode: 'policy' });
});

test('authorization boundary denies sensitive commands when policy checker is missing', () => {
  const boundary = createAuthorizationBoundary({});
  const denied = boundary.authorize({ command: ADMIN_COMMANDS.LOCK_ALL_SCREENS, payload: {} });
  assert.equal(denied.allowed, false);
  assert.equal(denied.mode, 'hard-deny');
});

test('controller runs through validation/authorization/audit boundaries before execute', async () => {
  const calls = [];
  const controller = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async () => ({ success: true }) },
    validation: {
      validate: () => {
        calls.push('validate');
        return { valid: true };
      }
    },
    authorization: {
      authorize: () => {
        calls.push('authorize');
        return { allowed: true };
      }
    },
    auditLogger: {
      logDenied: () => calls.push('audit-denied'),
      logValidation: () => calls.push('audit-validation'),
      logBeforeExecute: () => calls.push('audit-before'),
      logAfterExecute: () => calls.push('audit-after')
    }
  });

  const result = await controller.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: 'hello' });
  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls, ['validate', 'audit-validation', 'authorize', 'audit-before', 'audit-after']);
});

test('command validation hard-denies sensitive commands when validators are missing', () => {
  const validation = createCommandValidation({});
  const result = validation.validate({ command: ADMIN_COMMANDS.SEND_BROADCAST, payload: { text: 'x' } });
  assert.equal(result.valid, false);
  assert.equal(result.mode, 'hard-deny');
});

test('sensitive validator rejects malformed payload and accepts valid payload', () => {
  const validation = createCommandValidation({ validators: createAdminCommandValidators() });
  const bad = validation.validate({
    command: ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST,
    payload: { videoB64: '', mime: 'text/plain', peerIds: ['peer-1'] }
  });
  assert.equal(bad.valid, false);

  const good = validation.validate({
    command: ADMIN_COMMANDS.SEND_BROADCAST,
    payload: { text: 'Hello', urgency: 'urgent', durationSeconds: 30, peerIds: ['peer-1'] }
  });
  assert.equal(good.valid, true);
  assert.equal(good.mode, 'validator-map');
});

test('audit logger records lightweight metadata for sensitive command flow', () => {
  const logger = createAuditLogger();
  logger.logValidation({
    command: ADMIN_COMMANDS.SEND_BROADCAST,
    payload: { text: 'hello', urgency: 'urgent', durationSeconds: 10, peerIds: ['p1', 'p2'] },
    valid: true
  });
  logger.logBeforeExecute({
    command: ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST,
    payload: { videoB64: 'abc', peerIds: ['p1'] }
  });
  const entries = logger.getEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, 'admin-validation');
  assert.equal(entries[0].payload.textLength, 5);
  assert.equal(entries[1].payload.hasVideo, true);
});

test('admin module rejects invalid sensitive payload before execute', async () => {
  const deps = {
    state: {
      myProfile: { id: 'admin-1', role: 'super_admin', username: 'Admin' },
      peers: new Map(),
      helpRequests: [],
      userGroups: []
    },
    hasAdminAccess: (role) => role === 'admin' || role === 'super_admin',
    isSuperAdmin: (role) => role === 'super_admin',
    wsNet: { broadcastToSelectedPeers: () => {} },
    helpSvc: {
      getTargetPeers: () => [],
      getPeerExportPayload: () => ({}),
      formatPeerSpecsText: () => ''
    },
    sendToPeer: () => {},
    broadcastToPeers: () => {},
    doSaveState: () => {},
    updateTrayMenu: () => {},
    showMainWindow: () => {},
    closeHelpPopup: () => {},
    bus: { emit: () => {} },
    EVENTS: { GOTO_TAB: 'goto-tab', FOCUS_HELP: 'focus-help' },
    uuidv4: () => 'id-1',
    app: { getPath: () => 'C:\\Docs' },
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fs: { writeFileSync: () => {} },
    path: require('path')
  };

  const module = createAdminModule(deps);
  const result = await module.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: '', urgency: 'urgent', durationSeconds: 30, peerIds: null });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Broadcast text is required.');
});
