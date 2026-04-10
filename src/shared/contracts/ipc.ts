import type { BroadcastPayload, ExecutePeerDeviceActionPayload, ForcedVideoPayload, LockScreenPayload } from './admin';
import type { ActivityEvent, ActivitySnapshot, FileTransferMetadata, HelpRequest, PeerConnectionState, PeerIdentity } from '../types/runtime';

export const IPC_CHANNELS = {
  app: {
    GET_INIT_DATA: 'get-init-data',
    GET_DEVICE_ID: 'get-device-id',
    SET_SOUND: 'set-sound',
    REPORT_ACTIVITY: 'report-activity',
    GET_SCREENSHOT_POLLING: 'get-screenshot-polling',
    SET_SCREENSHOT_POLLING: 'set-screenshot-polling'
  },
  window: {
    MINIMIZE: 'window-minimize',
    MAXIMIZE: 'window-maximize',
    CLOSE: 'window-close',
    SET_MAIN_MODE: 'window-set-main-mode'
  },
  peer: {
    UPDATE_PROFILE: 'update-profile'
  },
  chat: {
    SEND_CHAT: 'send-chat',
    SEND_FILE_OFFER: 'send-file-offer',
    SELECT_AVATAR: 'select-avatar'
  },
  help: {
    SEND_HELP_REQUEST: 'send-help-request',
    CAPTURE_SCREENSHOT_PREVIEW: 'capture-screenshot-preview',
    ACK_HELP: 'ack-help'
  },
  admin: {
    EXPORT_PEER_SPECS: 'export-peer-specs',
    SAVE_USER_GROUP: 'save-user-group',
    DELETE_USER_GROUP: 'delete-user-group',
    REQUEST_SCREENSHOT: 'request-peer-screenshot',
    EXECUTE_PEER_DEVICE_ACTION: 'execute-peer-device-action'
  },
  broadcast: {
    SEND_BROADCAST: 'send-broadcast',
    SEND_ACK: 'send-ack',
    SEND_REPLY: 'send-broadcast-reply',
    POPUP_CLOSE: 'broadcast-popup-close'
  },
  forcedVideo: {
    SELECT_FILE: 'select-video-broadcast-file',
    SEND: 'send-forced-video-broadcast',
    STOP: 'stop-forced-video-broadcast'
  },
  lockScreen: {
    LOCK_ALL: 'lock-all-screens',
    UNLOCK_ALL: 'unlock-all-screens'
  }
} as const;

export const IPC_EVENTS = {
  URGENT_ACK: 'urgent-ack',
  URGENT_REPLY: 'urgent-reply'
} as const;

export interface ApiSuccess<T = Record<string, unknown>> {
  success: true;
  data?: T;
}

export interface ApiError {
  success: false;
  error: string;
  canceled?: boolean;
}

export type ApiResult<T = Record<string, unknown>> = ApiSuccess<T> | ApiError;

export interface InitDataResponse {
  profile: (PeerIdentity & { soundEnabled?: boolean }) | null;
    peers: Array<{
      id: string;
      username: string;
      role: string;
    deviceId?: string;
    identityFingerprint?: string;
    color?: string;
    title?: string;
    online: boolean;
    connectionState: PeerConnectionState;
    restoredFromState: boolean;
    identityVerified: boolean;
      identityRejected: boolean;
      avatar: string | null;
      systemInfo: Record<string, unknown> | null;
      activityState: 'active' | 'idle' | 'offline';
      lastInputAt: number | null;
      lastStateChangeAt: number | null;
      currentSessionStartedAt: number | null;
      idleThresholdMs: number | null;
      activityEvents: ActivityEvent[];
      latestScreenshot: { capturedAt: number; name?: string | null; size?: number | null; mime?: string | null } | null;
      latestScreenshotRequestedAt: number | null;
      screenshotRequestPending: boolean;
    }>;
  history: Record<string, Array<Record<string, unknown>>>;
  helpRequests: HelpRequest[];
  userGroups: Array<{ id: string; name: string; memberIds: string[] }>;
  hostname: string;
  networkReady: boolean;
  networkOnline: boolean;
}

export interface SendChatRequest {
  peerId: string;
  text?: string;
  emoji?: string;
}

export interface SendChatResponse {
  success: boolean;
  message: {
    id: string;
    fromId: string | undefined;
    text?: string;
    emoji?: string;
    timestamp: string;
    mine: boolean;
  };
}

export interface SendFileOfferRequest {
  peerId: string;
}

export type SendFileOfferResponse =
  | {
      success: boolean;
      message?: {
        id: string;
        fromId: string | undefined;
        timestamp: string;
        mine: boolean;
        attachment: FileTransferMetadata;
      };
      error?: string;
      canceled?: boolean;
    };

export interface SendBroadcastReplyRequest {
  peerId: string;
  text: string;
  broadcastId: string;
}

export interface SendAckRequest {
  peerId: string;
  broadcastId: string;
}

export interface HelpRequestPayload {
  description: string;
  priority: string;
  includeScreenshot: boolean;
}

