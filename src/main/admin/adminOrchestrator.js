'use strict';

function createAdminOrchestrator({
  state,
  wsNet,
  helpSvc,
  hasAdminAccess,
  isSuperAdmin,
  sendToPeer,
  broadcastToPeers,
  doSaveState,
  updateTrayMenu,
  showMainWindow,
  closeHelpPopup,
  bus,
  EVENTS,
  uuidv4
}) {
  function sendBroadcast({ text, urgency, durationSeconds, peerIds = null }) {
    if (!hasAdminAccess(state.myProfile.role)) return { success: false, error: 'Admin only.' };
    const broadcastId = uuidv4();
    const timestamp = new Date().toISOString();
    const targetPeers = helpSvc.getTargetPeers(state.peers, peerIds);
    wsNet.broadcastToSelectedPeers(peerIds, {
      type: 'broadcast',
      fromId: state.myProfile.id,
      text,
      urgency,
      durationSeconds,
      broadcastId,
      timestamp
    });
    return { broadcastId, targetCount: targetPeers.length };
  }

  function sendForcedVideoBroadcast({ videoB64, mime, fileName, label, peerIds = null }) {
    if (!hasAdminAccess(state.myProfile.role)) return { success: false, error: 'Admin only.' };
    if (!videoB64) return { success: false, error: 'No video selected.' };
    const broadcastId = uuidv4();
    const timestamp = new Date().toISOString();
    wsNet.broadcastToSelectedPeers(peerIds, {
      type: 'forced-video-broadcast',
      fromId: state.myProfile.id,
      fromName: state.myProfile.username,
      videoB64,
      mime: mime || 'video/mp4',
      fileName: fileName || 'broadcast-video',
      label: label || '',
      broadcastId,
      timestamp
    });
    const targetPeers = helpSvc.getTargetPeers(state.peers, peerIds);
    return { success: true, broadcastId, targetCount: targetPeers.length };
  }

  function stopForcedVideoBroadcast({ broadcastId, peerIds = null } = {}) {
    if (!hasAdminAccess(state.myProfile.role)) return { success: false, error: 'Admin only.' };
    wsNet.broadcastToSelectedPeers(peerIds, {
      type: 'forced-video-broadcast-stop',
      fromId: state.myProfile.id,
      broadcastId: broadcastId || null,
      timestamp: new Date().toISOString()
    });
    return { success: true };
  }

  function ackHelp({ peerId, reqId }) {
    if (!hasAdminAccess(state.myProfile.role)) return { success: false, error: 'Admin only.' };
    sendToPeer(peerId, { type: 'help-ack', fromId: state.myProfile.id, reqId });
    const req = state.helpRequests.find((r) => r.reqId === reqId);
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

  function lockAllScreens({ message } = {}) {
    if (!isSuperAdmin(state.myProfile.role)) return { success: false, error: 'Super Admin only.' };
    const msg = String(message || '').trim() || 'Your screen has been locked by the administrator.';
    broadcastToPeers({ type: 'screen-lock', fromId: state.myProfile.id, message: msg });
    return { success: true, targetCount: state.peers.size };
  }

  function unlockAllScreens() {
    if (!isSuperAdmin(state.myProfile.role)) return { success: false, error: 'Super Admin only.' };
    broadcastToPeers({ type: 'screen-unlock', fromId: state.myProfile.id });
    return { success: true };
  }

  return {
    sendBroadcast,
    sendForcedVideoBroadcast,
    stopForcedVideoBroadcast,
    ackHelp,
    lockAllScreens,
    unlockAllScreens
  };
}

module.exports = { createAdminOrchestrator };
