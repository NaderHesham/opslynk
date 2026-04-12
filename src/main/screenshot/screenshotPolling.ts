import type { PeerSession, SessionRuntimeState } from '../../shared/types/runtime';

const POLL_INTERVAL_MS = 1000;
const STUCK_PENDING_MS = 15_000;
const MODES = {
  normal: { requestCooldownMs: 5000, previewRefreshMs: 5000 },
  fast: { requestCooldownMs: 3000, previewRefreshMs: 3000 },
  live: { requestCooldownMs: 1000, previewRefreshMs: 1000 }
} as const;

export type ScreenshotPollingMode = keyof typeof MODES;
export interface ScreenshotPollingSnapshot {
  enabled: boolean;
  mode: ScreenshotPollingMode;
  pollIntervalMs: number;
  requestCooldownMs: number;
  previewRefreshMs: number;
}

interface ScreenshotPollingDeps {
  state: SessionRuntimeState;
  sendToPeer: (peerId: string, payload: Record<string, unknown>) => void;
  hasAdminAccess: (role: string | undefined) => boolean;
  uuidv4: () => string;
  broadcastToRenderer: (event: string, payload: unknown) => void;
  peerToSafe: (peer: PeerSession) => unknown;
}

export function createScreenshotPollingManager({
  state,
  sendToPeer,
  hasAdminAccess,
  uuidv4,
  broadcastToRenderer,
  peerToSafe
}: ScreenshotPollingDeps): {
  start: () => void;
  stop: () => void;
  setEnabled: (enabled: boolean) => ScreenshotPollingSnapshot;
  setMode: (mode: ScreenshotPollingMode) => ScreenshotPollingSnapshot;
  getSnapshot: () => ScreenshotPollingSnapshot;
} {
  let timer: NodeJS.Timeout | null = null;
  let enabled = false;
  let mode: ScreenshotPollingMode = 'normal';

  function getSnapshot(): ScreenshotPollingSnapshot {
    return {
      enabled,
      mode,
      pollIntervalMs: POLL_INTERVAL_MS,
      requestCooldownMs: MODES[mode].requestCooldownMs,
      previewRefreshMs: MODES[mode].previewRefreshMs
    };
  }

  function broadcastSnapshot(): void {
    broadcastToRenderer('screenshot:polling', getSnapshot());
  }

  function shouldPollPeer(peer: SessionRuntimeState['peers'] extends Map<string, infer T> ? T : never, now: number): boolean {
    if (!peer) return false;
    if (!peer.online || peer.connectionState !== 'connected') return false;
    if (peer.restoredFromState) return false;
    if (hasAdminAccess(peer.role)) return false;
    if (peer.screenshotRequestPending) {
      const pendingSince = Number(peer.latestScreenshotRequestedAt || 0);
      if (!pendingSince || (now - pendingSince) < STUCK_PENDING_MS) return false;
      // Recover from dropped/late responses so preview polling does not stall forever.
      peer.screenshotRequestPending = false;
      (peer as unknown as { latestScreenshotRequestReason?: string }).latestScreenshotRequestReason = '';
      broadcastToRenderer('system:deviceUpdated', peerToSafe(peer));
    }
    const lastRequestedAt = Number(peer.latestScreenshotRequestedAt || 0);
    if (lastRequestedAt && now - lastRequestedAt < MODES[mode].requestCooldownMs) return false;
    const lastCapturedAt = Number(peer.latestScreenshot?.capturedAt || 0);
    return !lastCapturedAt || (now - lastCapturedAt) >= MODES[mode].previewRefreshMs;
  }

  function requestNextPreview(): void {
    if (!enabled) return;
    const now = Date.now();
    const candidates = [...state.peers.values()].filter((peer) => shouldPollPeer(peer, now));
    if (!candidates.length) return;
    candidates.sort((a, b) => Number(a.latestScreenshotRequestedAt || 0) - Number(b.latestScreenshotRequestedAt || 0));
    const peer = candidates[0];
    peer.screenshotRequestPending = true;
    peer.latestScreenshotRequestedAt = now;
    (peer as unknown as { latestScreenshotRequestReason?: string }).latestScreenshotRequestReason = 'preview-poll';
    sendToPeer(peer.id, {
      type: 'screenshot-request',
      fromId: state.myProfile?.id,
      reqId: uuidv4(),
      reason: 'preview-poll'
    });
    broadcastToRenderer('system:deviceUpdated', peerToSafe(peer));
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(requestNextPreview, POLL_INTERVAL_MS);
    broadcastSnapshot();
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    broadcastSnapshot();
  }

  function setEnabled(nextEnabled: boolean): ScreenshotPollingSnapshot {
    enabled = !!nextEnabled;
    broadcastSnapshot();
    return getSnapshot();
  }

  function setMode(nextMode: ScreenshotPollingMode): ScreenshotPollingSnapshot {
    mode = nextMode === 'live' ? 'live' : (nextMode === 'fast' ? 'fast' : 'normal');
    broadcastSnapshot();
    return getSnapshot();
  }

  return { start, stop, setEnabled, setMode, getSnapshot };
}