export interface ScreenshotPollingResponse {
  enabled: boolean;
  mode: 'normal' | 'fast' | 'live';
  pollIntervalMs: number;
  requestCooldownMs: number;
  previewRefreshMs: number;
}

export interface ReportActivityRequest {
  activity: ActivitySnapshot;
  transition?: {
    type: 'active' | 'idle';
    at: number;
  };
}

export interface HelpRequestResponse {
  reqId: string;
  sent: number;
  queued: boolean;
  hasScreenshot: boolean;
}

export type SelectVideoResponse =
  | {
      success: boolean;
      fileName?: string;
      size?: number;
      mime?: string;
      data?: string;
      error?: string;
      canceled?: boolean;
    }
  | ApiError;

export type SelectAvatarResponse =
  | {
      success: boolean;
      avatar?: string;
      error?: string;
      canceled?: boolean;
    }
  | ApiError;

export interface IpcEventMap {
  [IPC_EVENTS.URGENT_ACK]: { peerId: string; broadcastId: string };
  [IPC_EVENTS.URGENT_REPLY]: { peerId: string; text: string; broadcastId: string };
}

export interface IpcChannelMap {
  [IPC_CHANNELS.app.GET_INIT_DATA]: { request: void; response: InitDataResponse };
  [IPC_CHANNELS.app.REPORT_ACTIVITY]: { request: ReportActivityRequest; response: { success: boolean } };
  [IPC_CHANNELS.app.GET_SCREENSHOT_POLLING]: { request: void; response: ScreenshotPollingResponse };
  [IPC_CHANNELS.app.SET_SCREENSHOT_POLLING]: {
    request: { enabled?: boolean; mode?: 'normal' | 'fast' | 'live' };
    response: ScreenshotPollingResponse;
  };
  [IPC_CHANNELS.chat.SEND_CHAT]: { request: SendChatRequest; response: SendChatResponse };
  [IPC_CHANNELS.chat.SEND_FILE_OFFER]: { request: SendFileOfferRequest; response: SendFileOfferResponse };
  [IPC_CHANNELS.broadcast.SEND_BROADCAST]: { request: BroadcastPayload; response: unknown };
  [IPC_CHANNELS.forcedVideo.SELECT_FILE]: { request: void; response: SelectVideoResponse };
  [IPC_CHANNELS.forcedVideo.SEND]: { request: ForcedVideoPayload; response: unknown };
  [IPC_CHANNELS.forcedVideo.STOP]: { request: { broadcastId?: string; peerIds?: string[] | null }; response: unknown };
  [IPC_CHANNELS.broadcast.SEND_ACK]: { request: SendAckRequest; response: void };
  [IPC_CHANNELS.broadcast.SEND_REPLY]: { request: SendBroadcastReplyRequest; response: void };
  [IPC_CHANNELS.help.SEND_HELP_REQUEST]: { request: HelpRequestPayload; response: HelpRequestResponse };
  [IPC_CHANNELS.help.CAPTURE_SCREENSHOT_PREVIEW]: {
    request: void;
    response: { base64: string; name: string; size: number } | null;
  };
  [IPC_CHANNELS.chat.SELECT_AVATAR]: { request: void; response: SelectAvatarResponse };
  [IPC_CHANNELS.help.ACK_HELP]: { request: { peerId: string; reqId: string }; response: unknown };
  [IPC_CHANNELS.admin.EXPORT_PEER_SPECS]: { request: { peerId: string; format?: 'txt' | 'json' }; response: unknown };
  [IPC_CHANNELS.admin.SAVE_USER_GROUP]: {
    request: { id?: string; name: string; memberIds: string[] };
    response: unknown;
  };
  [IPC_CHANNELS.admin.DELETE_USER_GROUP]: { request: { id: string }; response: unknown };
  [IPC_CHANNELS.admin.REQUEST_SCREENSHOT]: { request: { peerId: string }; response: { success: boolean; queued?: boolean; error?: string } };
  [IPC_CHANNELS.admin.EXECUTE_PEER_DEVICE_ACTION]: {
    request: ExecutePeerDeviceActionPayload;
    response: { success: boolean; error?: string; commandId?: string; targetCount?: number };
  };
  [IPC_CHANNELS.peer.UPDATE_PROFILE]: { request: Record<string, unknown>; response: unknown };
  [IPC_CHANNELS.app.GET_DEVICE_ID]: { request: void; response: string | undefined };
  [IPC_CHANNELS.window.MINIMIZE]: { request: void; response: void };
  [IPC_CHANNELS.window.MAXIMIZE]: { request: void; response: void };
  [IPC_CHANNELS.window.CLOSE]: { request: void; response: void };
  [IPC_CHANNELS.window.SET_MAIN_MODE]: { request: void; response: { success: boolean } };
  [IPC_CHANNELS.app.SET_SOUND]: { request: boolean; response: void };
  [IPC_CHANNELS.broadcast.POPUP_CLOSE]: { request: void; response: void };
  [IPC_CHANNELS.lockScreen.LOCK_ALL]: { request: LockScreenPayload; response: unknown };
  [IPC_CHANNELS.lockScreen.UNLOCK_ALL]: { request: void; response: unknown };
}
