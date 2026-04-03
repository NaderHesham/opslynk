import type { AdminRuntimeState, AppRuntimeState } from '../../shared/types/runtime';
import type { AdminCommand } from '../../shared/contracts/admin';
import type { CommandOrigin } from '../security/deviceTrust';
import { ADMIN_COMMANDS } from './adminTypes';

interface AdminCommandDeps {
  state: AdminRuntimeState;
  wsNet: { broadcastToSelectedPeers: (peerIds: string[] | null | undefined, payload: Record<string, unknown>) => void };
  helpSvc: {
    getTargetPeers: (peers: AppRuntimeState['peers'], peerIds: string[] | null | undefined) => unknown[];
    getPeerExportPayload: (peer: unknown) => unknown;
    formatPeerSpecsText: (peer: unknown) => string;
  };
  sendToPeer: (peerId: string, payload: Record<string, unknown>) => void;
  broadcastToPeers: (payload: Record<string, unknown>) => void;
  doSaveState: () => void;
  updateTrayMenu: () => void;
  showMainWindow: () => void;
  closeHelpPopup: (reqId: string) => void;
  bus: { emit: (event: string, payload?: unknown) => void };
  EVENTS: { GOTO_TAB: string; FOCUS_HELP: string };
  uuidv4: () => string;
  app: { getPath: (name: string) => string };
  dialog: { showSaveDialog: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }> };
  fs: { writeFileSync: (path: string, content: string, enc: BufferEncoding) => void };
  path: { join: (...parts: string[]) => string };
  buildCommandOrigin: (commandType: string) => CommandOrigin;
}

export function createAdminCommands(deps: AdminCommandDeps): {
  execute: (command: AdminCommand, payload?: Record<string, unknown>) => Promise<unknown>;
} {
  const {
    state,
    wsNet,
    helpSvc,
    sendToPeer,
    broadcastToPeers,
    doSaveState,
    updateTrayMenu,
    showMainWindow,
    closeHelpPopup,
    bus,
    EVENTS,
    uuidv4,
    app,
    dialog,
    fs,
    path,
    buildCommandOrigin
  } = deps;

  async function execute(command: AdminCommand, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (command === ADMIN_COMMANDS.SEND_BROADCAST) {
      const broadcastId = uuidv4();
      const timestamp = new Date().toISOString();
      const peerIds = (payload.peerIds as string[] | null | undefined) ?? null;
      const targetPeers = helpSvc.getTargetPeers(state.peers, peerIds);
      wsNet.broadcastToSelectedPeers(peerIds, {
        type: 'broadcast',
        fromId: state.myProfile?.id,
        text: payload.text,
        urgency: payload.urgency,
        durationSeconds: payload.durationSeconds,
        broadcastId,
        timestamp,
        origin: buildCommandOrigin('broadcast')
      });
      return { broadcastId, targetCount: targetPeers.length };
    }

    if (command === ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST) {
      if (!payload.videoB64) return { success: false, error: 'No video selected.' };
      const broadcastId = uuidv4();
      const timestamp = new Date().toISOString();
      const peerIds = (payload.peerIds as string[] | null | undefined) ?? null;
      wsNet.broadcastToSelectedPeers(peerIds, {
        type: 'forced-video-broadcast',
        fromId: state.myProfile?.id,
        fromName: state.myProfile?.username,
        videoB64: payload.videoB64,
        mime: payload.mime || 'video/mp4',
        fileName: payload.fileName || 'broadcast-video',
        label: payload.label || '',
        broadcastId,
        timestamp,
        origin: buildCommandOrigin('forced-video-broadcast')
      });
      const targetPeers = helpSvc.getTargetPeers(state.peers, peerIds);
      return { success: true, broadcastId, targetCount: targetPeers.length };
    }

    if (command === ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST) {
      const peerIds = (payload.peerIds as string[] | null | undefined) ?? null;
      wsNet.broadcastToSelectedPeers(peerIds, {
        type: 'forced-video-broadcast-stop',
        fromId: state.myProfile?.id,
        broadcastId: payload.broadcastId || null,
        timestamp: new Date().toISOString(),
        origin: buildCommandOrigin('forced-video-broadcast-stop')
      });
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.ACK_HELP) {
      const peerId = String(payload.peerId || '');
      const reqId = String(payload.reqId || '');
      sendToPeer(peerId, { type: 'help-ack', fromId: state.myProfile?.id, reqId });
      const req = state.helpRequests.find((item) => item.reqId === reqId);
      if (req) req.status = 'acked';
      closeHelpPopup(reqId);
      doSaveState();
      showMainWindow();
      setTimeout(() => {
        bus.emit(EVENTS.GOTO_TAB, 'help');
        bus.emit(EVENTS.FOCUS_HELP, { reqId });
      }, 250);
      updateTrayMenu();
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.LOCK_ALL_SCREENS) {
      const message = String(payload.message || '').trim() || 'Your screen has been locked by the administrator.';
      broadcastToPeers({ type: 'screen-lock', fromId: state.myProfile?.id, message, origin: buildCommandOrigin('screen-lock') });
      return { success: true, targetCount: state.peers.size };
    }

    if (command === ADMIN_COMMANDS.UNLOCK_ALL_SCREENS) {
      broadcastToPeers({ type: 'screen-unlock', fromId: state.myProfile?.id, origin: buildCommandOrigin('screen-unlock') });
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.EXPORT_PEER_SPECS) {
      const peer = state.peers.get(String(payload.peerId || ''));
      if (!peer) return { success: false, error: 'Peer not found.' };
      const safeFormat = payload.format === 'json' ? 'json' : 'txt';
      const defaultPath = path.join(app.getPath('documents'), `${(peer.username || 'user').replace(/[^\w.-]+/g, '_')}-specs.${safeFormat}`);
      const result = await dialog.showSaveDialog({
        title: 'Export user specs',
        defaultPath,
        filters: safeFormat === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'Text', extensions: ['txt'] }]
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      const content = safeFormat === 'json'
        ? JSON.stringify(helpSvc.getPeerExportPayload(peer), null, 2)
        : helpSvc.formatPeerSpecsText(peer);
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, path: result.filePath };
    }

    if (command === ADMIN_COMMANDS.SAVE_USER_GROUP) {
      const name = String(payload?.name || '').trim();
      const rawMemberIds = Array.isArray(payload?.memberIds) ? payload.memberIds : [];
      const memberIds = [...new Set(rawMemberIds.filter(Boolean) as string[])];
      if (!name) return { success: false, error: 'Group name is required.' };
      const duplicate = state.userGroups.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== payload?.id);
      if (duplicate) return { success: false, error: 'A group with this name already exists.' };
      const id = String(payload?.id || uuidv4());
      const next = { id, name, memberIds };
      const idx = state.userGroups.findIndex((item) => item.id === id);
      if (idx >= 0) state.userGroups[idx] = next;
      else state.userGroups.push(next);
      state.userGroups.sort((a, b) => a.name.localeCompare(b.name));
      doSaveState();
      return { success: true, groups: state.userGroups };
    }

    if (command === ADMIN_COMMANDS.DELETE_USER_GROUP) {
      const id = String(payload.id || '');
      state.userGroups = state.userGroups.filter((group) => group.id !== id);
      doSaveState();
      return { success: true, groups: state.userGroups };
    }

    return { success: false, error: 'Unknown admin command.' };
  }

  return { execute };
}
