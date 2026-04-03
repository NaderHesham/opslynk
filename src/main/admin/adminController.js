'use strict';

const { normalizeAdminPayload } = require('./adminTypes');

function createAdminController({
  commands,
  policies,
  hooks = {}
}) {
  const onDenied = hooks.onDenied || (() => {});
  const onBeforeExecute = hooks.onBeforeExecute || (() => {});
  const onAfterExecute = hooks.onAfterExecute || (() => {});

  async function run(command, payload = {}) {
    const normalizedPayload = normalizeAdminPayload(command, payload);
    const policy = policies.check(command, normalizedPayload);
    if (!policy.allowed) {
      onDenied({ command, payload: normalizedPayload, reason: policy.error });
      return { success: false, error: policy.error };
    }

    onBeforeExecute({ command, payload: normalizedPayload });
    const result = await commands.execute(command, normalizedPayload);
    onAfterExecute({ command, payload: normalizedPayload, result });
    return result;
  }

  return { run };
}

module.exports = { createAdminController };
