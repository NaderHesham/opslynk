import type { BroadcastPayload, ForcedVideoPayload, LockScreenPayload } from './admin';

export interface IpcChannelMap {
  'get-init-data': { request: void; response: Record<string, unknown> };
  'send-chat': { request: { peerId: string; text?: string; emoji?: string }; response: Record<string, unknown> };
  'send-file-offer': { request: { peerId: string }; response: Record<string, unknown> };
  'send-broadcast': { request: BroadcastPayload; response: Record<string, unknown> };
  'send-forced-video-broadcast': { request: ForcedVideoPayload; response: Record<string, unknown> };
  'stop-forced-video-broadcast': { request: { broadcastId?: string; peerIds?: string[] | null }; response: Record<string, unknown> };
  'lock-all-screens': { request: LockScreenPayload; response: Record<string, unknown> };
  'unlock-all-screens': { request: void; response: Record<string, unknown> };
}

