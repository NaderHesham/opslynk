function setupEvents() {
      IPC.on('system:deviceUpdated', p => { const prev = peers[p.id]; peers[p.id] = { ...prev, ...p }; renderPeerList(); renderUsersTab(); renderGroupUI(); updateActivePeerStatus(); updateConnPill(); const nameChanged = prev && prev.username !== p.username; const wentOnline = prev && !prev.online && p.online; if (nameChanged || wentOnline) addDashboardActivity('system', `${p.username || 'Peer'} updated`, 'Profile details changed.', p.online ? 'Online now' : 'Status refreshed'); });
      IPC.on('system:deviceJoined', p => { peers[p.id] = { ...peers[p.id], ...p, online: true }; renderPeerList(); renderUsersTab(); renderGroupUI(); updateActivePeerStatus(); updateConnPill(); addDashboardActivity('system', `${p.username || 'Peer'} came online`, 'A reachable endpoint joined the LAN session.', p.title || 'Ready'); });
      IPC.on('system:deviceLeft', ({ id }) => { if (peers[id]) { peers[id].online = false; renderPeerList(); renderUsersTab(); renderGroupUI(); updateActivePeerStatus(); addDashboardActivity('system', `${peers[id].username || 'Peer'} went offline`, 'This endpoint is temporarily unavailable for admin actions.', peers[id].title || 'Disconnected'); } updateConnPill(); });

      IPC.on('network:message', ({ peerId, message }) => {
        if (!history[peerId]) history[peerId] = [];
        history[peerId].push(message);
        if (peerId === activePeerId) { appendBubble(message, null, true); }
        else { unread[peerId] = (unread[peerId] || 0) + 1; renderPeerList(); beep(660, 0.1); }
      });

      IPC.on('network:broadcast', data => { if (data.urgency !== 'urgent') { beep(520, 0.18); } });
      IPC.on('network:status', ({ online }) => { networkOnline = !!online; updateConnPill(); });

      IPC.on('peer:heartbeat', ({ peerId, systemInfo, liveMetrics }) => {
        if (peers[peerId]) {
          if (systemInfo)   peers[peerId].systemInfo   = systemInfo;
          if (liveMetrics)  peers[peerId].liveMetrics  = liveMetrics;
          const active = document.querySelector('.panel.active');
          if (active?.id === 'tab-users' || active?.id === 'tab-dashboard') { renderPeerList(); renderUsersTab(); }
        }
        updateConnPill();
      });

      IPC.on('peer:screenshot', ({ peerId, base64, name, timestamp }) => {
        showScreenshotResult(peerId, base64, name, timestamp);
      });

      IPC.on('peer:stale', ({ peerId }) => {
        if (peers[peerId]) {
          peers[peerId].online = false;
          renderPeerList();
          updateActivePeerStatus();
        }
        updateConnPill();
      });

      IPC.on('chat:delivered', ({ msgId }) => {
        console.log('[ACK-DEBUG] chat:delivered received:', msgId);
        const el = document.querySelector(`.msg-status[data-msgid="${msgId}"]`);
        if (el) { el.textContent = '✓✓'; el.classList.add('delivered'); el.title = 'Delivered'; }
      });

      IPC.on('chat:failed', ({ msgId }) => {
        const el = document.querySelector(`.msg-status[data-msgid="${msgId}"]`);
        if (el) { el.textContent = '✕'; el.classList.add('failed'); el.title = 'Failed to deliver'; }
      });

      IPC.on('network:ack', ({ fromId, broadcastId, username }) => {
        ackCount++;
        setBroadcastAckCount(ackCount);
        const al = document.getElementById('acklist'); const ae = al.querySelector('.acke'); if (ae) ae.remove();
        al.classList.add('has-items');
        al.insertAdjacentHTML('beforeend', `<div class="ackitem"><span class="ackcheck">✓</span><span style="font-size:11px;">${esc(username || '?')}</span><span class="ackmt">${new Date().toLocaleTimeString()}</span></div>`);
      });

      IPC.on('network:broadcastReply', ({ fromId, text, broadcastId, username }) => {
        const rl = document.getElementById('replieslist'); const re = rl.querySelector('.empty'); if (re) re.remove();
        const c = document.createElement('div'); c.className = 'rcard';
        c.innerHTML = `<div class="reply-card-head"><div><div class="rfrom">${esc(username || '?')}</div><div class="reply-card-sub">Broadcast response</div></div><div class="rts">${new Date().toLocaleTimeString()}</div></div><div class="rtxt">${esc(text)}</div><div class="reply-card-actions"><button class="ubtn" onclick="openChat('${fromId}')">Open Chat</button></div>`;
        rl.prepend(c);
        const rb = document.querySelector('[data-tab="replies"]'); if (rb && !rb.querySelector('.tbadge')) rb.insertAdjacentHTML('beforeend', '<span class="tbadge">!</span>');
        beep(440, 0.12);
      });

      IPC.on('video-broadcast', data => {
        let popup = document.getElementById('vbc-incoming-popup');
        if (!popup) {
          popup = document.createElement('div');
          popup.id = 'vbc-incoming-popup';
          popup.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(3,6,12,.88)',
            'z-index:9999', 'display:flex', 'align-items:center',
            'justify-content:center', 'padding:28px'
          ].join(';');
          popup.innerHTML =
            '<div style="width:min(960px,100%);background:#0e1220;border:1px solid rgba(88,166,255,.26);border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(0,0,0,.4);">' +
            '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(88,166,255,.08);border-bottom:1px solid rgba(88,166,255,.15);">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;animation:dot-blink 1s infinite;display:inline-block;"></span>' +
            '<span id="vbc-popup-from" style="font-size:11px;font-weight:700;color:#a8c8ff;">Forced video from Admin</span>' +
            '<span id="vbc-popup-label" style="font-size:10px;color:var(--txt3);margin-left:4px;"></span>' +
            '<span style="margin-left:auto;font-size:10px;color:#ffccd3;letter-spacing:.12em;text-transform:uppercase;">Forced</span>' +
            '</div>' +
            '<video id="vbc-popup-video" playsinline autoplay style="width:100%;display:block;max-height:80vh;background:#000;" controlsList="nodownload noplaybackrate"></video>' +
            '</div>';
          document.body.appendChild(popup);
        }
        const video = document.getElementById('vbc-popup-video');
        if (video) {
          video.src = `data:${data.mime || 'video/mp4'};base64,${data.videoB64 || ''}`;
          video.loop = true;
          video.controls = false;
          video.play().catch(() => { video.controls = true; });
        }
        const fromEl = document.getElementById('vbc-popup-from');
        if (fromEl) fromEl.textContent = 'Forced video from ' + (data.fromName || 'Admin');
        const labelEl = document.getElementById('vbc-popup-label');
        if (labelEl) labelEl.textContent = data.label || '';
      });

      IPC.on('video-broadcast-stop', () => {
        const popup = document.getElementById('vbc-incoming-popup');
        const video = document.getElementById('vbc-popup-video');
        if (video) {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
        popup?.remove();
      });

      IPC.on('user:helpRequest', req => { appendHelpCard(req); });
      IPC.on('user:helpAcked', () => showToast('Admin Responded', 'Your help request was acknowledged!'));

      IPC.on('ui:focusHelpRequest', ({ reqId }) => { switchTab('help'); setTimeout(() => focusHelpRequest(reqId), 60); });
      IPC.on('ui:playSound', ({ type }) => { if (type === 'message') beep(660, 0.1); else if (type === 'broadcast') beep(520, 0.18); else if (type === 'help') { beep(330, 0.25); setTimeout(() => beep(440, 0.25), 220); } });
      IPC.on('ui:gotoTab', tab => switchTab(tab));

      IPC.on('admin:screenLocked', () => setLockUi(true));
      IPC.on('admin:screenUnlocked', () => setLockUi(false));

      IPC.getDeviceId?.().then(id => {
        console.log('[OpsLynk] get-device-id returned:', id);
        const el = document.getElementById('device-id-display');
        if (el && id) el.textContent = id;
      }).catch(err => { console.error('[OpsLynk] get-device-id failed:', err); });
    }
