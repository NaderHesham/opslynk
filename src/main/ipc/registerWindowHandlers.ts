import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type { RegistrarContext } from './types';

export function registerWindowHandlers({
  handle,
  state,
  applyWindowMode
}: RegistrarContext): void {
  handle(IPC_CHANNELS.window.MINIMIZE, () => state.mainWindow?.minimize());
  handle(IPC_CHANNELS.window.MAXIMIZE, () => state.mainWindow?.isMaximized() ? state.mainWindow.unmaximize() : state.mainWindow?.maximize());
  handle(IPC_CHANNELS.window.CLOSE, () => state.mainWindow?.hide());
  handle(IPC_CHANNELS.window.SET_MAIN_MODE, () => {
    applyWindowMode('main');
    return { success: true };
  });
}

