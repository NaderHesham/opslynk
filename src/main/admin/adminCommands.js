'use strict';

const { ADMIN_COMMANDS } = require('./adminTypes');

function createAdminCommands({
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
  path
}) {
  async function execute(command, payload = {}) {
    if (command === ADMIN_COMMANDS.SEND_BROADCAST) {
      const broadcastId = uuidv4();
      const timestamp = new Date().toISOString();
      const targetPeers = helpSvc.getTargetPeers(state.peers, payload.peerIds);
      wsNet.broadcastToSelectedPeers(payload.peerIds, {
        type: 'broadcast',
        fromId: state.myProfile.id,
        text: payload.text,
        urgency: payload.urgency,
        durationSeconds: payload.durationSeconds,
        broadcastId,
        timestamp
      });
      return { broadcastId, targetCount: targetPeers.length };
    }

    if (command === ADMIN_COMMANDS.SEND_FORCED_VIDEO_BROADCAST) {
      if (!payload.videoB64) return { success: false, error: 'No video selected.' };
      const broadcastId = uuidv4();
      const timestamp = new Date().toISOString();
      wsNet.broadcastToSelectedPeers(payload.peerIds, {
        type: 'forced-video-broadcast',
        fromId: state.myProfile.id,
        fromName: state.myProfile.username,
        videoB64: payload.videoB64,
        mime: payload.mime || 'video/mp4',
        fileName: payload.fileName || 'broadcast-video',
        label: payload.label || '',
        broadcastId,
        timestamp
      });
      const targetPeers = helpSvc.getTargetPeers(state.peers, payload.peerIds);
      return { success: true, broadcastId, targetCount: targetPeers.length };
    }

    if (command === ADMIN_COMMANDS.STOP_FORCED_VIDEO_BROADCAST) {
      wsNet.broadcastToSelectedPeers(payload.peerIds, {
        type: 'forced-video-broadcast-stop',
        fromId: state.myProfile.id,
        broadcastId: payload.broadcastId || null,
        timestamp: new Date().toISOString()
      });
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.ACK_HELP) {
      sendToPeer(payload.peerId, { type: 'help-ack', fromId: state.myProfile.id, reqId: payload.reqId });
      const req = state.helpRequests.find((item) => item.reqId === payload.reqId);
      if (req) req.status = 'acked';
      closeHelpPopup(payload.reqId);
      doSaveState();
      showMainWindow();
      setTimeout(() => {
        bus.emit(EVENTS.GOTO_TAB, 'help');
        bus.emit(EVENTS.FOCUS_HELP, { reqId: payload.reqId });
      }, 250);
      updateTrayMenu();
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.LOCK_ALL_SCREENS) {
      const message = String(payload.message || '').trim() || 'Your screen has been locked by the administrator.';
      broadcastToPeers({ type: 'screen-lock', fromId: state.myProfile.id, message });
      return { success: true, targetCount: state.peers.size };
    }

    if (command === ADMIN_COMMANDS.UNLOCK_ALL_SCREENS) {
      broadcastToPeers({ type: 'screen-unlock', fromId: state.myProfile.id });
      return { success: true };
    }

    if (command === ADMIN_COMMANDS.EXPORT_PEER_SPECS) {
      const peer = state.peers.get(payload.peerId);
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
      const memberIds = [...new Set(Array.isArray(payload?.memberIds) ? payload.memberIds.filter(Boolean) : [])];
      if (!name) return { success: false, error: 'Group name is required.' };
      const duplicate = state.userGroups.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== payload?.id);
      if (duplicate) return { success: false, error: 'A group with this name already exists.' };
      const id = payload?.id || uuidv4();
      const next = { id, name, memberIds };
      const idx = state.userGroups.findIndex((item) => item.id === id);
      if (idx >= 0) state.userGroups[idx] = next;
      else state.userGroups.push(next);
      state.userGroups.sort((a, b) => a.name.localeCompare(b.name));
      doSaveState();
      return { success: true, groups: state.userGroups };
    }

    if (command === ADMIN_COMMANDS.DELETE_USER_GROUP) {
      state.userGroups = state.userGroups.filter((group) => group.id !== payload.id);
      doSaveState();
      return { success: true, groups: state.userGroups };
    }

    return { success: false, error: 'Unknown admin command.' };
  }

  return { execute };
}

module.exports = { createAdminCommands };
