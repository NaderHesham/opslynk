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
      logAuthorization: () => calls.push('audit-authorization'),
      logBeforeExecute: () => calls.push('audit-before'),
      logAfterExecute: () => calls.push('audit-after')
    }
  });

  const result = await controller.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: 'hello' });
  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls, ['validate', 'audit-validation', 'authorize', 'audit-authorization', 'audit-before', 'audit-after']);
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
  logger.logAuthorization({
    command: ADMIN_COMMANDS.SEND_BROADCAST,
    payload: { text: 'hello', urgency: 'urgent', durationSeconds: 10, peerIds: ['p1', 'p2'] },
    allowed: true
  });
  const entries = logger.getEntries();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].type, 'admin-validation');
  assert.equal(entries[0].payload.textLength, 5);
  assert.equal(entries[1].payload.hasVideo, true);
  assert.equal(entries[2].type, 'admin-authorization');
  assert.equal(entries[2].allowed, true);
});

test('audit logger invokes onEntry asynchronously', async () => {
  let observed = null;
  const logger = createAuditLogger({
    onEntry: (entry) => { observed = entry; }
  });
  logger.logDenied({
    command: ADMIN_COMMANDS.LOCK_ALL_SCREENS,
    payload: { message: 'x' },
    reason: 'denied'
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(observed);
  assert.equal(observed.type, 'admin-denied');
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

test('controller denies sensitive command execution when authorization policy is unavailable', async () => {
  let executed = false;
  const { createAuthorizationBoundary } = require('../../src/main/auth/authorizationBoundary');
  const boundary = createAuthorizationBoundary({});

  const controller = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async () => { executed = true; return { success: true }; } },
    validation: {
      validate: () => ({ valid: true })
    },
    authorization: {
      authorize: boundary.authorize
    }
  });

  const result = await controller.run(ADMIN_COMMANDS.LOCK_ALL_SCREENS, { message: 'lock now' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Authorization policy is not configured.');
  assert.equal(executed, false);
});

test('controller + audit logger capture validation, authorization, deny, and execution outcomes', async () => {
  const logger = createAuditLogger();
  const executed = [];

  const allowController = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async () => { executed.push('allow'); return { success: true }; } },
    validation: { validate: () => ({ valid: true }) },
    authorization: { authorize: () => ({ allowed: true }) },
    auditLogger: logger
  });

  const denyController = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async () => { executed.push('deny'); return { success: true }; } },
    validation: { validate: () => ({ valid: true }) },
    authorization: { authorize: () => ({ allowed: false, error: 'blocked' }) },
    auditLogger: logger
  });

  await allowController.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: 'go', urgency: 'urgent', durationSeconds: 5, peerIds: ['peer-1'] });
  const denied = await denyController.run(ADMIN_COMMANDS.SEND_BROADCAST, { text: 'go', urgency: 'urgent', durationSeconds: 5, peerIds: ['peer-1'] });

  assert.equal(denied.success, false);
  assert.equal(executed.length, 1);

  const types = logger.getEntries().map((x) => x.type);
  assert.ok(types.includes('admin-validation'));
  assert.ok(types.includes('admin-authorization'));
  assert.ok(types.includes('admin-denied'));
  assert.ok(types.includes('admin-after-execute'));
});

test('controller logs execution outcome even when command throws', async () => {
  const logger = createAuditLogger();
  const controller = createAdminController({
    policies: { check: () => ({ allowed: true }) },
    commands: { execute: async () => { throw new Error('boom'); } },
    validation: { validate: () => ({ valid: true }) },
    authorization: { authorize: () => ({ allowed: true }) },
    auditLogger: logger
  });

  await assert.rejects(() => controller.run(ADMIN_COMMANDS.SEND_BROADCAST, {
    text: 'go',
    urgency: 'urgent',
    durationSeconds: 5,
    peerIds: ['peer-1']
  }), /boom/);

  const entries = logger.getEntries();
  const after = entries.find((x) => x.type === 'admin-after-execute');
  assert.ok(after);
  assert.equal(after.result.success, false);
});
