'use strict';

const { ADMIN_COMMANDS } = require('./adminTypes');

function createAdminPolicies({ state, hasAdminAccess, isSuperAdmin }) {
  const superAdminCommands = new Set([
    ADMIN_COMMANDS.LOCK_ALL_SCREENS,
    ADMIN_COMMANDS.UNLOCK_ALL_SCREENS
  ]);

  function check(command) {
    if (superAdminCommands.has(command)) {
      if (!isSuperAdmin(state.myProfile.role)) return { allowed: false, error: 'Super Admin only.' };
      return { allowed: true };
    }

    if (!hasAdminAccess(state.myProfile.role)) return { allowed: false, error: 'Admin only.' };
    return { allowed: true };
  }

  return { check };
}

module.exports = { createAdminPolicies };
