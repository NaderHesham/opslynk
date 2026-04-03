'use strict';

const ADMIN_COMMANDS = {
  SEND_BROADCAST: 'send_broadcast',
  SEND_FORCED_VIDEO_BROADCAST: 'send_forced_video_broadcast',
  STOP_FORCED_VIDEO_BROADCAST: 'stop_forced_video_broadcast',
  ACK_HELP: 'ack_help',
  LOCK_ALL_SCREENS: 'lock_all_screens',
  UNLOCK_ALL_SCREENS: 'unlock_all_screens',
  EXPORT_PEER_SPECS: 'export_peer_specs',
  SAVE_USER_GROUP: 'save_user_group',
  DELETE_USER_GROUP: 'delete_user_group'
};

function normalizeAdminPayload(command, payload = {}) {
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

  if (command === ADMIN_COMMANDS.SAVE_USER_GROUP) {
    return payload;
  }

  if (command === ADMIN_COMMANDS.DELETE_USER_GROUP) {
    return { id: payload.id };
  }

  return payload;
}

module.exports = {
  ADMIN_COMMANDS,
  normalizeAdminPayload
};
