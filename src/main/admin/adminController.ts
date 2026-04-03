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
  authorization?: {
    authorize: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => { allowed: boolean; error?: string };
  };
  validation?: {
    validate: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => { valid: boolean; error?: string };
  };
  auditLogger?: {
    logDenied: (entry: { command: AdminCommand; payload: Record<string, unknown>; reason?: string }) => void;
    logValidation: (entry: { command: AdminCommand; payload: Record<string, unknown>; valid: boolean; error?: string }) => void;
    logAuthorization: (entry: { command: AdminCommand; payload: Record<string, unknown>; allowed: boolean; error?: string }) => void;
    logBeforeExecute: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => void;
    logAfterExecute: (entry: { command: AdminCommand; payload: Record<string, unknown>; result: unknown }) => void;
  };
  hooks?: Hooks;
}

export function createAdminController({
  commands,
  policies,
  hooks = {},
  authorization = {
    authorize: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => policies.check(entry.command, entry.payload)
  },
  validation = {
    validate: () => ({ valid: true })
  },
  auditLogger = {
    logDenied: () => {},
    logValidation: () => {},
    logAuthorization: () => {},
    logBeforeExecute: () => {},
    logAfterExecute: () => {}
  }
}: ControllerDeps): {
  run: (command: AdminCommand, payload?: Record<string, unknown>) => Promise<unknown>;
} {
  const onDenied = hooks.onDenied || (() => {});
  const onBeforeExecute = hooks.onBeforeExecute || (() => {});
  const onAfterExecute = hooks.onAfterExecute || (() => {});

  async function run(command: AdminCommand, payload: Record<string, unknown> = {}): Promise<unknown> {
    const normalizedPayload = normalizeAdminPayload(command, payload);
    const validationResult = validation.validate({ command, payload: normalizedPayload });
    auditLogger.logValidation({ command, payload: normalizedPayload, valid: validationResult.valid, error: validationResult.error });
    if (!validationResult.valid) {
      onDenied({ command, payload: normalizedPayload, reason: validationResult.error });
      auditLogger.logDenied({ command, payload: normalizedPayload, reason: validationResult.error });
      return { success: false, error: validationResult.error };
    }

    const policy = authorization.authorize({ command, payload: normalizedPayload });
    auditLogger.logAuthorization({ command, payload: normalizedPayload, allowed: policy.allowed, error: policy.error });
    if (!policy.allowed) {
      onDenied({ command, payload: normalizedPayload, reason: policy.error });
      auditLogger.logDenied({ command, payload: normalizedPayload, reason: policy.error });
      return { success: false, error: policy.error };
    }

    onBeforeExecute({ command, payload: normalizedPayload });
    auditLogger.logBeforeExecute({ command, payload: normalizedPayload });
    const result = await commands.execute(command, normalizedPayload);
    onAfterExecute({ command, payload: normalizedPayload, result });
    auditLogger.logAfterExecute({ command, payload: normalizedPayload, result });
    return result;
  }

  return { run };
}
