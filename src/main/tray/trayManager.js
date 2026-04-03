'use strict';

const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

function createTrayManager({
  state,
  bus,
  EVENTS,
  hasAdminAccess,
  showMainWindow,
  appSourceDir
}) {
  function updateTrayMenu() {
    const online = [...state.peers.values()].filter((p) => p.online).length;
    const pendingHelp = state.helpRequests.filter((r) => r.status === 'open').length;
    const items = [
      { label: `OpsLynk - ${state.myProfile?.username || '...'}`, enabled: false },
      { label: `${online} peer${online !== 1 ? 's' : ''} online`, enabled: false },
      { type: 'separator' }
    ];

    if (hasAdminAccess(state.myProfile?.role)) {
      items.push({
        label: `Help Requests${pendingHelp ? ` (${pendingHelp})` : ''}`,
        click: () => {
          showMainWindow();
          setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'help'), 400);
        }
      });
      items.push({
        label: 'Send Broadcast',
        click: () => {
          showMainWindow();
          setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'broadcast'), 400);
        }
      });
      items.push({ label: 'Open Chat', click: showMainWindow });
    } else {
      items.push({
        label: 'Ask For Help',
        click: () => {
          showMainWindow();
          setTimeout(() => bus.emit(EVENTS.GOTO_TAB, 'ask'), 400);
        }
      });
      items.push({ label: 'Open Chat', click: showMainWindow });
    }

    items.push({ type: 'separator' });
    items.push({
      label: state.soundEnabled ? 'Sound ON' : 'Sound OFF',
      click: () => {
        state.soundEnabled = !state.soundEnabled;
        updateTrayMenu();
      }
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Quit OpsLynk', click: () => require('electron').app.quit() });

    state.tray.setContextMenu(Menu.buildFromTemplate(items));
    state.tray.setToolTip(
      pendingHelp > 0 && hasAdminAccess(state.myProfile?.role)
        ? `OpsLynk - ${pendingHelp} help request${pendingHelp > 1 ? 's' : ''} pending`
        : `OpsLynk - ${online} online`
    );
  }

  function createTray() {
    const iconPath = path.join(appSourceDir, '..', 'assets', 'tray.png');
    let icon;
    try { icon = nativeImage.createFromPath(iconPath); } catch { icon = nativeImage.createEmpty(); }
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVQ4jWNgYGD4z0ABYBo1gHoAAAAAAP//AwBkAAH/AAAAAElFTkSuQmCC'
      );
    }
    state.tray = new Tray(icon);
    state.tray.setToolTip('OpsLynk');
    updateTrayMenu();
    state.tray.on('double-click', showMainWindow);
    state.tray.on('click', showMainWindow);
  }

  return { createTray, updateTrayMenu };
}

module.exports = { createTrayManager };

