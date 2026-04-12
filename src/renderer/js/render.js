function ensureDashboardTabButton() {
      return;
    }

function animateCounter(id, value, suffix = '') {
      const el = document.getElementById(id);
      if (!el) return;
      const target = Number(value) || 0;
      const active = counterAnimations.get(id);
      if (active) cancelAnimationFrame(active);
      const start = Number(el.dataset.value || 0);
      const startedAt = performance.now();
      const duration = 520;
      const step = now => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + ((target - start) * eased);
        const rounded = suffix === '%' ? Math.round(current) : Math.round(current);
        el.textContent = `${rounded}${suffix}`;
        if (progress < 1) {
          counterAnimations.set(id, requestAnimationFrame(step));
        } else {
          el.dataset.value = String(target);
          el.textContent = `${target}${suffix}`;
          counterAnimations.delete(id);
        }
      };
      counterAnimations.set(id, requestAnimationFrame(step));
    }

function renderMiniChart(values, variant = '') {
      const width = 240;
      const height = 76;
      const padX = 10;
      const padY = 10;
      const safe = (values && values.length ? values : [0, 0, 0, 0, 0]).slice(-8);
      const max = Math.max(...safe, 1);
      const points = safe.map((value, index) => {
        const x = padX + (index * ((width - padX * 2) / Math.max(safe.length - 1, 1)));
        const y = height - padY - (((value / max) || 0) * (height - padY * 2));
        return [x, y];
      });
      const polyline = points.map(([x, y]) => `${x},${y}`).join(' ');
      const area = [`${points[0][0]},${height - padY}`, ...points.map(([x, y]) => `${x},${y}`), `${points[points.length - 1][0]},${height - padY}`].join(' ');
      const last = points[points.length - 1];
      return `
    <div class="chart-shell">
      <svg class="mini-chart ${variant}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <line class="grid" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}"></line>
        <line class="grid" x1="${padX}" y1="${height / 2}" x2="${width - padX}" y2="${height / 2}"></line>
        <polygon class="area" points="${area}"></polygon>
        <polyline class="line" points="${polyline}"></polyline>
        <circle class="point" cx="${last[0]}" cy="${last[1]}" r="4"></circle>
      </svg>
    </article>`;
    }

function pushDashboardSeries(key, value) {
      dashboardSeries[key].push(value);
      dashboardSeries[key] = dashboardSeries[key].slice(-8);
    }

function addDashboardActivity(kind, title, detail, meta = '') {
      if (!document.getElementById('dashTimeline')) return; // client mode — no dashboard
      const stamp = new Date();
      const at = stamp.getTime();
      const head = dashboardActivity[0];
      if (head && head.kind === kind && head.title === title && head.detail === detail && (at - Number(head.at || 0)) < 20000) {
        if (meta && meta !== head.meta) head.meta = meta;
        head.time = stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        head.at = at;
        renderDashboard();
        return;
      }
      dashboardActivity.unshift({
        id: `${at}-${Math.random().toString(16).slice(2, 8)}`,
        kind,
        title,
        detail,
        meta,
        time: stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        at
      });
      dashboardActivity = dashboardActivity.slice(0, 18);
      renderDashboard();
    }

function clearDashboardActivity() {
      dashboardActivity = [];
      renderDashboard();
    }

function setDashboardDeviceFilter(filter) {
      dashboardDeviceFilter = filter;
      document.querySelectorAll('.dash-filter-pill').forEach(btn => {
        if (!btn.id.startsWith('dashFilter-')) return;
        btn.classList.toggle('active', btn.id === `dashFilter-${filter}`);
      });
      renderDashboard();
}

function setDashboardScreenshotFilter(filter) {
      dashboardScreenshotFilter = filter;
      document.querySelectorAll('.dash-filter-pill').forEach(btn => {
        if (!btn.id.startsWith('dashScreenshotFilter-')) return;
        btn.classList.toggle('active', btn.id === `dashScreenshotFilter-${filter}`);
      });
      renderDashboard();
}

async function setScreenshotPollingMode(mode) {
      if (mode !== 'normal' && mode !== 'fast' && mode !== 'live') return;
      try {
        const snapshot = await IPC.setScreenshotPolling?.({ mode });
        if (snapshot && typeof snapshot === 'object') {
          screenshotPolling = { ...screenshotPolling, ...snapshot };
        } else {
          screenshotPolling = { ...screenshotPolling, mode };
        }
        renderDashboard();
        renderMonitorTab();
      } catch (error) {
        console.error('[OpsLynk] set screenshot polling mode failed', error);
        showToast('Polling update failed', 'Could not update screenshot polling mode right now.', 'warn');
      }
}

async function toggleScreenshotPolling() {
      const nextEnabled = !Boolean(screenshotPolling?.enabled);
      try {
        const snapshot = await IPC.setScreenshotPolling?.({ enabled: nextEnabled });
        if (snapshot && typeof snapshot === 'object') {
          screenshotPolling = { ...screenshotPolling, ...snapshot };
        } else {
          screenshotPolling = { ...screenshotPolling, enabled: nextEnabled };
        }
        renderDashboard();
        renderMonitorTab();
      } catch (error) {
        console.error('[OpsLynk] toggle screenshot polling failed', error);
        showToast('Polling update failed', 'Could not toggle screenshot wall polling right now.', 'warn');
      }
}

function syncScreenshotPollingControls() {
      const normalBtn = document.getElementById('dashScreenshotMode-normal');
      const fastBtn = document.getElementById('dashScreenshotMode-fast');
      const liveBtn = document.getElementById('dashScreenshotMode-live');
      const toggleBtn = document.getElementById('dashScreenshotToggle');
      const monitorNormalBtn = document.getElementById('monitorMode-normal');
      const monitorFastBtn = document.getElementById('monitorMode-fast');
      const monitorLiveBtn = document.getElementById('monitorMode-live');
      const monitorToggleBtn = document.getElementById('monitorMode-toggle');
      const liveWallSub = document.getElementById('dashLiveWallSub');
      const monitorLiveWallSub = document.getElementById('monitorLiveWallSub');
      if (normalBtn) normalBtn.classList.toggle('active', screenshotPolling.mode === 'normal');
      if (fastBtn) fastBtn.classList.toggle('active', screenshotPolling.mode === 'fast');
      if (liveBtn) liveBtn.classList.toggle('active', screenshotPolling.mode === 'live');
      if (monitorNormalBtn) monitorNormalBtn.classList.toggle('active', screenshotPolling.mode === 'normal');
      if (monitorFastBtn) monitorFastBtn.classList.toggle('active', screenshotPolling.mode === 'fast');
      if (monitorLiveBtn) monitorLiveBtn.classList.toggle('active', screenshotPolling.mode === 'live');
      if (toggleBtn) {
        const enabled = Boolean(screenshotPolling.enabled);
        toggleBtn.textContent = enabled ? 'Pause' : 'Start';
        toggleBtn.classList.toggle('paused', !enabled);
      }
      if (monitorToggleBtn) {
        const enabled = Boolean(screenshotPolling.enabled);
        monitorToggleBtn.textContent = enabled ? 'Pause' : 'Start';
        monitorToggleBtn.classList.toggle('active', enabled);
      }
      if (liveWallSub) {
        const enabled = Boolean(screenshotPolling.enabled);
        const refreshSec = Math.max(1, Math.round(Number(screenshotPolling.previewRefreshMs || 0) / 1000));
        const modeLabel = screenshotPolling.mode === 'fast' ? 'Fast' : (screenshotPolling.mode === 'live' ? 'Live' : 'Normal');
        liveWallSub.textContent = enabled
          ? `Live wall mode: ${modeLabel} (${refreshSec}s target refresh)`
          : 'Live wall mode: Paused';
      }
      if (monitorLiveWallSub) {
        const enabled = Boolean(screenshotPolling.enabled);
        const refreshSec = Math.max(1, Math.round(Number(screenshotPolling.previewRefreshMs || 0) / 1000));
        const modeLabel = screenshotPolling.mode === 'fast' ? 'Fast' : (screenshotPolling.mode === 'live' ? 'Live' : 'Normal');
        monitorLiveWallSub.textContent = enabled
          ? `Live wall mode: ${modeLabel} (${refreshSec}s target refresh)`
          : 'Live wall mode: Paused';
      }
}

