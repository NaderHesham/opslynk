import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { RegistrarContext } from './types';

export function registerForcedVideoHandlers({
  handle,
  adminModule,
  dialog,
  fs,
  path
}: RegistrarContext): void {
  handle(IPC_CHANNELS.forcedVideo.SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose video for forced playback',
      properties: ['openFile'],
      filters: [{ name: 'Video Files', extensions: ['mp4', 'webm', 'm4v', 'mov'] }]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 30 * 1024 * 1024) return { success: false, error: 'Video must be 30 MB or smaller.' };
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
    return { success: true, fileName: path.basename(filePath), size: stat.size, mime, data: fs.readFileSync(filePath).toString('base64') };
  });

  handle(IPC_CHANNELS.forcedVideo.SEND, (payload) =>
    adminModule.run(adminModule.COMMANDS.SEND_FORCED_VIDEO_BROADCAST, payload));

  handle(IPC_CHANNELS.forcedVideo.STOP, (payload) =>
    adminModule.run(adminModule.COMMANDS.STOP_FORCED_VIDEO_BROADCAST, payload));
}
