async function sendBcast() {
      const text = document.getElementById('bctext').value.trim(); if (!text) return;
      const durationInput = document.getElementById('bcduration');
      const selectedGroupId = document.getElementById('bcgroup')?.value || '';
      const targetGroup = userGroups.find(group => group.id === selectedGroupId);
      const peerIds = targetGroup ? targetGroup.memberIds : null;
      const durationSeconds = Math.min(120, Math.max(3, Number(durationInput?.value || 10) || 10));
      const sendBtn = document.querySelector('#tab-broadcast .broadcast-send') || document.querySelector('#tab-broadcast .mactions .btnp');
      if (sendBtn) sendBtn.disabled = true;
      if (durationInput) durationInput.value = durationSeconds;
      try {
        const result = await IPC.sendBroadcast({ text, urgency: selUrg, durationSeconds, peerIds });
        if (!result || result.success === false) {
          showToast('Broadcast failed', result?.error || 'Could not send broadcast.', 'warn');
          return;
        }
        const targetCount = Number(result.targetCount || 0);
        if (targetCount <= 0) {
          showToast('No recipients', 'No reachable users matched the selected audience.', 'warn');
          return;
        }
        document.getElementById('bctext').value = '';
        updateBroadcastCharCount();
        ackCount = 0;
        setBroadcastAckCount(0);
        showBroadcastAckList(`<div class="ackitem"><span style="color:var(--txt2);font-size:11px;">Sent [${selUrg.toUpperCase()}] · ${new Date().toLocaleTimeString()}${selUrg === 'normal' ? ` · ${durationSeconds}s` : ''} · ${targetCount} target${targetCount === 1 ? '' : 's'}</span></div>`);
        addDashboardActivity('broadcast', 'Broadcast sent', text, peerIds?.length ? `${peerIds.length} targeted peer(s)` : `${targetCount} reachable user(s)`);
        showToast(
          '📡 Broadcast Sent',
          selUrg === 'normal'
            ? `Priority: NORMAL · Popup ${durationSeconds}s · ${targetCount} target${targetCount === 1 ? '' : 's'}`
            : selUrg === 'urgent'
              ? `Priority: URGENT · Requires ACK · ${targetCount} target${targetCount === 1 ? '' : 's'}`
              : `Broadcast sent to ${targetCount} target${targetCount === 1 ? '' : 's'}.`,
          'warn'
        );
      } catch (error) {
        showToast('Broadcast failed', error?.message || 'Unexpected error while sending broadcast.', 'warn');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
    }

function bindBroadcastHandlers() {
      const sendBtn = document.querySelector('#tab-broadcast .broadcast-send-btn');
      if (sendBtn && !sendBtn.dataset.boundClick) {
        sendBtn.dataset.boundClick = '1';
        sendBtn.addEventListener('click', sendBcast);
      }
      const normalCard = document.getElementById('opt-normal');
      if (normalCard && !normalCard.dataset.boundClick) {
        normalCard.dataset.boundClick = '1';
        normalCard.addEventListener('click', () => setUrg('normal'));
      }
      const urgentCard = document.getElementById('opt-urgent');
      if (urgentCard && !urgentCard.dataset.boundClick) {
        urgentCard.dataset.boundClick = '1';
        urgentCard.addEventListener('click', () => setUrg('urgent'));
      }
      const lockAllBtn = document.getElementById('btnLockAll');
      if (lockAllBtn && !lockAllBtn.dataset.boundClick) {
        lockAllBtn.dataset.boundClick = '1';
        lockAllBtn.addEventListener('click', handleLockAll);
      }
      const unlockAllBtn = document.getElementById('btnUnlockAll');
      if (unlockAllBtn && !unlockAllBtn.dataset.boundClick) {
        unlockAllBtn.dataset.boundClick = '1';
        unlockAllBtn.addEventListener('click', handleUnlockAll);
      }
      const uploadZone = document.getElementById('vbc-upload-zone');
      if (uploadZone && !uploadZone.dataset.boundClick) {
        uploadZone.dataset.boundClick = '1';
        uploadZone.addEventListener('click', vbcPickFile);
      }
      const pickBtn = document.getElementById('vbc-pick-btn');
      if (pickBtn && !pickBtn.dataset.boundClick) {
        pickBtn.dataset.boundClick = '1';
        pickBtn.addEventListener('click', vbcPickFile);
      }
      const msgInput = document.getElementById('bctext');
      if (msgInput && !msgInput.dataset.boundInput) {
        msgInput.dataset.boundInput = '1';
        msgInput.addEventListener('input', updateBroadcastCharCount);
      }
}

function setUrg(v) {
      selUrg = v;
      const normal = document.getElementById('opt-normal');
      const urgent = document.getElementById('opt-urgent');
      if (normal) {
        normal.classList.toggle('active-normal', v === 'normal');
        normal.classList.toggle('sel', v === 'normal');
      }
      if (urgent) {
        urgent.classList.toggle('active-urgent', v === 'urgent');
        urgent.classList.toggle('sel', v === 'urgent');
      }
      const sendBtn = document.querySelector('#tab-broadcast .broadcast-send') || document.querySelector('#tab-broadcast .mactions .btnp');
      if (sendBtn) sendBtn.classList.toggle('urgent', v === 'urgent');
    }

function updateBroadcastCharCount() {
      const input = document.getElementById('bctext');
      const counter = document.getElementById('broadcast-char-count');
      if (!input || !counter) return;
      counter.textContent = `${input.value.length} / 500`;
    }

function setBroadcastAckCount(count) {
      const el = document.getElementById('ackcnt');
      if (el) el.textContent = `${count} ACK${count === 1 ? '' : 's'}`;
    }

function showBroadcastAckList(html) {
      const list = document.getElementById('acklist');
      if (!list) return;
      list.innerHTML = html;
      list.classList.add('has-items');
    }

function showBcastToast(data) {
      const t = document.createElement('div'); t.className = 'toast warn'; t.dataset.bid = data.broadcastId;
      const timeoutMs = Math.max(3000, (Number(data.durationSeconds || 10) || 10) * 1000);
      t.innerHTML = `
    <div class="thdr"><span style="font-size:15px;">📢</span><span class="ttitle">Broadcast · ${esc(data.fromName || 'Admin')}</span><button class="tclose" onclick="this.closest('.toast').remove()">✕</button></div>
    <div class="tbody">${esc(data.text)}</div>
    <div class="treply">
      <input placeholder="Reply to admin…" id="tri-${data.broadcastId}">
      <button onclick="sendBReply('${data.fromId}','${data.broadcastId}','tri-${data.broadcastId}',this.closest('.toast'))">↩</button>
    </div>`;
      document.getElementById('tc').appendChild(t); setTimeout(() => t?.remove(), timeoutMs);
    }

async function sendBReply(fromId, bid, inputId, toastEl) {
      const text = document.getElementById(inputId)?.value?.trim(); if (!text) return;
      await IPC.sendBroadcastReply({ peerId: fromId, text, broadcastId: bid }); toastEl?.remove();
    }

async function handleLockAll() {
      const message = (document.getElementById('lockMsg')?.value || '').trim();
      const btn = document.getElementById('btnLockAll');
      if (btn) btn.disabled = true;
      try {
        const result = await IPC.lockAllScreens({ message });
        if (result?.success) {
          const n = Number(result.targetCount || 0);
          if (n > 0) {
            setLockUi(true);
            showToast('🔒 Screens Locked', `Locked ${n} user${n !== 1 ? 's' : ''}`);
          } else {
            if (btn) btn.disabled = false;
            showToast('No users reachable', 'No connected users to lock. Try again when users are online.', 'warn');
          }
        } else {
          if (btn) btn.disabled = false;
          showToast('❌ Lock Failed', result?.error || 'Unknown error');
        }
      } catch (err) {
        if (btn) btn.disabled = false;
        console.error('lockAllScreens error:', err);
        showToast('❌ Lock Failed', err?.message || 'Unexpected error.');
      }
    }

async function handleUnlockAll() {
      const btn = document.getElementById('btnUnlockAll');
      if (btn) btn.disabled = true;
      try {
        const result = await IPC.unlockAllScreens();
        if (result?.success) {
          setLockUi(false);
          showToast('🔓 Screens Unlocked', 'All users can access their screens');
        } else {
          if (btn) btn.disabled = false;
          showToast('❌ Unlock Failed', result?.error || 'Unknown error');
        }
      } catch (err) {
        if (btn) btn.disabled = false;
        console.error('unlockAllScreens error:', err);
        showToast('❌ Unlock Failed', err?.message || 'Unexpected error.');
      }
    }

function setLockUi(locked) {
      _screensLocked = locked;
      persistAdminActionState();
      const status = document.getElementById('lockStatus');
      const btnLock = document.getElementById('btnLockAll');
      const btnUnlock = document.getElementById('btnUnlockAll');
      if (status) status.classList.toggle('on', locked);
      const statusText = status?.querySelector('.status-text');
      if (statusText) statusText.textContent = locked ? 'All screens are locked' : 'All screens are unlocked';
      if (btnLock) btnLock.disabled = locked;
      if (btnUnlock) btnUnlock.disabled = !locked;
    }

function vbcSetStatus(msg) {
      const el = document.getElementById('vbc-status');
      if (el) el.textContent = msg;
    }

function vbcRenderSelectedVideo() {
      const preview = document.getElementById('vbc-preview-wrap');
      const video = document.getElementById('vbc-video');
      const labelRow = document.getElementById('vbc-label-row');
      const meta = document.getElementById('vbc-file-meta');
      const badge = document.getElementById('vbc-live-badge');
      const btnRow = document.getElementById('vbc-btn-row');
      const uploadZone = document.getElementById('vbc-upload-zone');
      const uploadIcon = document.getElementById('vbc-upload-icon');
      const uploadText = document.getElementById('vbc-upload-text');
      if (!vbcSelectedVideo) {
        if (preview) preview.style.display = 'none';
        if (labelRow) labelRow.style.display = 'none';
        if (meta) meta.style.display = 'none';
        if (badge) badge.style.display = 'none';
        if (uploadZone) uploadZone.classList.remove('is-ready');
        if (uploadIcon) uploadIcon.textContent = '↑';
        if (uploadText) uploadText.innerHTML = '<strong>Click to upload</strong> or drag &amp; drop<br>MP4, WebM — max 30 MB';
        if (btnRow) btnRow.innerHTML = '<button class="broadcast-secondary-btn" id="vbc-pick-btn" onclick="vbcPickFile()">Upload video</button>';
        vbcSetStatus('No video selected.');
        return;
      }
      video.src = `data:${vbcSelectedVideo.mime};base64,${vbcSelectedVideo.data}`;
      preview.style.display = 'block';
      labelRow.style.display = vbcActive ? 'none' : 'grid';
      meta.style.display = vbcActive ? 'none' : 'block';
      meta.textContent = `${vbcSelectedVideo.fileName} • ${fmtBytes(vbcSelectedVideo.size || 0)}`;
      badge.style.display = 'inline-flex';
      badge.textContent = vbcActive ? 'Playing' : 'Ready';
      if (uploadZone) uploadZone.classList.toggle('is-ready', !vbcActive);
      if (uploadZone) uploadZone.style.pointerEvents = vbcActive ? 'none' : 'auto';
      if (uploadIcon) uploadIcon.textContent = '✓';
      if (uploadText) uploadText.innerHTML = `<strong>${esc(vbcSelectedVideo.fileName)}</strong><br>${fmtBytes(vbcSelectedVideo.size || 0)}`;
      btnRow.innerHTML = vbcActive
        ? '<button class="broadcast-primary-btn danger" onclick="vbcStop()">⏹️ Stop Video</button>'
        : '<button class="broadcast-secondary-btn" onclick="vbcPickFile()">Change video</button><button class="broadcast-secondary-btn" onclick="vbcClearSelection()">Cancel</button><button class="broadcast-primary-btn" onclick="vbcBroadcast()">Play for everyone</button>';
    }

async function vbcPickFile() {
      try {
        const result = await IPC.selectVideoBroadcastFile();
        if (!result?.success) {
          if (!result?.canceled) vbcSetStatus(result?.error || 'Could not load video.');
          return;
        }
        vbcSelectedVideo = result;
        vbcActive = false;
        persistAdminActionState();
        vbcRenderSelectedVideo();
        vbcSetStatus('Video loaded. Start playback when you are ready.');
      } catch (error) {
        vbcSetStatus(error?.message || 'Could not load video.');
      }
    }

function vbcClearSelection() {
      vbcSelectedVideo = null;
      vbcActive = false;
      persistAdminActionState();
      const video = document.getElementById('vbc-video');
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      const label = document.getElementById('vbc-label');
      if (label) label.value = '';
      vbcRenderSelectedVideo();
    }

function vbcBroadcast() {
      if (!vbcSelectedVideo || vbcActive) return;
      const label = document.getElementById('vbc-label')?.value.trim() || '';
      const selectedGroupId = document.getElementById('bcgroup')?.value || '';
      const targetGroup = userGroups.find(g => g.id === selectedGroupId);
      const peerIds = targetGroup ? targetGroup.memberIds : null;
      IPC.sendForcedVideoBroadcast({
        videoB64: vbcSelectedVideo.data,
        mime: vbcSelectedVideo.mime,
        fileName: vbcSelectedVideo.fileName,
        label,
        peerIds
      }).then(result => {
        if (!result?.success) {
          vbcSetStatus(result?.error || 'Broadcast failed.');
          return;
        }
        const n = Number(result.targetCount || 0);
        if (n > 0) {
          vbcActive = true;
          persistAdminActionState();
          vbcRenderSelectedVideo();
          vbcSetStatus(`Forced playback started for ${n} user${n !== 1 ? 's' : ''}.`);
        } else {
          vbcSetStatus('No connected users to send video to. Try again when users are online.');
        }
      }).catch(err => {
        vbcSetStatus('Broadcast failed: ' + err.message);
      });
    }

function vbcStop() {
      IPC.stopForcedVideoBroadcast().finally(() => {
        vbcActive = false;
        persistAdminActionState();
        vbcRenderSelectedVideo();
        vbcSetStatus('Forced playback stopped.');
      });
    }

function restoreAdminActionUiState() {
      loadAdminActionState();
      setLockUi(_screensLocked);
      vbcRenderSelectedVideo();
    }

function setUserFilter(next) {
      userFilter = next;
      renderUsersTab();
    }
const ADMIN_ACTION_STATE_KEY = 'opslynk.adminActionState.v1';

function loadAdminActionState() {
      try {
        const parsed = JSON.parse(localStorage.getItem(ADMIN_ACTION_STATE_KEY) || '{}');
        _screensLocked = !!parsed.screensLocked;
        vbcActive = !!parsed.vbcActive;
      } catch {
        _screensLocked = false;
        vbcActive = false;
      }
    }

function persistAdminActionState() {
      try {
        localStorage.setItem(ADMIN_ACTION_STATE_KEY, JSON.stringify({
          screensLocked: !!_screensLocked,
          vbcActive: !!vbcActive
        }));
      } catch {}
    }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindBroadcastHandlers, { once: true });
} else {
  bindBroadcastHandlers();
}

window.sendBcast = sendBcast;
window.setUrg = setUrg;
window.updateBroadcastCharCount = updateBroadcastCharCount;
window.sendBReply = sendBReply;
window.handleLockAll = handleLockAll;
window.handleUnlockAll = handleUnlockAll;
window.vbcPickFile = vbcPickFile;
window.vbcClearSelection = vbcClearSelection;
window.vbcBroadcast = vbcBroadcast;
window.vbcStop = vbcStop;
