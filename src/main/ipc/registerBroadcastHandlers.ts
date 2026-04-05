import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/contracts/ipc';
import type { BroadcastRegistrarDeps } from './types';

export function registerBroadcastHandlers({
  handle,
  on,
  ipcMain,
  BrowserWindow,
  state,
  adminModule,
  sendToPeer,
  closeOverlayWindow
}: BroadcastRegistrarDeps): void {
  handle(IPC_CHANNELS.broadcast.SEND_BROADCAST, ({ text, urgency, durationSeconds, peerIds = null }) =>
    adminModule.run(adminModule.COMMANDS.SEND_BROADCAST, { text, urgency, durationSeconds, peerIds }));

  handle(IPC_CHANNELS.broadcast.SEND_ACK, ({ peerId, broadcastId }) => {
    sendToPeer(peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId });
    closeOverlayWindow(true);
  });

  on(IPC_EVENTS.URGENT_ACK, (data) => {
    sendToPeer(data.peerId, { type: 'ack', fromId: state.myProfile?.id, broadcastId: data.broadcastId });
    closeOverlayWindow(true);
  });

  on(IPC_EVENTS.URGENT_REPLY, (data) => {
    sendToPeer(data.peerId, { type: 'broadcast-reply', fromId: state.myProfile?.id, text: data.text, broadcastId: data.broadcastId });
  });
}
