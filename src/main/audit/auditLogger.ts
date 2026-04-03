import type { AdminCommand } from '../../shared/contracts/admin';
import { ADMIN_COMMANDS } from '../admin/adminTypes';

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
  getEntries: () => ReadonlyArray<Record<string, unknown>>;
}

interface AuditLoggerDeps {
  maxEntries?: number;
  onEntry?: (entry: Record<string, unknown>) => void;
}

function summarizePayload(command: AdminCommand, payload: Record<string, unknown>): Record<string, unknown> {
  if (command === ADMIN_COMMANDS.SEND_BROADCAST) {
    return {
      textLength: typeof payload.text === 'string' ? payload.text.length : 0,
      urgency: payload.urgency,
      durationSeconds: payload.durationSeconds,
      peerTargetCount: Array.isArray(payload.peerIds) ? payload.peerIds.length : null
    };
  }
  if (command === ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST) {
    return {
      hasVideo: typeof payload.videoB64 === 'string' && payload.videoB64.length > 0,
      videoB64Length: typeof payload.videoB64 === 'string' ? payload.videoB64.length : 0,
      mime: payload.mime,
      fileName: payload.fileName,
      labelLength: typeof payload.label === 'string' ? payload.label.length : 0,
      peerTargetCount: Array.isArray(payload.peerIds) ? payload.peerIds.length : null
    };
  }
  if (command === ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST) {
    return {
      hasBroadcastId: typeof payload.broadcastId === 'string' && payload.broadcastId.length > 0,
      peerTargetCount: Array.isArray(payload.peerIds) ? payload.peerIds.length : null
    };
  }
  if (command === ADMIN_COMMANDS.LOCK_ALL_SCREENS) {
    return { messageLength: typeof payload.message === 'string' ? payload.message.length : 0 };
  }
  if (command === ADMIN_COMMANDS.UNLOCK_ALL_SCREENS) return {};
  if (command === ADMIN_COMMANDS.ACK_HELP) return { peerId: payload.peerId, reqId: payload.reqId };
  if (command === ADMIN_COMMANDS.EXPORT_PEER_SPECS) return { peerId: payload.peerId, format: payload.format };
  if (command === ADMIN_COMMANDS.SAVE_USER_GROUP) {
    return {
      id: payload.id,
      nameLength: typeof payload.name === 'string' ? payload.name.length : 0,
      memberCount: Array.isArray(payload.memberIds) ? payload.memberIds.length : 0
    };
  }
  if (command === ADMIN_COMMANDS.DELETE_USER_GROUP) return { id: payload.id };
  return { keys: Object.keys(payload) };
}

export function createAuditLogger({ maxEntries = 500, onEntry }: AuditLoggerDeps = {}): AuditLogger {
  const entries: Record<string, unknown>[] = [];
  const append = (entry: Record<string, unknown>): void => {
    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();
    if (onEntry) queueMicrotask(() => onEntry(entry));
  };

  return {
    logDenied: (entry) => {
      append({
        timestamp: new Date().toISOString(),
        type: 'admin-denied',
        command: entry.command,
        reason: entry.reason || null,
        payload: summarizePayload(entry.command, entry.payload)
      });
    },
    logValidation: (entry) => {
      append({
        timestamp: new Date().toISOString(),
        type: 'admin-validation',
        command: entry.command,
        valid: entry.valid,
        error: entry.error || null,
        payload: summarizePayload(entry.command, entry.payload)
      });
    },
    logBeforeExecute: (entry) => {
      append({
        timestamp: new Date().toISOString(),
        type: 'admin-before-execute',
        command: entry.command,
        payload: summarizePayload(entry.command, entry.payload)
      });
    },
    logAfterExecute: (entry) => {
      append({
        timestamp: new Date().toISOString(),
        type: 'admin-after-execute',
        command: entry.command,
        result: typeof entry.result === 'object' && entry.result !== null
          ? { ...(entry.result as Record<string, unknown>) }
          : { value: entry.result },
        payload: summarizePayload(entry.command, entry.payload)
      });
    },
    getEntries: () => entries
  };
}
