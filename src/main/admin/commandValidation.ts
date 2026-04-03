import type { AdminCommand } from '../../shared/contracts/admin';
import { ADMIN_COMMANDS } from './adminTypes';

export interface ValidationRequest {
  command: AdminCommand;
  payload: Record<string, unknown>;
}

export interface ValidationDecision {
  valid: boolean;
  error?: string;
  mode: 'validator-map' | 'legacy-trust' | 'hard-deny';
}

interface ValidationDeps {
  validators?: Partial<Record<AdminCommand, (payload: Record<string, unknown>) => { valid: boolean; error?: string }>>;
}

const SENSITIVE_COMMANDS = new Set<AdminCommand>([
  ADMIN_COMMANDS.SEND_BROADCAST,
  ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST,
  ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST,
  ADMIN_COMMANDS.LOCK_ALL_SCREENS,
  ADMIN_COMMANDS.UNLOCK_ALL_SCREENS,
  ADMIN_COMMANDS.ACK_HELP,
  ADMIN_COMMANDS.EXPORT_PEER_SPECS,
  ADMIN_COMMANDS.SAVE_USER_GROUP,
  ADMIN_COMMANDS.DELETE_USER_GROUP
]);

function isSensitiveCommand(command: AdminCommand): boolean {
  return SENSITIVE_COMMANDS.has(command);
}

function asStringArrayOrNull(value: unknown): string[] | null | undefined {
  if (value == null) return null;
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) return undefined;
  }
  return value;
}

function hasValidPeerIds(payload: Record<string, unknown>): boolean {
  const peerIds = asStringArrayOrNull(payload.peerIds);
  return peerIds !== undefined;
}

function toSafeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function createAdminCommandValidators(): Partial<Record<AdminCommand, (payload: Record<string, unknown>) => { valid: boolean; error?: string }>> {
  return {
    [ADMIN_COMMANDS.SEND_BROADCAST]: (payload) => {
      if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
        return { valid: false, error: 'Broadcast text is required.' };
      }
      if (payload.text.length > 5000) return { valid: false, error: 'Broadcast text is too long.' };
      if (payload.urgency !== 'normal' && payload.urgency !== 'urgent') {
        return { valid: false, error: 'Invalid urgency value.' };
      }
      const duration = toSafeNumber(payload.durationSeconds);
      if (duration == null || duration < 1 || duration > 3600) {
        return { valid: false, error: 'Invalid broadcast duration.' };
      }
      if (!hasValidPeerIds(payload)) return { valid: false, error: 'Invalid peer target list.' };
      return { valid: true };
    },
    [ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST]: (payload) => {
      if (typeof payload.videoB64 !== 'string' || payload.videoB64.length === 0) {
        return { valid: false, error: 'No video selected.' };
      }
      if (payload.videoB64.length > 60 * 1024 * 1024) {
        return { valid: false, error: 'Video payload is too large.' };
      }
      if (payload.mime != null && (typeof payload.mime !== 'string' || !payload.mime.startsWith('video/'))) {
        return { valid: false, error: 'Invalid video mime type.' };
      }
      if (payload.fileName != null && (typeof payload.fileName !== 'string' || payload.fileName.trim().length === 0 || payload.fileName.length > 255)) {
        return { valid: false, error: 'Invalid video file name.' };
      }
      if (payload.label != null && (typeof payload.label !== 'string' || payload.label.length > 120)) {
        return { valid: false, error: 'Invalid video label.' };
      }
      if (!hasValidPeerIds(payload)) return { valid: false, error: 'Invalid peer target list.' };
      return { valid: true };
    },
    [ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST]: (payload) => {
      if (payload.broadcastId != null && typeof payload.broadcastId !== 'string') {
        return { valid: false, error: 'Invalid broadcast id.' };
      }
      if (!hasValidPeerIds(payload)) return { valid: false, error: 'Invalid peer target list.' };
      return { valid: true };
    },
    [ADMIN_COMMANDS.LOCK_ALL_SCREENS]: (payload) => {
      if (payload.message != null && (typeof payload.message !== 'string' || payload.message.length > 5000)) {
        return { valid: false, error: 'Invalid lock-screen message.' };
      }
      return { valid: true };
    },
    [ADMIN_COMMANDS.UNLOCK_ALL_SCREENS]: () => ({ valid: true }),
    [ADMIN_COMMANDS.ACK_HELP]: (payload) => {
      if (typeof payload.peerId !== 'string' || payload.peerId.trim().length === 0) return { valid: false, error: 'Invalid peer id.' };
      if (typeof payload.reqId !== 'string' || payload.reqId.trim().length === 0) return { valid: false, error: 'Invalid request id.' };
      return { valid: true };
    },
    [ADMIN_COMMANDS.EXPORT_PEER_SPECS]: (payload) => {
      if (typeof payload.peerId !== 'string' || payload.peerId.trim().length === 0) return { valid: false, error: 'Invalid peer id.' };
      if (payload.format !== 'txt' && payload.format !== 'json') return { valid: false, error: 'Invalid export format.' };
      return { valid: true };
    },
    [ADMIN_COMMANDS.SAVE_USER_GROUP]: (payload) => {
      if (typeof payload.name !== 'string' || payload.name.trim().length === 0 || payload.name.length > 120) {
        return { valid: false, error: 'Invalid group name.' };
      }
      if (!Array.isArray(payload.memberIds)) return { valid: false, error: 'Invalid group member list.' };
      for (const id of payload.memberIds) {
        if (typeof id !== 'string' || id.trim().length === 0) return { valid: false, error: 'Invalid group member list.' };
      }
      if (payload.id != null && (typeof payload.id !== 'string' || payload.id.trim().length === 0)) {
        return { valid: false, error: 'Invalid group id.' };
      }
      return { valid: true };
    },
    [ADMIN_COMMANDS.DELETE_USER_GROUP]: (payload) => {
      if (typeof payload.id !== 'string' || payload.id.trim().length === 0) return { valid: false, error: 'Invalid group id.' };
      return { valid: true };
    }
  };
}

export function createCommandValidation({ validators = {} }: ValidationDeps): {
  validate: (request: ValidationRequest) => ValidationDecision;
} {
  function validate(request: ValidationRequest): ValidationDecision {
    const validator = validators[request.command];
    if (!validator) {
      if (isSensitiveCommand(request.command)) {
        return { valid: false, error: 'Validation rules are not configured.', mode: 'hard-deny' };
      }
      // Transitional behavior for non-sensitive commands only.
      return { valid: true, mode: 'legacy-trust' };
    }
    const result = validator(request.payload);
    return { valid: result.valid, error: result.error, mode: 'validator-map' };
  }

  return { validate };
}