function renderDashboardDeviceGrid(items) {
      const filtered = items.filter(peer => (
        dashboardDeviceFilter === 'online' ? peer.online
          : dashboardDeviceFilter === 'offline' ? !peer.online
          : true
      ));
      if (!filtered.length) return '<div class="empty"><div class="ei">Devices</div>No devices match the current filter</div>';
      return filtered.slice(0, 6).map(peer => {
        const label = (peer.username || '?').trim();
        const initial = esc(label[0]?.toUpperCase() || '?');
        const hostname = peer.systemInfo?.hostname || getPeerDisplayTitle(peer);
        const ip = peer.systemInfo?.ip || 'IP unavailable';
        const connection = getPeerConnectionMeta(peer);
        const freshness = getPeerFreshnessMeta(peer);
        const activity = getPeerActivityMeta(peer);
        const availabilityClass = peer.online ? 'online' : connection.key;
        const availabilityLabel = connection.label;
        const roleClass = hasAdminAccess(peer.role) ? 'admin' : 'user';
        const roleLabel = hasAdminAccess(peer.role) ? 'Admin' : 'User';
        const deliveryClass = peer.online ? 'online' : (connection.key === 'degraded' ? 'pending' : connection.key);
        const deliveryLabel = peer.online ? 'Reachable' : (connection.key === 'discovering' ? 'Pending' : connection.label);
        const trust = getPeerTrustState(peer);
        const fillColor = peer.online ? 'var(--green)' : 'var(--amber)';
        const fillWidth = peer.online ? 100 : 34;
        return `
      <article class="dash-device-card ${availabilityClass}" onclick="openChat('${peer.id}')">
        <div class="dash-device-top">
          <div class="dash-device-avatar" style="background:${COLORS[Math.abs(hc(label)) % COLORS.length]}">${initial}</div>
          <div>
            <div class="dash-device-name">${esc(label)}</div>
            <div class="dash-device-ip">${esc(hostname)} · ${esc(ip)}</div>
          </div>
        </div>
        <div class="dash-device-tags">
          <span class="dash-device-tag ${availabilityClass}">${availabilityLabel}</span>
          <span class="dash-device-tag ${freshness.key}">${freshness.label}</span>
          <span class="dash-device-tag ${activity.key}">${activity.label}</span>
          <span class="dash-device-tag ${roleClass}">${roleLabel}</span>
          <span class="dash-device-tag ${deliveryClass}">${deliveryLabel}</span>
          <span class="dash-device-tag trust ${trust.key}">${trust.label}</span>
        </div>
        <div class="dash-device-bar">
          <div class="dash-device-bar-fill" style="width:${fillWidth}%;background:${fillColor};"></div>
        </div>
      </article>`;
      }).join('');
    }

function renderDashboardScreenshotWall(items) {
      const clients = items.filter(peer => !hasAdminAccess(peer.role));
      const targets = clients.length
        ? clients
        : items.filter(peer => peer.id !== me?.id);
      if (!targets.length) return '<div class="empty"><div class="ei">Preview</div>No devices available for live wall</div>';
      const filtered = targets.slice(0, 8);
      return filtered.map(peer => {
        const screenshot = getPeerScreenshotMeta(peer);
        const previewStyle = peer.latestScreenshotPreview
          ? ` style="background-image:url('${peer.latestScreenshotPreview.replace(/'/g, '%27')}')"`
          : '';
        const offlineOverlay = !peer.online ? '<div class="dash-shot-offline-mask"><span>OFFLINE</span></div>' : '';
        const connectionBadge = !peer.online
          ? '<span class="dash-shot-conn offline"><span class="dot"></span>OFF</span>'
          : '';
        const canCapture = !hasAdminAccess(peer.role);
        const actionLabel = !peer.online
          ? 'Offline'
          : peer.latestScreenshotPreview
          ? 'Open'
          : (canCapture ? (peer.screenshotRequestPending ? 'Polling' : 'Request') : 'N/A');
        const actionHandler = peer.latestScreenshotPreview
          ? `openDashboardScreenshot('${peer.id}')`
          : (canCapture ? `requestScreenshot('${peer.id}')` : '');
        return `
      <article class="dash-shot-card ${screenshot.key}${!peer.online ? ' offline' : ''}" ${actionHandler ? `onclick="${actionHandler}"` : ''}>
        <div class="dash-shot-frame${!peer.online ? ' offline' : ''}"${previewStyle}>
          ${offlineOverlay}
          ${peer.latestScreenshotPreview ? '' : `<div class="dash-shot-empty">Waiting first frame</div>`}
        </div>
        <div class="dash-shot-meta">
          <div>
            <div class="dash-shot-name">${esc(peer.username || 'Unknown')}</div>
            <div class="dash-shot-sub">${esc(peer.systemInfo?.hostname || getPeerDisplayTitle(peer))}</div>
            ${connectionBadge}
          </div>
          <span class="dash-shot-action">${esc(actionLabel)}</span>
        </div>
        <div class="dash-shot-footer">
          <span>${esc(screenshot.capturedAt ? fmtClock(screenshot.capturedAt) : 'Waiting')}</span>
        </div>
      </article>`;
      }).join('');
    }

function setMonitorGroupFilter(groupId) {
      monitorGroupFilter = groupId || 'all';
      renderMonitorTab();
}

function setMonitorActionMode(mode) {
      monitorActionMode = mode === 'remote' ? 'remote' : 'preview';
      syncMonitorActionControls();
      renderMonitorTab();
}

function syncMonitorActionControls() {
      const previewBtn = document.getElementById('monitorAction-preview');
      const remoteBtn = document.getElementById('monitorAction-remote');
      const actionSub = document.getElementById('monitorActionSub');
      if (previewBtn) previewBtn.classList.toggle('active', monitorActionMode === 'preview');
      if (remoteBtn) remoteBtn.classList.toggle('active', monitorActionMode === 'remote');
      if (actionSub) {
        actionSub.textContent = monitorActionMode === 'remote'
          ? 'Clicking a device opens remote-session handoff (Sprint 5 hook).'
          : 'Clicking a device opens its latest preview.';
      }
}

