import path from 'path';
import { BrowserWindow, dialog, screen, globalShortcut } from 'electron';
const { blockInput, unblockInput } = require('../../../src/services/inputBlocker') as { blockInput: () => void; unblockInput: () => void };
import type { WindowManagerApi, WindowRuntimeState } from '../../shared/types/runtime';

interface WindowManagerDeps {
  state: WindowRuntimeState;
  getWindowModeConfig: (modeName: string) => { width: number; height: number; minWidth: number; minHeight: number; resizable: boolean } | null;
  appSourceDir: string;
  getStartPage: () => string;
}

export function createWindowManager({ state, getWindowModeConfig, appSourceDir, getStartPage }: WindowManagerDeps): WindowManagerApi {
  const preloadPath = path.join(appSourceDir, 'preload.js');
  const rendererDir = path.join(appSourceDir, 'renderer');
  const appIconPath = path.join(appSourceDir, '..', 'assets', 'icon.ico');

  // Pre-created hidden windows — loaded at startup so show() is ~50ms, not ~500ms
  let _preLockWin: BrowserWindow | null = null;
  let _preUrgentWin: BrowserWindow | null = null;
  let _preForcedVideoWin: BrowserWindow | null = null;

  function destroyPreloadedWindows(): void {
    for (const win of [_preLockWin, _preUrgentWin, _preForcedVideoWin]) {
      if (win && !win.isDestroyed()) { try { win.destroy(); } catch {} }
    }
    _preLockWin = null; _preUrgentWin = null; _preForcedVideoWin = null;
  }

  function initPreloadedWindows(): void {
    const { bounds } = screen.getPrimaryDisplay();
    if (!_preLockWin || _preLockWin.isDestroyed()) {
      _preLockWin = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, fullscreen: false, alwaysOnTop: true, skipTaskbar: true,
        resizable: false, movable: false, minimizable: false, maximizable: false,
        closable: false, kiosk: true, backgroundColor: '#05070d', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      _preLockWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      _preLockWin.setAlwaysOnTop(true, 'screen-saver', 1);
      _preLockWin.loadFile(path.join(rendererDir, 'lockscreen.html'));
      _preLockWin.on('closed', () => { _preLockWin = null; });
    }
    if (!_preUrgentWin || _preUrgentWin.isDestroyed()) {
      _preUrgentWin = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, alwaysOnTop: true, skipTaskbar: true,
        fullscreen: false, kiosk: true,
        movable: false, minimizable: false, maximizable: false, closable: false,
        backgroundColor: '#05070d', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      _preUrgentWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      _preUrgentWin.setAlwaysOnTop(true, 'screen-saver');
      _preUrgentWin.loadFile(path.join(rendererDir, 'urgent.html'));
      _preUrgentWin.on('closed', () => { _preUrgentWin = null; });
    }
    if (!_preForcedVideoWin || _preForcedVideoWin.isDestroyed()) {
      _preForcedVideoWin = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, fullscreen: false, alwaysOnTop: true, skipTaskbar: true,
        resizable: false, movable: false, minimizable: false, maximizable: false,
        closable: false, kiosk: true, backgroundColor: '#03060c', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      _preForcedVideoWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      _preForcedVideoWin.setAlwaysOnTop(true, 'screen-saver', 1);
      _preForcedVideoWin.loadFile(path.join(rendererDir, 'forced-video.html'));
      _preForcedVideoWin.on('closed', () => { _preForcedVideoWin = null; });
    }
  }

  function createMainWindow(): void {
    const mode = getWindowModeConfig('main');
    if (!mode) return;
    state.mainWindow = new BrowserWindow({
      width: mode.width,
      height: mode.height,
      minWidth: mode.minWidth,
      minHeight: mode.minHeight,
      frame: false,
      transparent: false,
      backgroundColor: '#0b0d12',
      show: false,
      resizable: mode.resizable,
      maximizable: true,
      icon: appIconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath
      }
    });
    state.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[OpsLynk] Main window failed to load:', {
        errorCode,
        errorDescription,
        validatedURL,
        preloadPath,
        rendererDir
      });
      void dialog.showMessageBox(state.mainWindow!, {
        type: 'error',
        title: 'OpsLynk startup error',
        message: 'OpsLynk could not load the main screen.',
        detail: `Renderer load failed (${errorCode}): ${errorDescription}\n${validatedURL || path.join(rendererDir, 'index.html')}`
      });
    });
    state.mainWindow.loadFile(path.join(rendererDir, getStartPage()));
    state.mainWindow.once('ready-to-show', () => {
      state.mainWindow?.center();
      state.mainWindow?.show();
    });
    state.mainWindow.on('close', (e) => {
      if (state.isQuitting) return;
      e.preventDefault();
      state.mainWindow?.hide();
    });
  }

  function applyWindowMode(modeName: string): void {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    const mode = getWindowModeConfig(modeName);
    if (!mode) return;
    if (state.mainWindow.isMaximized()) state.mainWindow.unmaximize();
    state.mainWindow.setResizable(mode.resizable);
    state.mainWindow.setMinimumSize(mode.minWidth, mode.minHeight);
    state.mainWindow.setSize(mode.width, mode.height);
    state.mainWindow.center();
  }

  function showMainWindow(): void {
    if (!state.mainWindow) return;
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.show();
    state.mainWindow.focus();
  }

  function closeOverlayWindow(force = false): void {
    if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
      state.overlayWindow = null;
      state.overlayState = null;
      return;
    }
    const win = state.overlayWindow;
    state.overlayWindow = null;
    state.overlayState = null;
    if (force) {
      try { win.removeAllListeners('close'); } catch {}
      try { win.destroy(); } catch {}
      return;
    }
    win.close();
  }

  function showNormalBroadcastPopup(data: unknown): void {
    const { workArea } = screen.getPrimaryDisplay();
    const width = 360;
    const height = 188;
    const gap = 16;
    const x = Math.round(workArea.x + workArea.width - width - 18);
    const y = Math.round(workArea.y + workArea.height - height - 18 - state.normalBroadcastWindows.size * (height + gap));
    const popup = new BrowserWindow({
      width, height, x, y,
      frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
    });
    state.normalBroadcastWindows.add(popup);
    popup.loadFile(path.join(rendererDir, 'toast.html'));
    popup.once('ready-to-show', () => {
      popup.showInactive();
      popup.webContents.send('broadcast-popup-data', data);
    });
    popup.on('closed', () => state.normalBroadcastWindows.delete(popup));
  }

  function showUrgentOverlay(data: { broadcastId?: string } & Record<string, unknown>): void {
    console.log('[TIMING] urgent command received:', Date.now());
    if (state.overlayWindow) closeOverlayWindow(true);
    state.overlayState = { mode: 'urgent', data, broadcastId: data.broadcastId };
    const { bounds } = screen.getPrimaryDisplay();
    const urgentShortcuts = [
      'Super', 'Meta',
      'Alt+Tab', 'Alt+Shift+Tab', 'Alt+F4',
      'Meta+Tab', 'Meta+Shift+Tab',
      'Meta+D', 'Meta+E', 'Meta+L', 'Meta+R', 'Meta+M',
      'Meta+Up', 'Meta+Down', 'Meta+Left', 'Meta+Right',
      'Ctrl+Escape', 'Ctrl+Alt+Delete', 'Alt+Escape',
    ];

    if (_preUrgentWin && !_preUrgentWin.isDestroyed()) {
      // Fast path: window already loaded — just show()
      state.overlayWindow = _preUrgentWin;
      _preUrgentWin = null;
      state.overlayWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      state.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      state.overlayWindow.on('closed', () => {
        try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
        state.overlayWindow = null;
        state.overlayState = null;
      });
      state.overlayWindow.show();
      state.overlayWindow.focus();
      state.overlayWindow.moveTop();
      state.overlayWindow.webContents.send('urgent-data', data);
      console.log('[TIMING] urgent window shown:', Date.now());
    } else {
      // Slow path fallback: create fresh
      state.overlayWindow = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, alwaysOnTop: true, skipTaskbar: true,
        fullscreen: false, kiosk: true,
        movable: false, minimizable: false, maximizable: false, closable: false,
        backgroundColor: '#05070d', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      state.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      state.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      state.overlayWindow.loadFile(path.join(rendererDir, 'urgent.html'));
      state.overlayWindow.once('ready-to-show', () => {
        state.overlayWindow?.setAlwaysOnTop(true, 'screen-saver');
        state.overlayWindow?.show();
        state.overlayWindow?.focus();
        state.overlayWindow?.moveTop();
        state.overlayWindow?.webContents.send('urgent-data', data);
        console.log('[TIMING] urgent window shown (slow path):', Date.now());
        try { globalShortcut.registerAll(urgentShortcuts, () => { /* blocked */ }); } catch { /* ignore */ }
      });
      state.overlayWindow.on('closed', () => {
        try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
        state.overlayWindow = null;
        state.overlayState = null;
      });
      return;
    }
    try { globalShortcut.registerAll(urgentShortcuts, () => { /* blocked */ }); } catch { /* ignore */ }
  }

  function showHelpRequestPopup(req: { reqId: string } & Record<string, unknown>): void {
    const existing = state.helpPopupWindows.get(req.reqId);
    if (existing && !existing.isDestroyed()) existing.close();
    state.helpPopupWindows.delete(req.reqId);

    const { workArea } = screen.getPrimaryDisplay();
    const width = 400;
    const height = 260;
    const gap = 16;
    const x = Math.round(workArea.x + workArea.width - width - 18);
    const y = Math.round(workArea.y + workArea.height - height - 18 - state.helpPopupWindows.size * (height + gap));
    const popup = new BrowserWindow({
      width, height, x, y,
      frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
    });
    state.helpPopupWindows.set(req.reqId, popup);
    popup.loadFile(path.join(rendererDir, 'help-popup.html'));
    popup.once('ready-to-show', () => {
      popup.showInactive();
      popup.webContents.send('help-popup-data', req);
    });
    popup.on('closed', () => state.helpPopupWindows.delete(req.reqId));
  }

  function showLockScreen(message: string): void {
    console.log('[TIMING] lock command received:', Date.now());
    if (state.screenLocked) return;
    const { bounds } = screen.getPrimaryDisplay();
    const lockShortcuts = [
      'Super', 'Meta',
      'Alt+Tab', 'Alt+Shift+Tab', 'Alt+F4',
      'Meta+Tab', 'Meta+Shift+Tab',
      'Meta+D', 'Meta+E', 'Meta+L', 'Meta+R', 'Meta+M',
      'Ctrl+Escape', 'Ctrl+Alt+Delete',
      'Alt+Escape', 'Meta+Up', 'Meta+Down', 'Meta+Left', 'Meta+Right',
    ];

    if (_preLockWin && !_preLockWin.isDestroyed()) {
      // Fast path: window already loaded — just show()
      state.lockWindow = _preLockWin;
      _preLockWin = null;
      state.lockWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      state.lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      state.lockWindow.on('close', (e) => { if (state.screenLocked) e.preventDefault(); });
      state.lockWindow.on('move', () => { if (state.screenLocked) state.lockWindow?.setBounds(bounds); });
      state.lockWindow.on('resize', () => { if (state.screenLocked) state.lockWindow?.setBounds(bounds); });
      state.lockWindow.on('blur', () => { if (state.screenLocked) { state.lockWindow?.setAlwaysOnTop(true, 'screen-saver', 1); state.lockWindow?.focus(); state.lockWindow?.moveTop(); } });
      state.lockWindow.on('closed', () => { state.lockWindow = null; });
      state.screenLocked = true;
      state.lockWindow.show();
      state.lockWindow.focus();
      state.lockWindow.moveTop();
      state.lockWindow.webContents.send('lockscreen-data', {
        message: message || 'Your screen has been locked by the administrator.',
        lockedAt: new Date().toISOString()
      });
      blockInput();
      console.log('[TIMING] lock window shown:', Date.now());
    } else {
      // Slow path fallback: create fresh
      state.lockWindow = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, fullscreen: false, alwaysOnTop: true, skipTaskbar: true,
        resizable: false, movable: false, minimizable: false, maximizable: false,
        closable: false, kiosk: true, backgroundColor: '#05070d', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      state.lockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      state.lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      state.lockWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      state.lockWindow.on('close', (e) => { if (state.screenLocked) e.preventDefault(); });
      state.lockWindow.on('move', () => { if (state.screenLocked) state.lockWindow?.setBounds(bounds); });
      state.lockWindow.on('resize', () => { if (state.screenLocked) state.lockWindow?.setBounds(bounds); });
      state.lockWindow.on('blur', () => { if (state.screenLocked) { state.lockWindow?.setAlwaysOnTop(true, 'screen-saver', 1); state.lockWindow?.focus(); state.lockWindow?.moveTop(); } });
      state.lockWindow.loadFile(path.join(rendererDir, 'lockscreen.html'));
      state.lockWindow.once('ready-to-show', () => {
        state.lockWindow?.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
        state.lockWindow?.setAlwaysOnTop(true, 'screen-saver', 1);
        state.lockWindow?.show();
        state.lockWindow?.focus();
        state.lockWindow?.moveTop();
        state.lockWindow?.webContents.send('lockscreen-data', {
          message: message || 'Your screen has been locked by the administrator.',
          lockedAt: new Date().toISOString()
        });
        blockInput();
        console.log('[TIMING] lock window shown (slow path):', Date.now());
      });
      state.lockWindow.on('closed', () => { state.lockWindow = null; });
      state.screenLocked = true;
    }

    try { globalShortcut.registerAll(lockShortcuts, () => { /* blocked */ }); } catch { /* ignore */ }
  }

  function unlockScreen(): void {
    state.screenLocked = false;
    unblockInput();
    try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
    if (state.lockWindow && !state.lockWindow.isDestroyed()) {
      try { state.lockWindow.removeAllListeners('close'); } catch {}
      try { state.lockWindow.destroy(); } catch {}
      state.lockWindow = null;
    }
    // Re-pre-create so the next lock command is fast too
    setTimeout(() => initPreloadedWindows(), 500);
  }

  function showForcedVideoWindow(data: Record<string, unknown>): void {
    console.log('[TIMING] forced-video command received:', Date.now());
    state.forcedVideoActive = true;
    if (state.forcedVideoWindow && !state.forcedVideoWindow.isDestroyed()) {
      state.forcedVideoWindow.webContents.send('forced-video-data', data);
      state.forcedVideoWindow.show();
      state.forcedVideoWindow.focus();
      state.forcedVideoWindow.moveTop();
      console.log('[TIMING] forced-video window shown:', Date.now());
      return;
    }
    const { bounds } = screen.getPrimaryDisplay();
    const videoShortcuts = [
      'Super', 'Meta',
      'Alt+Tab', 'Alt+Shift+Tab', 'Alt+F4',
      'Meta+Tab', 'Meta+Shift+Tab',
      'Meta+D', 'Meta+E', 'Meta+L', 'Meta+R', 'Meta+M',
      'Ctrl+Escape', 'Ctrl+Alt+Delete',
      'Alt+Escape', 'Meta+Up', 'Meta+Down', 'Meta+Left', 'Meta+Right',
    ];

    if (_preForcedVideoWin && !_preForcedVideoWin.isDestroyed()) {
      // Fast path: window already loaded — just show()
      state.forcedVideoWindow = _preForcedVideoWin;
      _preForcedVideoWin = null;
      state.forcedVideoWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      state.forcedVideoWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      state.forcedVideoWindow.on('close', (e) => { if (state.forcedVideoActive) e.preventDefault(); });
      state.forcedVideoWindow.on('move', () => { if (state.forcedVideoActive) state.forcedVideoWindow?.setBounds(bounds); });
      state.forcedVideoWindow.on('resize', () => { if (state.forcedVideoActive) state.forcedVideoWindow?.setBounds(bounds); });
      state.forcedVideoWindow.on('blur', () => { if (state.forcedVideoActive) { state.forcedVideoWindow?.setAlwaysOnTop(true, 'screen-saver', 1); state.forcedVideoWindow?.focus(); state.forcedVideoWindow?.moveTop(); } });
      state.forcedVideoWindow.on('closed', () => { state.forcedVideoWindow = null; state.forcedVideoActive = false; });
      state.forcedVideoWindow.show();
      state.forcedVideoWindow.focus();
      state.forcedVideoWindow.moveTop();
      state.forcedVideoWindow.webContents.send('forced-video-data', data);
      blockInput();
      console.log('[TIMING] forced-video window shown:', Date.now());
    } else {
      // Slow path fallback: create fresh
      state.forcedVideoWindow = new BrowserWindow({
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        frame: false, fullscreen: false, alwaysOnTop: true, skipTaskbar: true,
        resizable: false, movable: false, minimizable: false, maximizable: false,
        closable: false, kiosk: true, backgroundColor: '#03060c', show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
      });
      state.forcedVideoWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      state.forcedVideoWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      state.forcedVideoWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      state.forcedVideoWindow.on('close', (e) => { if (state.forcedVideoActive) e.preventDefault(); });
      state.forcedVideoWindow.on('move', () => { if (state.forcedVideoActive) state.forcedVideoWindow?.setBounds(bounds); });
      state.forcedVideoWindow.on('resize', () => { if (state.forcedVideoActive) state.forcedVideoWindow?.setBounds(bounds); });
      state.forcedVideoWindow.on('blur', () => { if (state.forcedVideoActive) { state.forcedVideoWindow?.setAlwaysOnTop(true, 'screen-saver', 1); state.forcedVideoWindow?.focus(); state.forcedVideoWindow?.moveTop(); } });
      state.forcedVideoWindow.loadFile(path.join(rendererDir, 'forced-video.html'));
      state.forcedVideoWindow.once('ready-to-show', () => {
        state.forcedVideoWindow?.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
        state.forcedVideoWindow?.setAlwaysOnTop(true, 'screen-saver', 1);
        state.forcedVideoWindow?.show();
        state.forcedVideoWindow?.focus();
        state.forcedVideoWindow?.moveTop();
        state.forcedVideoWindow?.webContents.send('forced-video-data', data);
        blockInput();
        console.log('[TIMING] forced-video window shown (slow path):', Date.now());
      });
      state.forcedVideoWindow.on('closed', () => {
        state.forcedVideoWindow = null;
        state.forcedVideoActive = false;
      });
    }
    try { globalShortcut.registerAll(videoShortcuts, () => { /* blocked */ }); } catch { /* ignore */ }
  }

  function closeForcedVideoWindow(force = false): void {
    state.forcedVideoActive = false;
    unblockInput();
    try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
    if (state.forcedVideoWindow && !state.forcedVideoWindow.isDestroyed()) {
      try { state.forcedVideoWindow.webContents.send('forced-video-stop'); } catch {}
      if (force) {
        try { state.forcedVideoWindow.removeAllListeners('close'); } catch {}
        try { state.forcedVideoWindow.destroy(); } catch {}
        state.forcedVideoWindow = null;
      } else {
        state.forcedVideoWindow.close();
      }
    }
  }

  function getMainWindow(): BrowserWindow | null {
    return state.mainWindow;
  }

  return {
    createMainWindow,
    initPreloadedWindows,
    destroyPreloadedWindows,
    applyWindowMode,
    showMainWindow,
    closeOverlayWindow,
    showNormalBroadcastPopup,
    showUrgentOverlay,
    showHelpRequestPopup,
    showLockScreen,
    unlockScreen,
    showForcedVideoWindow,
    closeForcedVideoWindow,
    getMainWindow
  };
}
