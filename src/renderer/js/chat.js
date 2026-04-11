function renderActiveChatContext() {
      const panel = document.getElementById('chat-context');
      if (!panel) return;
      if (!_appMode || _appMode === 'client' || !activePeerId) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
      }
      const peer = peers[activePeerId];
      const helpCard = getActiveHelpCardForPeer(activePeerId);
      if (!peer || !helpCard) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
      }

      const reqId = helpCard.dataset.reqid || '';
      const status = helpCard.dataset.status === 'acked' ? 'Acknowledged' : 'Open';
      const priority = (helpCard.dataset.priority || 'medium').toUpperCase();
      const description = helpCard.dataset.description || 'No details provided.';
      const machine = helpCard.dataset.machine || peer.systemInfo?.hostname || 'LAN peer';
      const hasScreenshot = helpCard.dataset.hasScreenshot === 'true';
      const captureAction = (peer.online && !hasAdminAccess(peer.role) && _appMode === 'admin')
        ? `<button class="ubtn" onclick="requestScreenshot('${peer.id}')">Capture</button>`
        : '';

      panel.innerHTML = `
    <div class="chat-context-shell ${helpCard.dataset.status === 'acked' ? 'acked' : 'open'}">
      <div class="chat-context-copy">
        <div class="chat-context-top">
          <span class="chat-context-kicker">Active Ticket</span>
          <span class="chat-context-pill ${String(helpCard.dataset.priority || 'medium')}">${priority}</span>
          <span class="chat-context-state">${status}</span>
        </div>
        <div class="chat-context-desc">${esc(description)}</div>
        <div class="chat-context-meta">${esc(machine)}${hasScreenshot ? ' · Screenshot attached' : ''}</div>
      </div>
      <div class="chat-context-actions">
        ${helpCard.dataset.status === 'acked' ? '<span class="chat-context-done">Acknowledged</span>' : `<button class="ubtn" onclick="ackHelp('${reqId}','${peer.id}')">Acknowledge</button>`}
        <button class="ubtn" onclick="activeHelpRequestId='${reqId}'; switchTab('help'); setTimeout(() => focusHelpRequest('${reqId}'), 60);">View Ticket</button>
        <button class="ubtn" onclick="openSpecsModal('${peer.id}')">View Specs</button>
        ${captureAction}
      </div>
    </div>`;
      panel.style.display = 'block';
    }

function openChat(peerId) {
      activePeerId = peerId; unread[peerId] = 0;
      const peer = peers[peerId]; if (!peer) return;
      const explicitHelp = getHelpCardByReqId(activeHelpRequestId);
      if (!explicitHelp || explicitHelp.dataset.fromid !== peerId) {
        const helpCard = getLatestHelpCardForPeer(peerId);
        activeHelpRequestId = helpCard?.dataset.reqid || null;
      }
      ensureChatLayout();
      const cpav = document.getElementById('cpav'); applyAvatar(cpav, peer);
      document.getElementById('cpname').innerHTML = `${esc(peer.username)} ${roleBadgeHTML(peer.role)}`;
      const cs = document.getElementById('cpstatus');
      const conn = getPeerConnectionMeta(peer);
      cs.textContent = `${conn.reachable ? '●' : '○'} ${conn.chatLabel}`;
      cs.style.color = conn.key === 'online' ? 'var(--green)' : conn.key === 'degraded' ? 'var(--amber)' : 'var(--txt3)';
      renderActiveChatContext();
      const msgs = document.getElementById('msgs'); msgs.innerHTML = '';
      (history[peerId] || []).forEach(m => appendBubble(m, null, false));
      renderPeerList(); switchTab('chat', { keepSelection: true }); ensureChatLayout();
      const msgInput = document.getElementById('msginput');
      if (msgInput && pendingReplyQuoteByPeer[peerId]) {
        msgInput.value = `↩ ${pendingReplyQuoteByPeer[peerId]}\n`;
      }
      msgInput?.focus();
      setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 60);
    }