function openMonitorTarget(peerId) {
      const peer = peers[peerId];
      if (!peer) return;
      if (monitorActionMode === 'remote') {
        openMonitorRemoteModal(peerId);
        return;
      }
      if (peer.latestScreenshotPreview) {
        openDashboardScreenshot(peerId);
        return;
      }
      if (!hasAdminAccess(peer.role)) requestScreenshot(peerId);
}

function clearMonitorRemoteTimer() {
      if (monitorRemoteStatusTimer) {
        clearTimeout(monitorRemoteStatusTimer);
        monitorRemoteStatusTimer = null;
      }
}

function renderMonitorRemoteModal() {
      const peer = peers[monitorRemoteSession.peerId];
      const title = document.getElementById('monitorRemoteTitle');
      const sub = document.getElementById('monitorRemoteSub');
      const badge = document.getElementById('monitorRemoteBadge');
      const target = document.getElementById('monitorRemoteTarget');
      const machine = document.getElementById('monitorRemoteMachine');
      const connection = document.getElementById('monitorRemoteConnection');
      const requestedAt = document.getElementById('monitorRemoteRequestedAt');
      const hint = document.getElementById('monitorRemoteHint');
      const requestBtn = document.getElementById('monitorRemoteRequestBtn');
      if (!title || !sub || !badge || !target || !machine || !connection || !requestedAt || !hint || !requestBtn) return;
      const status = monitorRemoteSession.status || 'idle';
      const statusLabels = {
        idle: 'Idle',
        connecting: 'Connecting',
        ready: 'Connected (Placeholder)',
        unavailable: 'Unavailable'
      };
      title.textContent = peer ? `Remote Session · ${peer.username || 'Unknown'}` : 'Remote Session';
      sub.textContent = peer
        ? `${peer.systemInfo?.hostname || getPeerDisplayTitle(peer)} · ${peer.online ? 'Connected' : 'Offline'}`
        : 'Target not found';
      badge.textContent = statusLabels[status] || 'Idle';
      target.textContent = peer?.username || '-';
      machine.textContent = peer ? (peer.systemInfo?.hostname || getPeerDisplayTitle(peer)) : '-';
      connection.textContent = peer ? (peer.online ? 'Connected' : 'Offline') : '-';
      requestedAt.textContent = monitorRemoteSession.requestedAt ? fmtClock(monitorRemoteSession.requestedAt) : '-';
      if (status === 'ready') {
        hint.textContent = 'Forced remote handoff is ready. Sprint 5 will mount the real remote desktop stream here.';
      } else if (status === 'connecting') {
        hint.textContent = 'Starting forced remote session...';
      } else if (status === 'unavailable') {
        hint.textContent = 'Target is offline now. Bring the device online, then connect again.';
      } else {
        hint.textContent = 'This is a Sprint 5 placeholder. Live forced remote desktop stream will mount in this panel.';
      }
      requestBtn.disabled = !peer || !peer.online || status === 'connecting';
      requestBtn.textContent = status === 'ready' ? 'Reconnect Now' : 'Connect Now';
}

function openMonitorRemoteModal(peerId) {
      const modal = document.getElementById('monitorRemoteModal');
      if (!modal) return;
      const peer = peers[peerId];
      clearMonitorRemoteTimer();
      monitorRemoteSession = {
        peerId,
        status: peer?.online ? 'connecting' : 'unavailable',
        requestedAt: Date.now()
      };
      renderMonitorRemoteModal();
      modal.classList.add('show');
      if (!peer?.online) return;
      monitorRemoteStatusTimer = setTimeout(() => {
        if (monitorRemoteSession.peerId !== peerId) return;
        monitorRemoteSession.status = peers[peerId]?.online ? 'ready' : 'unavailable';
        renderMonitorRemoteModal();
      }, 500);
}

function requestMonitorRemoteSession() {
      const peerId = monitorRemoteSession.peerId;
      if (!peerId) return;
      const peer = peers[peerId];
      clearMonitorRemoteTimer();
      if (!peer?.online) {
        monitorRemoteSession.status = 'unavailable';
        renderMonitorRemoteModal();
        showToast('Remote unavailable', 'Target is offline right now.', 'warn');
        return;
      }
      monitorRemoteSession.status = 'connecting';
      monitorRemoteSession.requestedAt = Date.now();
      renderMonitorRemoteModal();
      monitorRemoteStatusTimer = setTimeout(() => {
        if (monitorRemoteSession.peerId !== peerId) return;
        monitorRemoteSession.status = peers[peerId]?.online ? 'ready' : 'unavailable';
        renderMonitorRemoteModal();
      }, 800);
}

function closeMonitorRemoteModal() {
      document.getElementById('monitorRemoteModal')?.classList.remove('show');
      clearMonitorRemoteTimer();
}

