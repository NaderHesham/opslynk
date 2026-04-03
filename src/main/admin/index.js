'use strict';

const { ADMIN_COMMANDS } = require('./adminTypes');
const { createAdminPolicies } = require('./adminPolicies');
const { createAdminCommands } = require('./adminCommands');
const { createAdminController } = require('./adminController');

function createAdminModule(deps) {
  const policies = createAdminPolicies({
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    isSuperAdmin: deps.isSuperAdmin
  });

  const commands = createAdminCommands(deps);

  const controller = createAdminController({
    commands,
    policies,
    hooks: {
      // Placeholder for future authorization tracing/auditing.
      onDenied: () => {},
      onBeforeExecute: () => {},
      onAfterExecute: () => {}
    }
  });

  return {
    COMMANDS: ADMIN_COMMANDS,
    run: controller.run
  };
}

module.exports = { createAdminModule };
