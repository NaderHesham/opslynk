'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthorizationBoundary } = require('../../src/main/auth/authorizationBoundary');
const { createCommandValidation } = require('../../src/main/admin/commandValidation');
const { createAdminController } = require('../../src/main/admin/adminController');
const { ADMIN_COMMANDS } = require('../../src/main/admin/adminTypes');

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

test('command validation defaults to temporary legacy trust mode', () => {
  const validation = createCommandValidation({});
  const result = validation.validate({ command: ADMIN_COMMANDS.SEND_BROADCAST, payload: { text: 'x' } });
  assert.deepEqual(result, { valid: true, mode: 'legacy-trust' });
});