function appendBubble(msg, prevSenderId, scroll = true) {
      const msgs = document.getElementById('msgs');
      const mine = msg.mine || msg.fromId === me.id;
      const peer = peers[msg.fromId] || { username: '?', color: '#666' };
      const showSender = !mine && msg.fromId !== prevSenderId;
      const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const content = msg.attachment
        ? `<div style="display:flex;flex-direction:column;gap:6px;min-width:220px;">
         <div style="font-size:18px;">📎 ${esc(msg.attachment.name)}</div>
         <div style="font-size:11px;opacity:.8;">${fmtBytes(msg.attachment.size || 0)}</div>
         <a href="${attachmentUrl(msg.attachment)}" download="${esc(msg.attachment.name)}" style="color:inherit;text-decoration:underline;font-size:12px;">Download file</a>
       </div>`
        : (msg.emoji ? `<span class="ebig">${msg.emoji}</span>${msg.text ? ' ' + esc(msg.text) : ''}` : esc(msg.text || ''));
      const last = msgs.querySelector('.mgroup:last-child');
      const cls = mine ? 'mine' : 'theirs';
      const statusSpan = mine && msg.id ? `<span class="msg-status" data-msgid="${msg.id}" title="Sent">✓</span>` : '';
      const bubbleAttr = mine && msg.id ? ` data-msgid="${msg.id}"` : '';
      if (last && last.classList.contains(cls) && !showSender) {
        last.querySelector('.bubbles').insertAdjacentHTML('beforeend', `<div class="bubble ${mine ? 'm' : 't'}"${bubbleAttr}>${content}${statusSpan}<span class="ts">${ts}</span></div>`);
      } else {
        const g = document.createElement('div');
        g.className = `mgroup ${cls}`;
        g.innerHTML = `
      ${!mine ? `<div class="avcol">${avatarHTML(peer, 's24')}</div>` : ''}
      <div class="bubbles">
        ${showSender ? `<div class="msender">${esc(peer.username)}</div>` : ''}
        <div class="bubble ${mine ? 'm' : 't'}"${bubbleAttr}>${content}${statusSpan}<span class="ts">${ts}</span></div>
      </div>`;
        msgs.appendChild(g);
      }
      if (scroll) msgs.scrollTop = msgs.scrollHeight;
    }

async function sendMsg() {
      const inp = document.getElementById('msginput');
      const text = inp.value.trim();
      if (!text) return;
      if (!activePeerId) return;
      const replyQuote = pendingReplyQuoteByPeer[activePeerId];
      const outgoingText = replyQuote ? `↩ ${replyQuote}\n${text}` : text;
      const r = await IPC.sendChat({ peerId: activePeerId, text: outgoingText, emoji: '' });
      if (r.success) {
        if (!history[activePeerId]) history[activePeerId] = [];
        history[activePeerId].push(r.message);
        appendBubble(r.message, null, true);
        if (replyQuote) {
          delete pendingReplyQuoteByPeer[activePeerId];
          document.querySelectorAll(`#replieslist .rcard[data-fromid="${activePeerId}"]`).forEach(card => card.remove());
          updateRepliesBadgeState();
        }
      }
      inp.value = '';
      inp.focus();
    }

function onkey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }

async function sendFile() {
      if (!activePeerId) return;
      const r = await IPC.sendFileOffer({ peerId: activePeerId });
      if (r?.success && r.message) {
        if (!history[activePeerId]) history[activePeerId] = [];
        history[activePeerId].push(r.message);
        appendBubble(r.message, null, true);
        return;
      }
      if (r?.error) showToast('File send failed', r.error, 'warn');
    }

function toggleEP(e) { e.stopPropagation(); const p = document.getElementById('epicker'), b = document.getElementById('ebtoggle'), r = b.getBoundingClientRect(); if (p.classList.contains('show')) { p.classList.remove('show'); } else { p.style.bottom = (window.innerHeight - r.top + 5) + 'px'; p.style.left = r.left + 'px'; p.classList.add('show'); } }

function pickE(e) { const input = document.getElementById('msginput'); if (!input) return; insertAtCursor(input, e); document.getElementById('epicker').classList.remove('show'); input.focus(); }

function clearPendingEmoji() { const input = document.getElementById('msginput'); if (!input) return; input.value = ''; input.focus(); }

function setupEmojiPicker() { const picker = document.getElementById('epicker'); if (!picker) return; const emojis = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F525}', '\u{2705}', '\u{26A0}\u{FE0F}', '\u{1F4A1}', '\u{1F680}', '\u{1F3AF}', '\u{1F4CC}', '\u{1F514}', '\u{1F44F}', '\u{1F622}', '\u{1F64F}', '\u{1F4AC}']; picker.innerHTML = `<button class="epbtn" onclick="clearPendingEmoji()" title="Clear">&#9003;</button>` + emojis.map(emoji => `<button class="epbtn" onclick="pickE('${emoji}')">${emoji}</button>`).join(''); }

