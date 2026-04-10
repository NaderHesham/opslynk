window.addEventListener('error', event => {
      console.error('[OpsLynk][window-error]', event.message, event.filename, event.lineno, event.error);
    });

window.addEventListener('unhandledrejection', event => {
      console.error('[OpsLynk][unhandled-rejection]', event.reason);
    });

IPC.setMainWindow();

async function init() {
      // Register IPC listeners immediately — before any await — so no peer join/update
      // events are dropped while we wait for init data to resolve.
      setupEvents();

      const [d, resolvedMode] = await Promise.all([IPC.getInitData(), _appModePromise]);
      _appMode = resolvedMode;
      const polling = await IPC.getScreenshotPolling?.().catch(() => null);
      if (polling && typeof polling === 'object') screenshotPolling = { ...screenshotPolling, ...polling };

      // Remove admin-only DOM elements before any rendering so they never flash
      console.log('[OpsLynk] _appMode resolved:', _appMode);
      if (_appMode === 'client') {
        const removed = document.querySelectorAll('[data-admin-only]');
        console.log('[OpsLynk] removing', removed.length, 'data-admin-only elements');
        removed.forEach(el => el.remove());
      }

      me = d.profile; _acctCurrentUserId = me?.authUserId || null; history = d.history || {};
      currentHostname = d.hostname || '';
      userGroups = d.userGroups || [];
      networkReady = !!d.networkReady;
      networkOnline = typeof navigator !== 'undefined' ? navigator.onLine : !!d.networkOnline;
      // Merge init-data peers into the peers map (events may have already added some)
      d.peers.forEach(p => {
        const existing = peers[p.id] || {};
        peers[p.id] = {
          ...p,
          ...existing,
          id: p.id,
          role: existing.role || p.role,
          username: existing.username || p.username,
          online: Boolean(existing.online || p.online),
          connectionState: existing.connectionState || p.connectionState || (p.online ? 'connected' : 'offline'),
          restoredFromState: existing.restoredFromState ?? p.restoredFromState ?? false,
          activityState: existing.activityState || p.activityState || (p.online ? 'active' : 'offline'),
          lastInputAt: existing.lastInputAt || p.lastInputAt || null,
          lastStateChangeAt: existing.lastStateChangeAt || p.lastStateChangeAt || null,
          currentSessionStartedAt: existing.currentSessionStartedAt || p.currentSessionStartedAt || null,
          idleThresholdMs: existing.idleThresholdMs || p.idleThresholdMs || null,
          activityEvents: existing.activityEvents || p.activityEvents || [],
          latestScreenshot: existing.latestScreenshot || p.latestScreenshot || null,
          latestScreenshotRequestedAt: existing.latestScreenshotRequestedAt || p.latestScreenshotRequestedAt || null,
          screenshotRequestPending: existing.screenshotRequestPending ?? p.screenshotRequestPending ?? false,
          latestScreenshotPreview: existing.latestScreenshotPreview || null
        };
      });
      ensureDashboardTabButton();

      applyRoleState();

      renderMyProfile();
      renderPeerList();
      renderUsersTab();
      renderMonitorTab();

      document.getElementById('afh-machine').textContent = d.hostname || '-';
      document.getElementById('afh-user').textContent = me.username;

      // Build color swatches
      const sc = document.getElementById('swatches');
      COLORS.forEach(c => {
        const s = document.createElement('div');
        s.className = 'swatch' + (c === me.color ? ' sel' : '');
        s.style.background = c; s.dataset.color = c;
        s.onclick = () => { document.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel')); s.classList.add('sel'); document.getElementById('profprev').style.background = c; };
        sc.appendChild(s);
      });

      if (d.helpRequests) d.helpRequests.forEach(r => appendHelpCard(r));
      addDashboardActivity('system', 'Session initialized', 'Admin workspace loaded and ready to monitor connected peers.', d.hostname || 'This device');
      setupEmojiPicker();
      startActivityTracking();
      ensureChatLayout();
      renderGroupUI();
      renderHelpRequests();
      updateConnPill();
      updateEmojiButton();
      switchTab(_appMode === 'client' ? 'chat' : 'dashboard');
      renderDashboard();
    }

window.addEventListener('online', syncNetworkStatus);
window.addEventListener('offline', syncNetworkStatus);
document.addEventListener('visibilitychange', syncNetworkStatus);
updateBroadcastCharCount();
setBroadcastAckCount(0);
setUrg('normal');
setLockUi(false);

init();
