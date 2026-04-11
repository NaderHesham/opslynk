import type { FileTransferMetadata } from '../types/runtime';

export interface HelloPayload {
  type: 'hello' | 'hello-ack';
  from: {
    id: string;
    username: string;
    role: string;
    deviceId?: string;
    port?: number;
    publicKey?: string;
    identityFingerprint?: string;
    signedAt?: string;
    signature?: string;
    color?: string;
    title?: string;
    avatar?: string | null;
    systemInfo?: Record<string, unknown> | null;
    controlState?: {
      lockActive: boolean;
      videoActive: boolean;
      updatedAt?: number | null;
    };
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
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
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
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
}

export interface ForcedVideoStopPayload {
  type: 'forced-video-broadcast-stop';
  fromId: string;
  broadcastId: string | null;
  timestamp: string;
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
}

export interface ScreenLockMessagePayload {
  type: 'screen-lock';
  fromId: string;
  message: string;
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
}

export interface ScreenUnlockMessagePayload {
  type: 'screen-unlock';
  fromId: string;
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
}

export interface DeviceCommandPayload {
  type: 'device-command';
  fromId: string;
  commandId: string;
  action: 'lock_device' | 'unlock_device' | 'restart_device' | 'shutdown_device' | 'signout_device' | 'clean_temp' | 'flush_dns' | 'run_script';
  script?: string;
  timestamp: string;
  origin?: {
    issuerId: string;
    issuerDeviceId: string;
    issuerRole: string;
    issuedAt: string;
    commandType: string;
  };
}

export interface DeviceCommandResultPayload {
  type: 'device-command-result';
  fromId: string;
  commandId: string;
  action: string;
  success: boolean;
  message?: string;
}

export type P2PControlMessage =
  | HelloPayload
  | ChatPayload
  | ChatFilePayload
  | BroadcastMessagePayload
  | ForcedVideoMessagePayload
  | ForcedVideoStopPayload
  | ScreenLockMessagePayload
  | ScreenUnlockMessagePayload
  | DeviceCommandPayload
  | DeviceCommandResultPayload;
