export const ADMIN_COMMANDS = {
  SEND_BROADCAST: 'send_broadcast',
  SEND_FORCED_VIDEO_BROADCAST: 'send_forced_video_broadcast',
  STOP_FORCED_VIDEO_BROADCAST: 'stop_forced_video_broadcast',
  ACK_HELP: 'ack_help',
  LOCK_ALL_SCREENS: 'lock_all_screens',
  UNLOCK_ALL_SCREENS: 'unlock_all_screens',
  EXPORT_PEER_SPECS: 'export_peer_specs',
  SAVE_USER_GROUP: 'save_user_group',
  DELETE_USER_GROUP: 'delete_user_group'
} as const;

export type AdminCommand = typeof ADMIN_COMMANDS[keyof typeof ADMIN_COMMANDS];

export interface BroadcastPayload {
  text: string;
  urgency: string;
  durationSeconds: number;
  peerIds?: string[] | null;
}

export interface ForcedVideoPayload {
  videoB64: string;
  mime?: string;
  fileName?: string;
  label?: string;
  peerIds?: string[] | null;
}

export interface LockScreenPayload {
  message?: string;
}

