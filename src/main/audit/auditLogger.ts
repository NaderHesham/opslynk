import type { AdminCommand } from '../../shared/contracts/admin';

export interface AuditDeniedEntry {
  command: AdminCommand;
  payload: Record<string, unknown>;
  reason?: string;
}

export interface AuditValidatedEntry {
  command: AdminCommand;
  payload: Record<string, unknown>;
  valid: boolean;
  error?: string;
}

export interface AuditExecutionEntry {
  command: AdminCommand;
  payload: Record<string, unknown>;
  result: unknown;
}

export interface AuditLogger {
  logDenied: (entry: AuditDeniedEntry) => void;
  logValidation: (entry: AuditValidatedEntry) => void;
  logBeforeExecute: (entry: { command: AdminCommand; payload: Record<string, unknown> }) => void;
  logAfterExecute: (entry: AuditExecutionEntry) => void;
}

export function createAuditLogger(): AuditLogger {
  // Structural placeholder only. Real persistence/transport policies will be added in the hardening phase.
  return {
    logDenied: () => {},
    logValidation: () => {},
    logBeforeExecute: () => {},
    logAfterExecute: () => {}
  };
}
