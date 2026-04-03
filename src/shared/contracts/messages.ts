import type { FileTransferMetadata } from '../types/runtime';

export interface HelloPayload {
  type: 'hello' | 'hello-ack';
  from: {
    id: string;
    username: string;
    role: string;
    port?: number;
    color?: string;
    title?: string;
    avatar?: string | null;
    systemInfo?: Record<string, unknown> | null;
  };
}

export interface ChatPayload {
  type: 'chat';
  fromId: string;
  text?: string;
  emoji?: string;
  msgId: string;
  timestamp: string;
}

export interface ChatFilePayload {
  type: 'chat-file';
  fromId: string;
  msgId: string;
  timestamp: string;
  attachment: FileTransferMetadata;
}

export interface BroadcastMessagePayload {
  type: 'broadcast';
  fromId: string;
  text: string;
  urgency: string;
  durationSeconds: number;
  broadcastId: string;
  timestamp: string;
}

export interface ForcedVideoMessagePayload {
  type: 'forced-video-broadcast';
  fromId: string;
  fromName: string;
  videoB64: string;
  mime: string;
  fileName: string;
  label: string;
  broadcastId: string;
  timestamp: string;
}

export interface ForcedVideoStopPayload {
  type: 'forced-video-broadcast-stop';
  fromId: string;
  broadcastId: string | null;
  timestamp: string;
}

export interface ScreenLockMessagePayload {
  type: 'screen-lock';
  fromId: string;
  message: string;
}

export interface ScreenUnlockMessagePayload {
  type: 'screen-unlock';
  fromId: string;
}

export type P2PControlMessage =
  | HelloPayload
  | ChatPayload
  | ChatFilePayload
  | BroadcastMessagePayload
  | ForcedVideoMessagePayload
  | ForcedVideoStopPayload
  | ScreenLockMessagePayload
  | ScreenUnlockMessagePayload;

