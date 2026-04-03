import { ADMIN_COMMANDS as SHARED_ADMIN_COMMANDS, type AdminCommand } from '../../shared/contracts/admin';

export const ADMIN_COMMANDS = SHARED_ADMIN_COMMANDS;

export function normalizeAdminPayload(command: AdminCommand, payload: Record<string, unknown> = {}): Record<string, unknown> {
  if (command === ADMIN_COMMANDS.SEND_BROADCAST) {
    return {
      text: payload.text,
      urgency: payload.urgency,
      durationSeconds: payload.durationSeconds,
      peerIds: payload.peerIds ?? null
    };
  }

  if (command === ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST) {
    return {
      videoB64: payload.videoB64,
      mime: payload.mime,
      fileName: payload.fileName,
      label: payload.label,
      peerIds: payload.peerIds ?? null
    };
  }

  if (command === ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST) {
    return {
      broadcastId: payload.broadcastId,
      peerIds: payload.peerIds ?? null
    };
  }

  if (command === ADMIN_COMMANDS.ACK_HELP) {
    return { peerId: payload.peerId, reqId: payload.reqId };
  }

  if (command === ADMIN_COMMANDS.LOCK_ALL_SCREENS) {
    return { message: payload.message };
  }

  if (command === ADMIN_COMMANDS.EXPORT_PEER_SPECS) {
    return { peerId: payload.peerId, format: payload.format || 'txt' };
  }

  if (command === ADMIN_COMMANDS.SAVE_USER_GROUP) return payload;
  if (command === ADMIN_COMMANDS.DELETE_USER_GROUP) return { id: payload.id };
  return payload;
}

