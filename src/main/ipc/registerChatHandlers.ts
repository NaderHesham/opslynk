import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { RegistrarContext } from './types';

export function registerChatHandlers({
  handle,
  state,
  uuidv4,
  sendToPeer,
  doSaveHistory,
  dialog,
  fs,
  path
}: RegistrarContext): void {
  handle(IPC_CHANNELS.chat.SEND_CHAT, ({ peerId, text, emoji }) => {
    const msgId = uuidv4();
    const timestamp = new Date().toISOString();
    sendToPeer(peerId, { type: 'chat', fromId: state.myProfile?.id, text, emoji, msgId, timestamp });
    const entry = { id: msgId, fromId: state.myProfile?.id, text, emoji, timestamp, mine: true };
    if (!state.chatHistory[peerId]) state.chatHistory[peerId] = [];
    state.chatHistory[peerId].push(entry);
    doSaveHistory();
    return { success: true, message: entry };
  });

  handle(IPC_CHANNELS.chat.SEND_FILE_OFFER, async ({ peerId }) => {
    const peer = state.peers.get(peerId);
    if (!peer) return { success: false, error: 'Peer not found.' };
    const result = await dialog.showOpenDialog({ title: 'Choose a file to send', properties: ['openFile'] });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) return { success: false, error: 'Files larger than 10 MB are not supported yet.' };
    const attachment = {
      name: path.basename(filePath),
      size: stat.size,
      mime: 'application/octet-stream',
      data: fs.readFileSync(filePath).toString('base64')
    };
    const msgId = uuidv4();
    const timestamp = new Date().toISOString();
    sendToPeer(peerId, { type: 'chat-file', fromId: state.myProfile?.id, msgId, timestamp, attachment });
    const entry = { id: msgId, fromId: state.myProfile?.id, timestamp, mine: true, attachment };
    if (!state.chatHistory[peerId]) state.chatHistory[peerId] = [];
    state.chatHistory[peerId].push(entry);
    doSaveHistory();
    return { success: true, message: entry };
  });

  handle(IPC_CHANNELS.chat.SELECT_AVATAR, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose profile picture',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    if (fs.statSync(filePath).size > 4 * 1024 * 1024) return { success: false, error: 'Profile image must be 4 MB or smaller.' };
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/png';
    return { success: true, avatar: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` };
  });
}

