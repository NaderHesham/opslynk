import type { AdminCommand } from '../../shared/contracts/admin';
import { normalizeAdminPayload } from './adminTypes';

interface Hooks {
  onDenied?: (entry: { command: AdminCommand; payload: Record<string, unknown>; reason?: string }) => void;
  onBeforeExecute?: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => void;
  onAfterExecute?: (entry: { command: AdminCommand; payload: Record<string, unknown>; result: unknown }) => void;
}

interface ControllerDeps {
  commands: { execute: (command: AdminCommand, payload: Record<string, unknown>) => Promise<unknown> };
  policies: { check: (command: AdminCommand, payload?: Record<string, unknown>) => { allowed: boolean; error?: string } };
  hooks?: Hooks;
}

export function createAdminController({ commands, policies, hooks = {} }: ControllerDeps): {
  run: (command: AdminCommand, payload?: Record<string, unknown>) => Promise<unknown>;
} {
  const onDenied = hooks.onDenied || (() => {});
  const onBeforeExecute = hooks.onBeforeExecute || (() => {});
  const onAfterExecute = hooks.onAfterExecute || (() => {});

  async function run(command: AdminCommand, payload: Record<string, unknown> = {}): Promise<unknown> {
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

