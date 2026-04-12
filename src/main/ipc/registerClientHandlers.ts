import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/contracts/ipc';
import type { RegisterDeps } from './types';
import type { HandleFn } from './types';
import * as os from 'os';
import { exec } from 'child_process';
import { registerAppHandlers } from './registerAppHandlers';
import { registerWindowHandlers } from './registerWindowHandlers';
import { registerChatHandlers } from './registerChatHandlers';
import { registerProfileHandlers } from './registerProfileHandlers';
import { registerStorageHandlers } from './registerStorageHandlers';

function runCmd(cmd: string): Promise<string> {
  return new Promise(resolve => {
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      resolve(stdout?.trim() || stderr?.trim() || (err?.message ?? 'No output'));
    });
  });
}

function getSystemInfo(): string {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMem  = (os.freemem()  / 1024 / 1024 / 1024).toFixed(2);
  const usedMem  = (Number(totalMem) - Number(freeMem)).toFixed(2);
  return [
    `Hostname  : ${os.hostname()}`,
    `Platform  : ${os.platform()} ${os.arch()}`,
    `OS        : ${os.type()} ${os.release()}`,
    `CPU       : ${cpus[0]?.model ?? 'Unknown'} (${cpus.length} cores)`,
    `RAM Total : ${totalMem} GB`,
    `RAM Used  : ${usedMem} GB`,
    `RAM Free  : ${freeMem} GB`,
    `Uptime    : ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
  ].join('\n');
}

function getNetworkInfo(): string {
  const ifaces = os.networkInterfaces();
  const lines: string[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      lines.push(`${name.padEnd(20)} ${addr.family.padEnd(6)} ${addr.address}`);
    }
  }
  return lines.length ? lines.join('\n') : 'No network interfaces found.';
}

export function registerClientHandlers(deps: RegisterDeps): void {
  const { ipcMain } = deps;

  const handle: HandleFn = (channel, fn) => {
    ipcMain.handle(channel, (_e, payload) => fn((payload as Parameters<typeof fn>[0]) ?? (undefined as Parameters<typeof fn>[0])));
  };

  registerAppHandlers({
    handle,
    os: deps.os,
    udp: deps.udp,
    state: deps.state,
    hasAdminAccess: deps.hasAdminAccess,
    sendToPeer: deps.sendToPeer
  });
  registerWindowHandlers({ handle, state: deps.state, applyWindowMode: deps.applyWindowMode });
  registerChatHandlers({
    handle,
    state: deps.state,
    uuidv4: deps.uuidv4,
    sendToPeer: deps.sendToPeer,
    doSaveHistory: deps.doSaveHistory,
    broadcastToRenderer: deps.broadcastToRenderer,
    dialog: deps.dialog,
    fs: deps.fs,
    path: deps.path,
    reliableTransport: deps.reliableTransport
  });
  registerProfileHandlers({
    handle,
    state: deps.state,
    storage: deps.storage,
    broadcastToPeers: deps.broadcastToPeers,
    updateTrayMenu: deps.updateTrayMenu
  });
  registerStorageHandlers({ handle, state: deps.state, storage: deps.storage });

  // Broadcast popup close — toast.html calls dismiss() → this closes the popup window
  deps.ipcMain.handle(IPC_CHANNELS.broadcast.POPUP_CLOSE, (e) => {
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  deps.ipcMain.handle('chat-popup-dismiss', (e) => {
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    return { success: true };
  });

  deps.ipcMain.handle('chat-popup-open-chat', (e, payload: { peerId: string }) => {
    const peerId = String(payload?.peerId || '');
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    if (deps.state.mainWindow && !deps.state.mainWindow.isDestroyed()) {
      if (deps.state.mainWindow.isMinimized()) deps.state.mainWindow.restore();
      deps.state.mainWindow.show();
      deps.state.mainWindow.focus();
    }
    deps.broadcastToRenderer('ui:gotoTab', 'chat');
    deps.broadcastToRenderer('ui:openChatPeer', { peerId });
    return { success: true };
  });

  deps.ipcMain.handle('chat-popup-reply-intent', (e, payload: { peerId: string; replyText?: string }) => {
    const peerId = String(payload?.peerId || '');
    const replyText = String(payload?.replyText || '');
    const win = deps.BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    if (deps.state.mainWindow && !deps.state.mainWindow.isDestroyed()) {
      if (deps.state.mainWindow.isMinimized()) deps.state.mainWindow.restore();
      deps.state.mainWindow.show();
      deps.state.mainWindow.focus();
    }
    deps.broadcastToRenderer('ui:gotoTab', 'chat');
    deps.broadcastToRenderer('ui:openChatPeer', { peerId, replyText });
    return { success: true };
  });

  // Broadcast reply — client sends reply from toast.html back to admin
  handle(IPC_CHANNELS.broadcast.SEND_REPLY, ({ peerId, text, broadcastId }) => {
    deps.sendToPeer(peerId, { type: 'broadcast-reply', fromId: deps.state.myProfile?.id, text, broadcastId });
  });

  // Urgent reply — client sends reply from urgent.html overlay back to admin
  // Uses ipcRenderer.send (one-way), so must use ipcMain.on (not handle)
  deps.ipcMain.on(IPC_EVENTS.URGENT_REPLY, (_e, data: { peerId: string; text: string; broadcastId: string }) => {
    deps.sendToPeer(data.peerId, { type: 'broadcast-reply', fromId: deps.state.myProfile?.id, text: data.text, broadcastId: data.broadcastId });
  });

  // Screenshot preview — for the "include screenshot" checkbox in Ask For Help
  handle(IPC_CHANNELS.help.CAPTURE_SCREENSHOT_PREVIEW, async () => {
    const ss = await deps.captureScreenshot(deps.state.mainWindow);
    return ss ? { base64: ss.base64, name: ss.name, size: ss.size } : null;
  });

  // Help — send-only. ACK_HELP and CAPTURE_SCREENSHOT_PREVIEW are admin-only and
  // are intentionally omitted from the client handler set.
  handle(IPC_CHANNELS.help.SEND_HELP_REQUEST, async ({ description, priority, includeScreenshot }) => {
    const reqId = deps.uuidv4();
    const timestamp = new Date().toISOString();
    let screenshotB64: string | null = null;
    let screenshotName: string | null = null;
    let screenshotSize = 0;

    if (includeScreenshot) {
      const ss = await deps.captureScreenshot(deps.state.mainWindow);
      if (ss) {
        screenshotB64 = ss.base64;
        screenshotName = ss.name;
        screenshotSize = ss.size;
      }
    }

    const msg = {
      type: 'help-request',
      fromId: deps.state.myProfile?.id || '',
      username: deps.state.myProfile?.username || '',
      machine: deps.os.hostname(),
      description,
      priority,
      reqId,
      timestamp,
        screenshotB64,
        screenshotName,
        screenshotSize
    };
    const queuedRequest = { ...msg, msgId: deps.uuidv4(), deliveredAdminIds: [], createdAt: timestamp };
    const result = deps.helpSvc.enqueueOrDeliverHelpRequest(
      deps.state.peers,
      deps.state.pendingOutgoingHelpRequests,
      queuedRequest,
      deps.sendToPeer,
      deps.hasAdminAccess,
      deps.doSaveState,
      deps.reliableTransport
    );
    return { reqId, sent: result.sent, queued: result.queued, hasScreenshot: !!screenshotB64 };
  });

  ipcMain.handle('client-tool-data', async (_e, toolId: string) => {
    try {
      let output = '';
      switch (toolId) {
        case 'sysinfo':
          output = getSystemInfo();
          break;
        case 'network':
          output = getNetworkInfo();
          break;
        case 'processes':
          output = await runCmd('powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 20 | Format-Table Name, Id, @{N=\'CPU(s)\';E={[math]::Round($_.CPU,1)}}, @{N=\'Mem(MB)\';E={[math]::Round($_.WorkingSet/1MB,1)}} -AutoSize | Out-String -Width 120"');
          break;
        case 'storage':
          output = await runCmd('powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Format-Table Name, @{N=\'Used(GB)\';E={[math]::Round(($_.Used/1GB),2)}}, @{N=\'Free(GB)\';E={[math]::Round(($_.Free/1GB),2)}}, @{N=\'Total(GB)\';E={[math]::Round((($_.Used+$_.Free)/1GB),2)}} -AutoSize | Out-String -Width 100"');
          break;
        case 'services':
          output = await runCmd('powershell -NoProfile -Command "Get-Service | Where-Object {$_.Status -eq \'Running\'} | Sort-Object DisplayName | Select-Object -First 30 | Format-Table DisplayName, Status, StartType -AutoSize | Out-String -Width 120"');
          break;
        default:
          output = 'Unknown tool.';
      }
      return { output };
    } catch (e: unknown) {
      return { output: 'Error: ' + ((e as Error)?.message ?? String(e)) };
    }
  });
}