function updateEmojiButton() { const btn = document.getElementById('ebtoggle'); if (!btn) return; btn.innerHTML = '&#128515;'; }

function insertAtCursor(input, text) { const start = input.selectionStart ?? input.value.length; const end = input.selectionEnd ?? input.value.length; input.value = input.value.slice(0, start) + text + input.value.slice(end); const next = start + text.length; input.setSelectionRange(next, next); }

function specValue(value, suffix = '') {
      return value || value === 0 ? `${value}${suffix}` : '-';
    }

function buildSpecFields(peer) {
      const info = peer?.systemInfo || {};
      return [
        ['Hostname', info.hostname],
        ['Manufacturer', info.manufacturer],
        ['Model', info.modelName],
        ['Serial', info.serialNumber],
        ['OS', info.version || info.os],
        ['CPU', info.cpuModel],
        ['RAM', info.ramGb ? `${info.ramGb} GB` : null],
        ['Disk Drive', info.disk?.drive],
        ['Disk Total', info.disk?.totalGb ? `${info.disk.totalGb} GB` : null],
        ['Disk Free', info.disk?.freeGb ? `${info.disk.freeGb} GB` : null],
        ['IP', info.ip],
        ['MAC', info.mac]
      ];
    }

function openSpecsModal(peerId) {
      const peer = peers[peerId];
      if (!peer) return;
      selectedSpecPeerId = peerId;
      applyAvatar(document.getElementById('specavatar'), peer);
      document.getElementById('specname').innerHTML = `${esc(peer.username)} ${roleBadgeHTML(peer.role)}`;
      document.getElementById('specsubtitle').textContent = `${getPeerConnectionMeta(peer).label} • ${getPeerDisplayTitle(peer)}`;
      document.getElementById('specgrid').innerHTML = buildSpecFields(peer).map(([label, value]) => `
    <div class="spec-card">
      <strong>${esc(label)}</strong>
      <span>${esc(specValue(value))}</span>
    </div>
  `).join('');
      document.getElementById('specmodal').classList.add('show');
    }

function closeSpecsModal() {
      document.getElementById('specmodal').classList.remove('show');
      selectedSpecPeerId = null;
    }

async function requestScreenshot(peerId) {
      const peer = peers[peerId];
      if (!peer) return;
      document.getElementById('ssTitle').textContent = `Capturing - ${esc(peer.username)}`;
      document.getElementById('ssMeta').textContent  = 'Waiting for response from client...';
      document.getElementById('ssLoading').style.display  = 'block';
      document.getElementById('screenshotImg').style.display = 'none';
      document.getElementById('screenshotModal').classList.add('show');
      const result = await IPC.requestPeerScreenshot({ peerId });
      if (!result?.success) {
        document.getElementById('ssMeta').textContent = result?.error || 'Request failed.';
        document.getElementById('ssLoading').textContent = 'Failed to send request.';
      }
    }

function showScreenshotResult(peerId, base64, name, timestamp) {
      const peer = peers[peerId];
      document.getElementById('ssTitle').textContent = `Screenshot - ${esc(peer?.username || peerId)}`;
      document.getElementById('ssMeta').textContent  = new Date(timestamp || Date.now()).toLocaleString();
      document.getElementById('ssLoading').style.display     = 'none';
      const img = document.getElementById('screenshotImg');
      img.src = `data:image/png;base64,${base64}`;
      img.style.display = 'block';
      document.getElementById('screenshotModal').classList.add('show');
    }

function closeScreenshotModal() {
      document.getElementById('screenshotModal').classList.remove('show');
      document.getElementById('screenshotImg').src = '';
      document.getElementById('ssLoading').textContent = 'Requesting screenshot...';
      document.getElementById('ssLoading').style.display  = 'block';
    }

async function exportPeerSpecs(peerId, format = 'txt') {
      const result = await IPC.exportPeerSpecs({ peerId, format });
      if (result?.success) {
        showToast('Specs exported', result.path || 'User specs saved successfully.');
        return;
      }
      if (result?.error) showToast('Export failed', result.error, 'warn');
    }

function exportSpecs(format = 'txt') {
      if (!selectedSpecPeerId) return;
      exportPeerSpecs(selectedSpecPeerId, format);
    }

function openLightbox(src) { document.getElementById('lbimg').src = src; document.getElementById('lightbox').classList.add('show'); }

function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }
