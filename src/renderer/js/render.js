function ensureDashboardTabButton() {
      if (_appMode === 'client') return;
      const bar = document.getElementById('tabbar');
      if (!bar || bar.querySelector('[data-tab="dashboard"]')) return;
      const btn = document.createElement('button');
      btn.className = 'tb atab';
      btn.dataset.tab = 'dashboard';
      btn.textContent = 'Dashboard';
      btn.onclick = () => switchTab('dashboard');
      const chatBtn = bar.querySelector('[data-tab="chat"]');
      if (chatBtn?.nextSibling) bar.insertBefore(btn, chatBtn.nextSibling);
      else bar.appendChild(btn);
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
    </div>`;
    }

function pushDashboardSeries(key, value) {
      dashboardSeries[key].push(value);
      dashboardSeries[key] = dashboardSeries[key].slice(-8);
    }

function addDashboardActivity(kind, title, detail, meta = '') {
      if (!document.getElementById('dashTimeline')) return; // client mode — no dashboard
      const stamp = new Date();
      dashboardActivity.unshift({
        id: `${stamp.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
        kind,
        title,
        detail,
        meta,
        time: stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      dashboardActivity = dashboardActivity.slice(0, 18);
      renderDashboard();
    }

function clearDashboardActivity() {
      dashboardActivity = [];
      renderDashboard();
    }

function renderDashboard() {
      const online = getSortedPeers().filter(p => p.online).length;
      const total = getSortedPeers().length;
      const offline = Math.max(0, total - online);
      const admins = getSortedPeers().filter(p => p.role === 'admin').length;
      const openHelp = document.querySelectorAll('#helplist .hcard:not([style*="opacity"])').length;
      const presencePercent = total ? Math.round((online / total) * 100) : 0;
      const activityCount = dashboardActivity.length;
      const responsePressure = online ? Math.round((openHelp / online) * 100) : (openHelp ? 100 : 0);
      const urgentCount = document.querySelectorAll('#helplist .hcard.urgent:not([style*="opacity"])').length;
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

      animateCounter('metricGroups', userGroups.length);
      setText('metricGroupsSub', userGroups.length ? `${userGroups.reduce((sum, group) => sum + (group.memberIds?.length || 0), 0)} saved member links` : 'Audience presets ready');
      setText('metricGroupsTrend', userGroups.length ? 'Targeted delivery ready' : 'Create your first group');

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
      applyAvatar(av, meForAvatar);
      const badge = _appMode !== 'client' ? roleBadgeHTML(me.role) : '';
      document.getElementById('myname').innerHTML = `${esc(me.username)} ${badge}`;
      document.getElementById('mytitle').textContent = getPeerDisplayTitle(me);
      const isSuper = _appMode !== 'client' && isSuperAdminRole(me.role);
      document.getElementById('admin-badge').textContent = isSuper ? 'CONTROL' : 'READY';
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
      const peerCountEl = document.getElementById('broadcast-peer-count') || document.getElementById('peer-count');
      const search = getSidebarSearchValue();
      const totalPeers = getSortedPeers().length;
      if (peerCountEl) peerCountEl.textContent = `${totalPeers} peer${totalPeers === 1 ? '' : 's'}`;
      list.innerHTML = '';
      const sorted = getSortedPeers().filter(p => matchesPeerSearch(p, search));
      if (!sorted.length && search) {
        list.innerHTML = '<div style="padding:18px 13px;text-align:center;color:var(--txt3);font-size:11px;">No users match your search.</div>';
        return;
      }
      if (!sorted.length) {
        list.innerHTML = '<div style="padding:18px 13px;text-align:center;color:var(--txt3);font-size:11px;">No peers found on LAN<br><span style="font-size:10px;animation:pulse 1.5s infinite;display:inline-block;margin-top:4px;">Searching…</span></div>';
        return;
      }
      sorted.forEach(p => {
        const roleBadge = roleBadgeHTML(p.role);
        const subtitle = esc(getPeerDisplayTitle(p));
        const el = document.createElement('div');
        el.className = 'pi' + (p.role === 'super_admin' ? ' super-card' : '') + (p.id === activePeerId ? ' active' : '');
        el.dataset.pid = p.id; el.onclick = () => openChat(p.id);
        const u = unread[p.id] || 0;
        el.innerHTML = `
      ${avatarHTML(p, 's32')}
      <div class="pmeta">
        <div class="pname"><span class="pname-text">${esc(p.username)}</span>${roleBadge}</div>
        <div class="psub">
          <span class="psubtitle">${subtitle}</span>
        </div>
      </div>
      <div class="ptrail">
        <span class="pstatus-dot ${p.online ? '' : 'off'}" aria-label="${p.online ? 'Online' : 'Offline'}"><span class="mini-state"></span></span>
        ${u ? `<div class="ubadge">${u}</div>` : ''}
      </div>
    `;
        list.appendChild(el);
      });
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
      list.innerHTML = filtered.length ? `<div class="users-grid">${filtered.map(p => {
        const lm = p.liveMetrics;
        const cpuPct = lm?.cpuPct ?? null;
        const ramPct = lm?.ramUsedPct ?? null;
        const metricsHTML = lm ? `
      <div class="umetrics">
        <div class="umetric-row">
          <span class="umetric-label">CPU</span>
          <div class="umetric-bar"><div class="umetric-fill cpu${cpuPct > 80 ? ' hot' : ''}" style="width:${cpuPct}%"></div></div>
          <span class="umetric-val">${cpuPct}%</span>
        </div>
        <div class="umetric-row">
          <span class="umetric-label">RAM</span>
          <div class="umetric-bar"><div class="umetric-fill ram${ramPct > 85 ? ' hot' : ''}" style="width:${ramPct}%"></div></div>
          <span class="umetric-val">${ramPct}%</span>
        </div>
      </div>` : '';
        const captureBtn = (p.online && !hasAdminAccess(p.role) && _appMode === 'admin')
          ? `<button class="ubtn" onclick="requestScreenshot('${p.id}')">Capture</button>` : '';
        return `
    <div class="urow">
      <div class="uhead">
        ${avatarHTML(p, 's44')}
        <div class="ubio">
          <div class="uname">${esc(p.username)} ${roleBadgeHTML(p.role)}</div>
          <div class="usub">${esc(getPeerDisplayTitle(p))}</div>
        </div>
        <div class="udot ${p.online ? 'on' : 'off'}"></div>
      </div>
      <div class="ustats">
        <div class="ustat"><strong>Status</strong><span>${p.online ? 'Online' : 'Offline'}</span></div>
        <div class="ustat"><strong>Host</strong><span>${esc(p.systemInfo?.hostname || '-')}</span></div>
        <div class="ustat"><strong>IP</strong><span>${esc(p.systemInfo?.ip || '-')}</span></div>
      </div>
      <div class="udetails">
        <div><strong>OS</strong><br>${esc(p.systemInfo?.version || p.systemInfo?.os || '-')}</div>
        <div><strong>Device</strong><br>${esc(p.systemInfo?.modelName || p.systemInfo?.manufacturer || '-')}</div>
        <div><strong>CPU / RAM</strong><br>${esc(p.systemInfo?.cpuModel || '-')} • ${esc(p.systemInfo?.ramGb ? `${p.systemInfo.ramGb} GB` : '-')}</div>
        <div><strong>Disk Free</strong><br>${esc(p.systemInfo?.disk?.freeGb ? `${p.systemInfo.disk.freeGb} GB` : '-')}</div>
      </div>
      ${metricsHTML}
      <div class="uactions">
        <button class="ubtn" onclick="openSpecsModal('${p.id}')">View Specs</button>
        <button class="ubtn" onclick="exportPeerSpecs('${p.id}','txt')">Export TXT</button>
        <button class="ubtn" onclick="openChat('${p.id}')">Open Chat</button>
        ${captureBtn}
      </div>
    </div>`;
      }).join('')}</div>`
        : '<div class="empty-glass"><div class="ei">Users</div>No users match the current filters.</div>';
    }

function specValue(value, suffix = '') {
      return value || value === 0 ? `${value}${suffix}` : '-';
    }

function updateConnPill() {
      const cp = document.getElementById('conn-pill');
      if (!cp) return;
      const onlinePeers = getSortedPeers().filter(p => p.online);
      const onlineAdmins = onlinePeers.filter(p => hasAdminAccess(p.role));
      const hasSessionPeer = _appMode === 'client' ? onlineAdmins.length > 0 : onlinePeers.length > 0;
      if (!networkReady || !networkOnline) {
        cp.textContent = '● Disconnected';
        cp.className = 'off';
      } else if (hasSessionPeer) {
        cp.textContent = '● Connected';
        cp.className = '';
      } else {
        cp.textContent = '● Searching…';
        cp.className = 'searching';
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
      status.textContent = peer.online ? '● Online' : '○ Offline';
      status.style.color = peer.online ? 'var(--green)' : 'var(--txt3)';
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