function renderMonitorTab() {
      const grid = document.getElementById('monitorLiveGrid');
      const groupSelect = document.getElementById('monitorGroupFilter');
      if (!grid || !groupSelect) return;

      const options = [`<option value="all">All Devices</option>`]
        .concat((userGroups || []).map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`));
      groupSelect.innerHTML = options.join('');
      groupSelect.value = monitorGroupFilter || 'all';

      const group = (userGroups || []).find(g => g.id === monitorGroupFilter);
      const members = new Set(Array.isArray(group?.memberIds) ? group.memberIds : []);
      const allTargets = getSortedPeers().filter(p => !hasAdminAccess(p.role));
      const targets = monitorGroupFilter === 'all'
        ? allTargets
        : allTargets.filter(p => members.has(p.id));

      if (!targets.length) {
        grid.innerHTML = '<div class="empty"><div class="ei">Preview</div>No devices in this scope</div>';
        syncMonitorActionControls();
        syncScreenshotPollingControls();
        return;
      }

      grid.innerHTML = targets.slice(0, 60).map(peer => {
        const screenshot = getPeerScreenshotMeta(peer);
        const previewStyle = peer.latestScreenshotPreview
          ? ` style="background-image:url('${peer.latestScreenshotPreview.replace(/'/g, '%27')}')"`
          : '';
        const offlineOverlay = !peer.online ? '<div class="dash-shot-offline-mask"><span>OFFLINE</span></div>' : '';
        const connectionBadge = !peer.online
          ? '<span class="dash-shot-conn offline"><span class="dot"></span>OFF</span>'
          : '';
        const actionLabel = !peer.online
          ? 'Offline'
          : monitorActionMode === 'remote'
          ? 'Remote'
          : (peer.latestScreenshotPreview ? 'Open' : (peer.screenshotRequestPending ? 'Polling' : 'Request'));
        return `
      <article class="dash-shot-card ${screenshot.key}${!peer.online ? ' offline' : ''}" onclick="openMonitorTarget('${peer.id}')">
        <div class="dash-shot-frame${!peer.online ? ' offline' : ''}"${previewStyle}>
          ${offlineOverlay}
          ${peer.latestScreenshotPreview ? '' : `<div class="dash-shot-empty">Waiting first frame</div>`}
        </div>
        <div class="dash-shot-meta">
          <div>
            <div class="dash-shot-name">${esc(peer.username || 'Unknown')}</div>
            <div class="dash-shot-sub">${esc(peer.systemInfo?.hostname || getPeerDisplayTitle(peer))}</div>
            ${connectionBadge}
          </div>
          <span class="dash-shot-action">${esc(actionLabel)}</span>
        </div>
        <div class="dash-shot-footer">
          <span>${esc(screenshot.capturedAt ? fmtClock(screenshot.capturedAt) : 'Waiting')}</span>
        </div>
      </article>`;
      }).join('');
      syncMonitorActionControls();
      syncScreenshotPollingControls();
}

function openDashboardScreenshot(peerId) {
      const peer = peers[peerId];
      if (!peer?.latestScreenshotPreview) {
        requestScreenshot(peerId);
        return;
      }
      document.getElementById('ssTitle').textContent = `Screenshot - ${esc(peer.username || peerId)}`;
      document.getElementById('ssMeta').textContent = peer.latestScreenshot?.capturedAt
        ? new Date(peer.latestScreenshot.capturedAt).toLocaleString()
        : 'Latest preview';
      document.getElementById('ssLoading').style.display = 'none';
      const img = document.getElementById('screenshotImg');
      img.src = peer.latestScreenshotPreview;
      img.style.display = 'block';
      document.getElementById('screenshotModal').classList.add('show');
    }

function renderDashboardAlerts(helpCards, offlinePeers) {
      const alerts = [];

      if (helpCards.length) {
        const urgentCard = helpCards.find(card => card.dataset.priority === 'urgent');
        const card = urgentCard || helpCards[0];
        alerts.push({
          level: card.dataset.priority === 'urgent' ? 'danger' : 'warn',
          title: `Help request · ${card.dataset.username || 'User'}`,
          copy: card.dataset.description || 'A user is waiting for admin assistance.',
          meta: card.dataset.machine || 'Awaiting action',
          actionHtml: card.dataset.fromid && card.dataset.reqid
            ? `<button class="ubtn" onclick="event.stopPropagation(); openHelpConversation('${card.dataset.fromid}','${card.dataset.reqid}')">Open Chat</button>`
            : `<button class="ubtn" onclick="event.stopPropagation(); switchTab('help')">Open Queue</button>`
        });
      }

      if (offlinePeers.length) {
        const peer = offlinePeers[0];
        alerts.push({
          level: 'danger',
          title: `Peer offline · ${peer.username || 'Unknown device'}`,
          copy: 'This device is currently unavailable for broadcasts, direct replies, and remote assistance.',
          meta: peer.systemInfo?.hostname || peer.systemInfo?.ip || getPeerDisplayTitle(peer),
          actionHtml: `<button class="ubtn" onclick="event.stopPropagation(); openChat('${peer.id}')">Open Chat</button>`
        });
      }

      if (!alerts.length) return '<div class="empty"><div class="ei">Alerts</div>No active alerts</div>';

      return alerts.slice(0, 2).map(item => `
      <article class="dash-alert-card ${item.level}">
        <div class="dash-alert-title">${esc(item.title)}</div>
        <div class="dash-alert-copy">${esc(item.copy)}</div>
        <div class="dash-alert-meta">${esc(item.meta)}</div>
        <div class="dash-alert-actions">${item.actionHtml || ''}</div>
      </article>`).join('');
    }

function renderDashboard() {
      const sortedPeers = getSortedPeers();
      const online = sortedPeers.filter(p => p.online).length;
      const total = sortedPeers.length;
      const offline = Math.max(0, total - online);
      const offlinePeers = sortedPeers.filter(p => !p.online);
      const admins = sortedPeers.filter(p => p.role === 'admin').length;
      const openHelpCards = [...document.querySelectorAll('#helplist .hcard:not([style*="opacity"])')];
      const openHelp = openHelpCards.length;
      const presencePercent = total ? Math.round((online / total) * 100) : 0;
      const activityCount = dashboardActivity.length;
      const responsePressure = online ? Math.round((openHelp / online) * 100) : (openHelp ? 100 : 0);
      const urgentCount = openHelpCards.filter(card => card.dataset.priority === 'urgent').length;
      pushDashboardSeries('presence', presencePercent);
      pushDashboardSeries('pressure', responsePressure);

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      const setHtml = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
      };

      animateCounter('metricOnline', online);
      setText('metricOnlineSub', total ? `${offline} offline out of ${total} discovered devices` : 'No active devices yet');
      setText('metricOnlineTrend', total ? `${presencePercent}% fleet coverage` : 'Waiting for peers');

      animateCounter('metricHelp', openHelp);
      setText('metricHelpSub', openHelp ? `${urgentCount} urgent, ${Math.max(0, openHelp - urgentCount)} standard` : 'No pending issues');
      setText('metricHelpTrend', openHelp ? `Response load ${responsePressure}%` : 'Queue is clear');

      animateCounter('metricGroups', presencePercent, '%');
      setText('metricGroupsSub', total ? `${online} of ${total} endpoints are currently reachable` : 'Fleet reachability for live sends');
      setText('metricGroupsTrend', total ? (presencePercent >= 75 ? 'Ready to broadcast' : presencePercent >= 40 ? 'Partial delivery path' : 'Limited delivery path') : 'Waiting for peers');

      animateCounter('metricActivity', activityCount);
      setText('metricActivitySub', activityCount ? 'Recent admin-side events are being tracked' : 'Replies, broadcasts, and chats');
      setText('metricActivityTrend', activityCount ? 'Timeline is live' : 'Live operations feed');

      animateCounter('signalPresenceValue', presencePercent, '%');
      setText('signalPresenceTag', total ? (presencePercent >= 75 ? 'Healthy' : presencePercent >= 40 ? 'Mixed' : 'Thin') : 'Idle');
      setText('signalPresenceCopy', total ? `${online} of ${total} discovered peers are currently reachable on the LAN.` : 'The percentage of discovered users currently online.');

      const pressureLabel = responsePressure >= 70 ? 'High' : responsePressure >= 30 ? 'Medium' : 'Low';
      setText('signalPressureValue', pressureLabel);
      setText('signalPressureTag', openHelp ? `${openHelp} open` : 'Stable');
      setText('signalPressureCopy', openHelp ? `${openHelp} pending help request(s) spread across ${Math.max(online, 1)} reachable users.` : 'Measures help queue load against available online users.');

      const statusDot = document.getElementById('dashStatusDot');
      if (statusDot) statusDot.classList.toggle('off', !(networkReady && networkOnline));
      setText('dashStatusText', networkReady && networkOnline ? 'Monitoring live network activity' : 'Monitoring offline');
      setText('dashHeadline', openHelp ? `You have ${openHelp} help request${openHelp === 1 ? '' : 's'} awaiting action` : 'Admin operations at a glance');
      setText('dashSummary', networkReady && networkOnline
        ? 'Track network presence, help queue pressure, message delivery, and rapid response actions from one control surface.'
        : 'The dashboard is ready, but the network is currently disconnected. Data will animate as peers come online.');

      const ring = document.getElementById('presenceRing');
      if (ring) ring.style.setProperty('--ring-angle', `${Math.max(8, Math.round((presencePercent / 100) * 360))}deg`);
      animateCounter('ringValue', presencePercent, '%');
      setText('ringHeadline', total ? `${online} reachable endpoint${online === 1 ? '' : 's'} across your LAN` : 'No active network coverage yet');
      setText('ringCopy', total
        ? 'Broadcasts, help routing, and screen controls will follow the reachable portion of your discovered devices.'
        : 'As users appear on the LAN, this ring will reflect how much of your discovered fleet is currently reachable for broadcasts and assistance.');
      animateCounter('presenceReachable', online);
      animateCounter('presenceOffline', offline);
      animateCounter('presenceAdmins', admins);

      setHtml('presenceSpark', renderMiniChart(dashboardSeries.presence, 'green'));
      setHtml('pressureSpark', renderMiniChart(dashboardSeries.pressure, ''));
      setHtml('dashDeviceGrid', renderDashboardDeviceGrid(sortedPeers));
      setHtml('dashScreenshotGrid', renderDashboardScreenshotWall(sortedPeers));
      syncScreenshotPollingControls();
      setHtml('dashAlertList', renderDashboardAlerts(openHelpCards, offlinePeers));

      const miniList = document.getElementById('dashMiniList');
      if (miniList) {
        miniList.innerHTML = [
          {
            cls: networkReady && networkOnline ? 'mini-dot' : 'mini-dot off',
            title: networkReady && networkOnline ? 'LAN connectivity is healthy' : 'Network link is unavailable',
            copy: networkReady && networkOnline ? 'This device is ready to discover peers and route admin actions.' : 'Reconnect this device to resume peer discovery and live admin control.'
          },
          {
            cls: openHelp ? 'mini-dot warn' : 'mini-dot',
            title: openHelp ? `${openHelp} active ticket${openHelp === 1 ? '' : 's'} in queue` : 'Help queue is clear',
            copy: openHelp ? 'Open the Help Requests tab to acknowledge or respond quickly.' : 'No one is currently waiting on admin assistance.'
          },
          {
            cls: offline ? 'mini-dot warn' : 'mini-dot',
            title: offline ? `${offline} peer${offline === 1 ? '' : 's'} offline` : 'All discovered peers are reachable',
            copy: offline ? 'Some endpoints may miss broadcasts until they reconnect.' : 'Every discovered endpoint is currently available for action.'
          }
        ].map(item => `
      <div class="mini-item">
        <div class="${item.cls}"></div>
        <div class="mini-copy">
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.copy)}</span>
        </div>
      </div>
    `).join('');
      }

      const timeline = document.getElementById('dashTimeline');
      if (timeline) {
        timeline.innerHTML = dashboardActivity.length ? dashboardActivity.map(item => `
      <div class="timeline-item ${esc(item.kind)}">
        <div class="timeline-icon">${item.kind === 'help' ? '!' : item.kind === 'broadcast' ? 'B' : item.kind === 'reply' ? 'R' : 'S'}</div>
        <div class="timeline-copy">
          <strong>${esc(item.title)}</strong>
          <p>${esc(item.detail)}</p>
          <div class="timeline-meta">
            <span>${esc(item.meta || 'Live event')}</span>
            <span>${esc(item.time)}</span>
          </div>
        </div>
      </div>
    `).join('') : '<div class="empty"><div class="ei">•</div>No activity yet</div>';
      }
    }

function renderMyProfile() {
      const av = document.getElementById('myav');
      const meForAvatar = _appMode === 'client' ? { ...me, role: 'user' } : me;
      const currentUserName = getCurrentUserDisplayName(me);
      applyAvatar(av, meForAvatar);
      const verifiedIcon = verifiedSuperIconHTML(me.role);
      const badge = roleBadgeHTML(me.role);
      document.getElementById('myname').innerHTML = `<span class="mname-main"><span class="mname-text">${esc(currentUserName)}</span>${verifiedIcon}</span>${badge}`;
      document.getElementById('mytitle').textContent = getPeerDisplayTitle(me);
      const isSuper = _appMode !== 'client' && isSuperAdminRole(me.role);
      document.getElementById('admin-badge').textContent = isSuper ? 'CONTROL' : 'READY';
      const adminNote = document.querySelector('.admin-note');
      const adminBadge = document.getElementById('admin-badge');
      if (adminNote) adminNote.style.display = _appMode === 'client' ? 'none' : '';
      if (adminBadge) adminBadge.style.display = _appMode === 'client' ? 'none' : '';
      const lockCard = document.querySelector('.lock-card');
      const lockNote = document.getElementById('lockCardNote');
      if (lockCard) lockCard.classList.toggle('disabled', !isSuper);
      if (lockNote) lockNote.textContent = isSuper ? 'Full device control enabled.' : 'Screen lock requires control mode.';
    }

function applyRoleState() {
      // In client mode the APP_MODE overrides the saved profile role:
      // always treat the user as non-admin so .utab tabs show and .atab tabs hide.
      const isAdmin = _appMode !== 'client' && hasAdminAccess(me.role);
      const isSuper = _appMode !== 'client' && me.role === 'super_admin';
      document.body.classList.toggle('is-admin', isAdmin);
      document.body.classList.toggle('is-user', !isAdmin);
      document.body.classList.toggle('is-super', isSuper);
      if (isAdmin && document.querySelector('.tb.active')?.dataset.tab === 'ask') switchTab('chat');
    }

function renderPeerList() {
      const list = document.getElementById('peer-list');
      const heading = document.getElementById('peerListHeading');
      const peerCountEl = document.getElementById('broadcast-peer-count') || document.getElementById('peer-count');
      const search = getSidebarSearchValue();
      const totalPeers = getSortedPeers().length;
      if (peerCountEl) peerCountEl.textContent = `${totalPeers} peer${totalPeers === 1 ? '' : 's'}`;
      list.innerHTML = '';
      const sorted = getSortedPeers().filter(p => matchesPeerSearch(p, search));
      if (heading) heading.textContent = `Online · ${sorted.filter(p => p.online).length}`;
      if (!sorted.length && search) {
        if (heading) heading.textContent = 'Search';
        list.innerHTML = '<div style="padding:18px 13px;text-align:center;color:var(--txt3);font-size:11px;">No users match your search.</div>';
        return;
      }
      if (!sorted.length) {
        if (heading) heading.textContent = 'Online · 0';
        list.innerHTML = '<div style="padding:18px 13px;text-align:center;color:var(--txt3);font-size:11px;">No peers found on LAN<br><span style="font-size:10px;animation:pulse 1.5s infinite;display:inline-block;margin-top:4px;">Searching…</span></div>';
        return;
      }
      const onlinePeers = sorted.filter(p => p.online);
      const offlinePeers = sorted.filter(p => !p.online);
      const renderPeerCard = p => {
        const verifiedIcon = verifiedSuperIconHTML(p.role);
        const roleBadge = roleBadgeHTML(p.role);
        const subtitle = esc(getPeerDisplayTitle(p));
        const trust = getPeerTrustState(p);
        const connection = getPeerConnectionMeta(p);
        const el = document.createElement('div');
        el.className = 'pi' + (p.role === 'super_admin' ? ' super-card' : '') + (p.id === activePeerId ? ' active' : '');
        el.dataset.pid = p.id; el.onclick = () => openChat(p.id);
        const u = unread[p.id] || 0;
        const sideTag = p.identityRejected
          ? `<span class="peer-state-tag changed">${trust.shortLabel}</span>`
          : connection.reachable
          ? (u ? `<div class="ubadge">${u}</div>` : '<span class="peer-state-tag ack">LIVE</span>')
          : `<span class="peer-state-tag ${!p.identityVerified ? 'verify' : connection.key}">${!p.identityVerified ? trust.shortLabel : connection.shortLabel}</span>`;
        el.innerHTML = `
      ${avatarHTML(p, 's32')}
      <div class="pmeta">
        <div class="pname"><span class="pname-text" title="${esc(p.username)}">${esc(p.username)}</span>${verifiedIcon}${roleBadge}</div>
        <div class="psub">
          <span class="psubtitle">${subtitle}</span>
          <span class="psubtitle trust-line ${trust.key}">${trust.label}</span>
        </div>
      </div>
      <div class="ptrail">
        <span class="pstatus-dot ${connection.reachable ? '' : connection.key === 'offline' ? 'off' : connection.key}" aria-label="${esc(connection.label)}"><span class="mini-state"></span></span>
        ${sideTag}
      </div>
    `;
        list.appendChild(el);
      };
      onlinePeers.forEach(renderPeerCard);
      if (offlinePeers.length) {
        const offlineHeading = document.createElement('div');
        offlineHeading.className = 'slabel peer-subhead';
        offlineHeading.textContent = `Offline · ${offlinePeers.length}`;
        list.appendChild(offlineHeading);
        offlinePeers.forEach(renderPeerCard);
      }
    }

function buildUserDetailedSegments(peer) {
      const events = normalizeActivityEvents(peer);
      const segments = [];
      let cursorState = 'offline';
      let cursorAt = null;
      const pushSegment = (from, to, state) => {
        const start = Number(from || 0);
        const end = Number(to || 0);
        if (!start || !end || end <= start) return;
        // Ignore micro-segments so timeline stays readable and meaningful.
        if ((end - start) < 1000) return;
        segments.push({ from: start, to: end, state });
      };
      for (const event of events) {
        if (event.type === 'online') {
          if (cursorAt && event.at > cursorAt) pushSegment(cursorAt, event.at, cursorState);
          cursorState = 'active';
          cursorAt = event.at;
          continue;
        }
        if (event.type === 'active' || event.type === 'idle' || event.type === 'offline') {
          if (cursorAt && event.at > cursorAt) pushSegment(cursorAt, event.at, cursorState);
          cursorState = event.type;
          cursorAt = event.at;
        }
      }
      if (cursorAt && Date.now() > cursorAt) pushSegment(cursorAt, Date.now(), cursorState);
      if (!segments.length) return segments;
      // Heartbeat/session markers can split one logical state interval into many short
      // adjacent pieces; merge contiguous intervals with the same state for clean timelines.
      const merged = [segments[0]];
      for (let i = 1; i < segments.length; i++) {
        const prev = merged[merged.length - 1];
        const current = segments[i];
        if (prev.state === current.state && current.from <= (prev.to + 1000)) {
          prev.to = Math.max(prev.to, current.to);
          continue;
        }
        merged.push(current);
      }
      return merged;
}

function formatTimelineClock(ts) {
      const value = Number(ts || 0);
      if (!value) return '-';
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDurationPrecise(ms) {
      const safe = Math.max(0, Number(ms || 0));
      const totalSeconds = Math.floor(safe / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
      if (minutes > 0) return `${minutes}m ${seconds}s`;
      return `${seconds}s`;
}

function renderUserTimelineRows() {
      const body = document.getElementById('userTimelineTableBody');
      const label = document.getElementById('userTimelineFilterLabel');
      if (!body) return;
      const filtered = userTimelineSegments
        .filter(seg => userTimelineFilter === 'all' ? true : seg.state === userTimelineFilter)
        .slice(-200)
        .reverse();
      if (label) label.textContent = userTimelineFilter === 'all' ? 'All states' : `${userTimelineFilter} only`;
      if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="4" class="activity-line-empty">No intervals in this filter.</td></tr>';
        return;
      }
      body.innerHTML = filtered.map(seg => `
      <tr>
        <td>${esc(formatTimelineClock(seg.from))}</td>
        <td>${esc(formatTimelineClock(seg.to))}</td>
        <td>${esc(formatDurationPrecise(Math.max(0, Number(seg.to) - Number(seg.from))))}</td>
        <td><span class="directory-tag ${seg.state === 'active' ? 'online' : seg.state === 'idle' ? 'degraded' : 'offline'}">${esc(seg.state.toUpperCase())}</span></td>
      </tr>`).join('');
}

function setUserTimelineFilter(filter) {
      userTimelineFilter = (filter === 'active' || filter === 'idle' || filter === 'offline') ? filter : 'all';
      document.getElementById('timelineFilter-all')?.classList.toggle('active', userTimelineFilter === 'all');
      document.getElementById('timelineFilter-active')?.classList.toggle('active', userTimelineFilter === 'active');
      document.getElementById('timelineFilter-idle')?.classList.toggle('active', userTimelineFilter === 'idle');
      document.getElementById('timelineFilter-offline')?.classList.toggle('active', userTimelineFilter === 'offline');
      renderUserTimelineRows();
}

function openUserTimelineModal(peerId) {
      const peer = peers[peerId];
      const modal = document.getElementById('userTimelineModal');
      if (!peer || !modal) return;
      userTimelinePeerId = peerId;
      userTimelineSegments = buildUserDetailedSegments(peer);
      document.getElementById('userTimelineTitle').textContent = `${peer.username || 'User'} - Detailed Timeline`;
      document.getElementById('userTimelineSub').textContent = `${peer.systemInfo?.hostname || getPeerDisplayTitle(peer)} · ${peer.online ? 'Connected' : 'Offline'}`;
      setUserTimelineFilter('all');
      modal.classList.add('show');
}

function closeUserTimelineModal() {
      document.getElementById('userTimelineModal')?.classList.remove('show');
      userTimelinePeerId = null;
}

function openUserStatsModal(peerId) {
      const peer = peers[peerId];
      const modal = document.getElementById('userStatsModal');
      const body = document.getElementById('userStatsBody');
      if (!peer || !modal || !body) return;
      const summary = getPeerActivitySummary(peer);
      const timeline = getPeerActivityTimelineItems(peer, 8);
      const detailedSegments = buildUserDetailedSegments(peer);
      const formatTs = ts => Number(ts || 0) ? new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
      const offlinePeriods = detailedSegments.filter(seg => seg.state === 'offline').length;
      const staleMs = summary.lastSeenAt ? Math.max(0, Date.now() - Number(summary.lastSeenAt)) : null;
      const dataFreshness = staleMs == null ? 'No recent heartbeat' : `${fmtDuration(staleMs)} ago`;
      const currentStateLabel = peer.online ? (peer.activityState === 'idle' ? 'Idle' : 'Active') : 'Offline';
      const sessionEndLabel = peer.online ? 'Ongoing' : (summary.lastSeenAt ? formatTs(summary.lastSeenAt) : '-');
      body.innerHTML = `
    <div class="activity-timeline-card compact">
      <div class="activity-timeline-head"><strong>System Presence</strong><span>${esc(dataFreshness)}</span></div>
      <div class="activity-summary-grid compact">
        <div class="activity-summary-card"><strong>First Seen</strong><span>${esc(summary.firstSeenAt ? formatTs(summary.firstSeenAt) : '-')}</span></div>
        <div class="activity-summary-card"><strong>Last Seen</strong><span>${esc(summary.lastSeenAt ? formatTs(summary.lastSeenAt) : '-')}</span></div>
        <div class="activity-summary-card"><strong>Current State</strong><span>${esc(currentStateLabel)}</span></div>
        <div class="activity-summary-card"><strong>State Duration</strong><span>${esc(summary.currentStateDuration != null ? fmtDuration(summary.currentStateDuration) : '-')}</span></div>
      </div>
    </div>

    <div class="activity-timeline-card compact">
      <div class="activity-timeline-head"><strong>Today Summary</strong><span>${esc(`${summary.sessionsToday} session(s)`)}</span></div>
      <div class="activity-summary-grid compact">
        <div class="activity-summary-card"><strong>Total Active</strong><span>${esc(fmtDuration(summary.activeMs))}</span></div>
        <div class="activity-summary-card"><strong>Total Idle</strong><span>${esc(fmtDuration(summary.idleMs))}</span></div>
        <div class="activity-summary-card"><strong>Offline Periods</strong><span>${esc(String(offlinePeriods))}</span></div>
        <div class="activity-summary-card"><strong>Last Active Input</strong><span>${esc(summary.lastActiveAt ? formatTs(summary.lastActiveAt) : '-')}</span></div>
      </div>
    </div>

    <div class="activity-timeline-card compact">
      <div class="activity-timeline-head"><strong>Current / Last Session</strong><span>${esc(peer.online ? 'Live session' : 'Closed session')}</span></div>
      <div class="activity-summary-grid compact">
        <div class="activity-summary-card"><strong>Session Start</strong><span>${esc(summary.sessionStartAt ? formatTs(summary.sessionStartAt) : '-')}</span></div>
        <div class="activity-summary-card"><strong>Session End</strong><span>${esc(sessionEndLabel)}</span></div>
        <div class="activity-summary-card"><strong>Last Transition</strong><span>${esc(timeline[0] ? `${timeline[0].label} @ ${formatTs(timeline[0].at)}` : '-')}</span></div>
        <div class="activity-summary-card"><strong>Connectivity</strong><span>${esc(peer.online ? 'Connected' : 'Offline')}</span></div>
      </div>
    </div>

    <div class="activity-summary-grid compact">
      <div class="activity-summary-card" style="grid-column:1 / -1;">
        <strong>Detailed Timeline</strong>
        <button class="ubtn ghost" style="margin-top:6px;" onclick="openUserTimelineModal('${peer.id}')">Open Timeline</button>
      </div>
    </div>
    `;
      document.getElementById('userStatsTitle').textContent = `${peer.username || 'User'} - Activity Stats`;
      document.getElementById('userStatsSub').textContent = `${peer.systemInfo?.hostname || getPeerDisplayTitle(peer)} · ${peer.online ? 'Connected' : 'Offline'}`;
      modal.classList.add('show');
}

function closeUserStatsModal() {
      document.getElementById('userStatsModal')?.classList.remove('show');
}

function openUserActionsModal(peerId) {
      const peer = peers[peerId];
      const modal = document.getElementById('userActionsModal');
      if (!peer || !modal) return;
      userActionPeerId = peerId;
      const title = document.getElementById('userActionsTitle');
      const sub = document.getElementById('userActionsSub');
      const lockBtn = document.getElementById('userActionLockBtn');
      if (title) title.textContent = `${peer.username || 'User'} · Actions`;
      if (sub) sub.textContent = `${peer.systemInfo?.hostname || getPeerDisplayTitle(peer)} · ${peer.online ? 'Connected' : 'Offline'}`;
      if (lockBtn) lockBtn.textContent = peer.deviceLocked ? 'Unlock Device' : 'Lock Device';
      modal.classList.add('show');
}

function closeUserActionsModal() {
      document.getElementById('userActionsModal')?.classList.remove('show');
      userActionPeerId = null;
}

function openRunScriptModal(peerId) {
      const peer = peers[peerId];
      if (!peer) return;
      const modal = document.getElementById('runScriptModal');
      const title = document.getElementById('runScriptTitle');
      const input = document.getElementById('runScriptInput');
      if (!modal || !title || !input) return;
      if (!peer.online) {
        showToast('Action blocked', `${peer.username || 'Peer'} is offline.`, 'warn');
        return;
      }
      modal.dataset.peerId = peerId;
      title.textContent = `Run Script · ${peer.username || 'User'}`;
      input.value = '';
      modal.classList.add('show');
      setTimeout(() => input.focus(), 30);
}

function closeRunScriptModal() {
      const modal = document.getElementById('runScriptModal');
      const input = document.getElementById('runScriptInput');
      if (!modal) return;
      modal.classList.remove('show');
      modal.dataset.peerId = '';
      modal.dataset.groupId = '';
      if (input) input.value = '';
}

function submitRunScriptAction() {
      const modal = document.getElementById('runScriptModal');
      const input = document.getElementById('runScriptInput');
      const peerId = String(modal?.dataset?.peerId || '');
      const groupId = String(modal?.dataset?.groupId || '');
      const script = String(input?.value || '').trim();
      if (!script) {
        showToast('Script required', 'Please enter PowerShell script.', 'warn');
        return;
      }
      closeRunScriptModal();
      if (groupId && typeof executeGroupDeviceAction === 'function') {
        void executeGroupDeviceAction(groupId, 'run_script', script);
        return;
      }
      if (peerId) {
        void executePeerDeviceAction(peerId, 'run_script', script);
      }
}

function executeActiveUserAction(action) {
      const peerId = String(userActionPeerId || '');
      if (!peerId) return;
      if (action === 'run_script') {
        closeUserActionsModal();
        openRunScriptModal(peerId);
        return;
      }
      if (action === 'lock_toggle') {
        const peer = peers[peerId];
        const next = peer?.deviceLocked ? 'unlock_device' : 'lock_device';
        void executePeerDeviceAction(peerId, next);
        return;
      }
      void executePeerDeviceAction(peerId, action);
}

async function executePeerDeviceAction(peerId, action, scriptOverride = '') {
      const peer = peers[peerId];
      if (!peer) {
        showToast('Action failed', 'Peer not found.', 'warn');
        return;
      }
      if (!peer.online) {
        showToast('Action blocked', `${peer.username || 'Peer'} is offline.`, 'warn');
        return;
      }

      const labels = {
        lock_device: 'Lock Device',
        unlock_device: 'Unlock Device',
        restart_device: 'Restart Device',
        shutdown_device: 'Shutdown Device',
        signout_device: 'Signout Device',
        clean_temp: 'Clean Temp',
        flush_dns: 'Flush DNS',
        run_script: 'Run Script'
      };

      const script = action === 'run_script' ? String(scriptOverride || '').trim() : '';
      if (action === 'run_script' && !script) return;

      if (action === 'restart_device' || action === 'shutdown_device' || action === 'signout_device') {
        const ok = await appConfirm({
          title: labels[action],
          message: `Confirm ${labels[action]} for ${peer.username || 'this user'}?`,
          okLabel: 'Confirm'
        });
        if (!ok) return;
      }

      try {
        const result = await IPC.executePeerDeviceAction({ peerId, action, script: script || undefined });
        if (result?.success) {
          addDashboardActivity('system', `${peer.username || 'Peer'} · ${labels[action]}`, 'Device action command queued.', peer.systemInfo?.hostname || getPeerDisplayTitle(peer));
          showToast('Action sent', `${labels[action]} sent to ${peer.username || 'peer'}.`);
          if (action === 'lock_device') peers[peerId].deviceLocked = true;
          if (action === 'unlock_device') peers[peerId].deviceLocked = false;
          const lockBtn = document.getElementById('userActionLockBtn');
          if (lockBtn && userActionPeerId === peerId) lockBtn.textContent = peers[peerId].deviceLocked ? 'Unlock Device' : 'Lock Device';
          return;
        }
        showToast('Action failed', result?.error || 'Could not send action command.', 'warn');
      } catch (error) {
        console.error('[OpsLynk] executePeerDeviceAction failed', error);
        showToast('Action failed', 'Unexpected error while sending action command.', 'warn');
      }
}

function renderUsersTab() {
      const list = document.getElementById('userslist');
      if (!list) return;
      const search = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
      const sort = document.getElementById('userSort')?.value || 'status';
      document.getElementById('userFilterAll')?.classList.toggle('active', userFilter === 'all');
      document.getElementById('userFilterOnline')?.classList.toggle('active', userFilter === 'online');
      document.getElementById('userFilterOffline')?.classList.toggle('active', userFilter === 'offline');
      document.getElementById('userFilterAdmins')?.classList.toggle('active', userFilter === 'admins');

      let filtered = getSortedPeers().filter(p => {
        if (userFilter === 'online' && !p.online) return false;
        if (userFilter === 'offline' && p.online) return false;
        if (userFilter === 'admins' && !hasAdminAccess(p.role)) return false;
        if (!search) return true;
        return matchesPeerSearch(p, search);
      });

      filtered.sort((a, b) => {
        if (sort === 'name') return String(a.username || '').localeCompare(String(b.username || ''));
        if (sort === 'role') return roleRank(b.role) - roleRank(a.role) || Number(b.online) - Number(a.online) || String(a.username || '').localeCompare(String(b.username || ''));
        return comparePeers(a, b);
      });

      list.innerHTML = filtered.length ? `<div class="directory-grid compact">${filtered.map(p => {
        const initials = esc(String(p.username || '?').slice(0, 2).toUpperCase());
        const connection = getPeerConnectionMeta(p);
        const hostname = esc(p.systemInfo?.hostname || '-');
        const ip = esc(p.systemInfo?.ip || '-');
        const roleLabel = esc(getRoleLabel(p.role));

        return `
    <article class="directory-card compact${p.online ? '' : ' offline'}">
      <div class="directory-top compact">
        <div class="directory-avatar">${initials}</div>
        <div class="directory-id">
          <div class="directory-name">${esc(p.username || 'Unknown')}</div>
          <div class="directory-sub">${esc(getPeerDisplayTitle(p))} · ${hostname}</div>
        </div>
        <div class="directory-dot${p.online ? '' : ' off'}"></div>
      </div>

      <div class="directory-tags compact">
        <span class="directory-tag role">${roleLabel}</span>
        <span class="directory-tag ${p.online ? 'online' : connection.key}">${p.online ? 'Connected' : 'Offline'}</span>
      </div>

      <div class="directory-quick-meta">
        <span>IP: ${ip}</span>
      </div>

      <div class="directory-actions compact">
        <button class="ubtn" onclick="event.stopPropagation(); openChat('${p.id}')">Open Chat</button>
        <div class="spec-action-stack">
          <button class="ubtn" onclick="event.stopPropagation(); openSpecsModal('${p.id}')">View Specs</button>
        </div>
        <button class="ubtn" onclick="event.stopPropagation(); openUserStatsModal('${p.id}')">View Stats</button>
        <button class="ubtn" onclick="event.stopPropagation(); openUserActionsModal('${p.id}')">Actions</button>
      </div>
    </article>`;
      }).join('')}</div>`
        : '<div class="empty-glass"><div class="ei">Users</div>No users match the current filters.</div>';
    }

function specValue(value, suffix = '') {
      return value || value === 0 ? `${value}${suffix}` : '-';
    }

function updateConnPill() {
      const cp = document.getElementById('conn-pill');
      if (!cp) return;
      const setConnState = (label, cls) => {
        cp.className = cls;
        cp.innerHTML = `<span class="conn-dot" aria-hidden="true"></span><span class="conn-label">${label}</span>`;
      };
      const onlinePeers = getSortedPeers().filter(p => p.online);
      const onlineAdmins = onlinePeers.filter(p => hasAdminAccess(p.role));
      const hasSessionPeer = _appMode === 'client' ? onlineAdmins.length > 0 : onlinePeers.length > 0;
      if (!networkReady || !networkOnline) {
        setConnState('Disconnected', 'off');
      } else if (hasSessionPeer) {
        setConnState('Connected', 'live');
      } else {
        setConnState('Searching...', 'searching');
      }
      renderDashboard();
    }

function syncNetworkStatus() {
      networkOnline = typeof navigator !== 'undefined' ? navigator.onLine : networkOnline;
      updateConnPill();
    }

function updateActivePeerStatus() {
      if (!activePeerId) return;
      const peer = peers[activePeerId];
      const status = document.getElementById('cpstatus');
      if (!peer || !status) return;
      const connection = getPeerConnectionMeta(peer);
      status.textContent = `${connection.reachable ? '●' : '○'} ${connection.chatLabel}`;
      status.style.color = connection.key === 'online' ? 'var(--green)' : connection.key === 'degraded' ? 'var(--amber)' : 'var(--txt3)';
    }

function ensureChatLayout() {
      const welcome = document.getElementById('welcome');
      const active = document.getElementById('activechat');
      const input = document.getElementById('inputarea');
      if (!welcome || !active || !input) return;
      const hasPeer = !!(activePeerId && peers[activePeerId]);
      welcome.style.display = hasPeer ? 'none' : 'flex';
      active.style.display = hasPeer ? 'flex' : 'none';
      input.style.display = hasPeer ? 'flex' : 'none';
    }

function sanitizeVisibleText() {
      document.querySelectorAll('#tabbar .tb').forEach(btn => {
        const tab = btn.dataset.tab;
        const labels = {
          chat: 'Chat',
          dashboard: 'Dashboard',
          broadcast: 'Broadcast',
          replies: 'Replies',
          users: 'Users',
          monitor: 'Monitor',
          groups: 'Groups',
          help: 'Help Requests',
          ask: 'Ask For Help'
        };
        if (labels[tab]) btn.textContent = labels[tab];
      });
      const welcomeIcon = document.querySelector('#welcome .wi');
      if (welcomeIcon) welcomeIcon.textContent = '+';
      const sendFileBtn = document.querySelector('#chat-hdr .hbtn');
      if (sendFileBtn) sendFileBtn.textContent = 'File';
      const emojiBtn = document.getElementById('ebtoggle');
      if (emojiBtn) emojiBtn.textContent = ':)';
      const msgInput = document.getElementById('msginput');
      if (msgInput) msgInput.placeholder = 'Type a message...';
      const sendBtn = document.getElementById('sendbtn');
      if (sendBtn) sendBtn.textContent = 'Send';
    }
