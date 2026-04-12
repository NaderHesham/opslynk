let groupMembersEditId = null;
let groupActionsId = null;
let groupVideoId = null;
let groupVideoSelection = null;
const groupUiOverrideState = Object.create(null);

function getGroupById(groupId) {
  return (userGroups || []).find(group => group.id === groupId) || null;
}

function getGroupMembers(group) {
  if (!group) return [];
  return (group.memberIds || []).map(id => peers[id]).filter(Boolean);
}

function getGroupOnlineMembers(group) {
  return getGroupMembers(group).filter(peer => peer.online && !hasAdminAccess(peer.role));
}

function getGroupRuntimeState(group) {
  const members = getGroupMembers(group).filter(peer => !hasAdminAccess(peer.role));
  return {
    lockOn: members.some(peer => !!peer.remoteLockActive),
    videoOn: members.some(peer => !!peer.remoteVideoActive)
  };
}

function setGroupUiOverride(groupId, patch) {
  if (!groupId) return;
  const current = groupUiOverrideState[groupId] || {};
  groupUiOverrideState[groupId] = {
    ...current,
    ...patch,
    at: Date.now()
  };
}

function getResolvedGroupRuntimeState(group) {
  const base = getGroupRuntimeState(group);
  const override = groupUiOverrideState[group?.id];
  if (!override) return base;
  const next = {
    lockOn: typeof override.lockOn === 'boolean' ? override.lockOn : base.lockOn,
    videoOn: typeof override.videoOn === 'boolean' ? override.videoOn : base.videoOn
  };
  if (next.lockOn === base.lockOn && next.videoOn === base.videoOn) {
    delete groupUiOverrideState[group.id];
    return base;
  }
  return next;
}

function renderGroupStatusBadge(kind, label, on) {
  return `<span class="group-state-badge ${kind} ${on ? 'on' : 'off'}">${esc(label)} ${on ? 'ON' : 'OFF'}</span>`;
}

async function saveGroup() {
  const name = (document.getElementById('groupname')?.value || '').trim();
  if (!name) {
    showToast('Group failed', 'Group name is required.', 'warn');
    return;
  }
  const result = await IPC.saveUserGroup({ name, memberIds: [] });
  if (!result?.success) {
    if (Array.isArray(result?.groups)) {
      userGroups = result.groups;
      renderGroupUI();
    } else if (String(result?.error || '').toLowerCase().includes('already exists')) {
      const latest = await IPC.getInitData();
      userGroups = latest?.userGroups || userGroups;
      renderGroupUI();
    }
    showToast('Group failed', result?.error || 'Could not create group.', 'warn');
    return;
  }
  userGroups = result.groups || [];
  document.getElementById('groupname').value = '';
  renderGroupUI();
  renderMonitorTab();
  addDashboardActivity('system', 'Group created', `Audience "${name}" was created.`, 'Members can be added from Edit Members.');
  showToast('Group created', 'Group created successfully.');
}

async function deleteGroup(id) {
  const group = getGroupById(id);
  const ok = await appConfirm({
    title: 'Delete Group',
    message: `Delete group "${group?.name || 'this group'}"?`,
    okLabel: 'Delete'
  });
  if (!ok) return;
  const result = await IPC.deleteUserGroup({ id });
  if (!result?.success) {
    showToast('Delete failed', result?.error || 'Could not delete group.', 'warn');
    return;
  }
  userGroups = result.groups || [];
  renderGroupUI();
  renderMonitorTab();
  addDashboardActivity('system', 'Group removed', 'Saved audience deleted from the admin console.', group?.name || id);
}

async function deleteSelectedGroupWithPassword() {
  const groupId = String(document.getElementById('groupDeleteSelect')?.value || '');
  const password = String(document.getElementById('groupDeletePassword')?.value || '').trim();
  if (!groupId) {
    showToast('Delete failed', 'Select a group first.', 'warn');
    return;
  }
  if (!password) {
    showToast('Delete failed', 'Enter admin password.', 'warn');
    return;
  }
  const verify = await IPC.auth.verifyPassword?.({
    username: String(me?.username || '').trim(),
    password
  });
  if (!verify?.success) {
    showToast('Delete failed', verify?.error || 'Invalid admin password.', 'warn');
    return;
  }
  await deleteGroup(groupId);
  const pwd = document.getElementById('groupDeletePassword');
  const sel = document.getElementById('groupDeleteSelect');
  if (pwd) pwd.value = '';
  if (sel) sel.value = '';
}

function openGroupMembersModal(groupId) {
  const group = getGroupById(groupId);
  const modal = document.getElementById('groupMembersModal');
  const list = document.getElementById('groupMembersList');
  const title = document.getElementById('groupMembersTitle');
  if (!group || !modal || !list || !title) return;
  groupMembersEditId = groupId;
  title.textContent = `Edit Members · ${group.name}`;
  const selected = new Set(group.memberIds || []);
  const candidates = getSortedPeers().filter(peer => !hasAdminAccess(peer.role));
  list.innerHTML = candidates.length ? candidates.map(peer => `
    <label class="member-check">
      <input type="checkbox" value="${peer.id}" ${selected.has(peer.id) ? 'checked' : ''}>
      <div class="member-check-body">
        <div class="member-check-top">
          <span class="member-check-avatar" style="background:${COLORS[Math.abs(hc(peer.username || '?')) % COLORS.length]}">${esc((peer.username || '?')[0].toUpperCase())}</span>
          <div>
            <div class="member-check-name">${esc(peer.username)}</div>
            <div class="member-check-sub">${esc(peer.systemInfo?.ip || getPeerDisplayTitle(peer))}</div>
          </div>
        </div>
        <div class="member-check-tags">
          <span class="member-check-tag ${peer.online ? 'online' : 'offline'}">${peer.online ? 'Online' : 'Offline'}</span>
          <span class="member-check-tag role">User</span>
        </div>
      </div>
    </label>
  `).join('') : '<div class="group-empty-state">No users available.</div>';
  modal.classList.add('show');
}

function closeGroupMembersModal() {
  const modal = document.getElementById('groupMembersModal');
  if (modal) modal.classList.remove('show');
  groupMembersEditId = null;
}

async function applyGroupMembers() {
  const group = getGroupById(groupMembersEditId || '');
  if (!group) return;
  const memberIds = [...document.querySelectorAll('#groupMembersList input:checked')].map(input => input.value);
  const result = await IPC.saveUserGroup({ id: group.id, name: group.name, memberIds });
  if (!result?.success) {
    showToast('Update failed', result?.error || 'Could not update members.', 'warn');
    return;
  }
  userGroups = result.groups || [];
  renderGroupUI();
  renderMonitorTab();
  closeGroupMembersModal();
  showToast('Members updated', `${memberIds.length} member(s) now in "${group.name}".`);
}

function openGroupActionsModal(groupId) {
  const group = getGroupById(groupId);
  const modal = document.getElementById('groupActionsModal');
  const title = document.getElementById('groupActionsTitle');
  const sub = document.getElementById('groupActionsSub');
  if (!group || !modal || !title || !sub) return;
  groupActionsId = groupId;
  const onlineCount = getGroupOnlineMembers(group).length;
  title.textContent = `Actions · ${group.name}`;
  sub.textContent = `${group.memberIds.length} member(s) · ${onlineCount} online`;
  modal.classList.add('show');
}

function closeGroupActionsModal() {
  const modal = document.getElementById('groupActionsModal');
  if (modal) modal.classList.remove('show');
  groupActionsId = null;
}

async function executeGroupAction(action) {
  const group = getGroupById(groupActionsId || '');
  if (!group) return;
  if (action === 'run_script') {
    closeGroupActionsModal();
    openGroupRunScriptModal(group.id);
    return;
  }
  await executeGroupDeviceAction(group.id, action);
}

function openGroupRunScriptModal(groupId) {
  const group = getGroupById(groupId);
  const modal = document.getElementById('runScriptModal');
  const title = document.getElementById('runScriptTitle');
  const input = document.getElementById('runScriptInput');
  if (!group || !modal || !title || !input) return;
  modal.dataset.peerId = '';
  modal.dataset.groupId = group.id;
  title.textContent = `Run Script · Group ${group.name}`;
  input.value = '';
  modal.classList.add('show');
  setTimeout(() => input.focus(), 30);
}

async function executeGroupDeviceAction(groupId, action, scriptOverride = '') {
  const group = getGroupById(groupId);
  if (!group) return { sent: 0, failed: 0, offlineCount: 0 };
  const members = getGroupMembers(group);
  const onlineMembers = members.filter(peer => peer.online && !hasAdminAccess(peer.role));
  const offlineCount = Math.max(0, members.length - onlineMembers.length);

  const labels = {
    restart_device: 'Restart Device',
    shutdown_device: 'Shutdown Device',
    signout_device: 'Signout Device',
    clean_temp: 'Clean Temp',
    flush_dns: 'Flush DNS',
    run_script: 'Run Script',
    lock_device: 'Lock Group',
    unlock_device: 'Unlock Group'
  };

  if (!onlineMembers.length) {
    showToast('Action blocked', 'No online users in this group.', 'warn');
    return { sent: 0, failed: 0, offlineCount };
  }

  if (action === 'restart_device' || action === 'shutdown_device' || action === 'signout_device') {
    const ok = await appConfirm({
      title: labels[action],
      message: `Confirm ${labels[action]} for group "${group.name}"?`,
      okLabel: 'Confirm'
    });
    if (!ok) return;
  }

  const script = action === 'run_script' ? String(scriptOverride || '').trim() : '';
  if (action === 'run_script' && !script) {
    showToast('Script required', 'Please enter PowerShell script.', 'warn');
    return { sent: 0, failed: 0, offlineCount };
  }

  let sent = 0;
  let failed = 0;
  for (const member of onlineMembers) {
    try {
      const result = await IPC.executePeerDeviceAction({
        peerId: member.id,
        action,
        script: script || undefined
      });
      if (result?.success) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  if (sent > 0) {
    addDashboardActivity('system', `${group.name} · ${labels[action]}`, 'Group action command queued.', `${sent} sent${offlineCount ? ` · ${offlineCount} offline` : ''}`);
    showToast('Action sent', `${labels[action]} sent to ${sent} member(s).${offlineCount ? ` ${offlineCount} offline.` : ''}`);
  } else {
    showToast('Action failed', 'Could not send this action to group members.', 'warn');
  }
  if (failed > 0) {
    showToast('Partial failure', `${failed} member(s) did not receive the action.`, 'warn');
  }
  return { sent, failed, offlineCount };
}

function openGroupVideoModal(groupId) {
  const group = getGroupById(groupId);
  const modal = document.getElementById('groupVideoModal');
  const title = document.getElementById('groupVideoTitle');
  const meta = document.getElementById('groupVideoMeta');
  const file = document.getElementById('groupVideoFile');
  const label = document.getElementById('groupVideoLabel');
  if (!group || !modal || !title || !meta || !file || !label) return;
  groupVideoId = group.id;
  groupVideoSelection = null;
  const runtime = getGroupRuntimeState(group);
  title.textContent = `Force Video · ${group.name}`;
  meta.textContent = `${getGroupOnlineMembers(group).length} online member(s)`;
  label.value = '';
  file.textContent = runtime.videoOn ? 'Video running for this group.' : 'No video selected.';
  modal.classList.add('show');
}

function closeGroupVideoModal() {
  const modal = document.getElementById('groupVideoModal');
  if (modal) modal.classList.remove('show');
  groupVideoId = null;
  groupVideoSelection = null;
}

function toggleGroupVideo(groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  const runtime = getResolvedGroupRuntimeState(group);
  if (runtime.videoOn) {
    groupVideoId = groupId;
    stopGroupVideo();
  } else {
    openGroupVideoModal(groupId);
  }
}

async function pickGroupVideoFile() {
  const result = await IPC.selectVideoBroadcastFile();
  if (!result?.success) {
    if (!result?.canceled) showToast('Video failed', result?.error || 'Could not load video.', 'warn');
    return;
  }
  groupVideoSelection = result;
  const file = document.getElementById('groupVideoFile');
  if (file) file.textContent = `${result.fileName} · ${fmtBytes(result.size || 0)}`;
}

async function startGroupVideo() {
  const group = getGroupById(groupVideoId || '');
  if (!group) return;
  const peerIds = getGroupOnlineMembers(group).map(peer => peer.id);
  if (!peerIds.length) {
    showToast('Broadcast blocked', 'No online users in this group.', 'warn');
    return;
  }
  if (!groupVideoSelection) {
    showToast('Video required', 'Choose a video first.', 'warn');
    return;
  }
  const label = (document.getElementById('groupVideoLabel')?.value || '').trim();
  const result = await IPC.sendForcedVideoBroadcast({
    videoB64: groupVideoSelection.data,
    mime: groupVideoSelection.mime,
    fileName: groupVideoSelection.fileName,
    label,
    peerIds
  });
  if (!result?.success) {
    showToast('Start failed', result?.error || 'Could not start group force video.', 'warn');
    return;
  }
  setGroupUiOverride(group.id, { videoOn: true });
  closeGroupVideoModal();
  switchTab('groups');
  setUsersWorkspaceTab('groups');
  renderGroupUI();
  showToast('Force video started', `Started for group "${group.name}".`);
}

async function stopGroupVideo() {
  const group = getGroupById(groupVideoId || '');
  if (!group) return;
  const peerIds = getGroupMembers(group).map(peer => peer.id);
  await IPC.stopForcedVideoBroadcast({ peerIds, broadcastId: null });
  setGroupUiOverride(group.id, { videoOn: false });
  closeGroupVideoModal();
  switchTab('groups');
  setUsersWorkspaceTab('groups');
  renderGroupUI();
  showToast('Force video stopped', `Stopped for group "${group.name}".`);
}

async function toggleGroupLock(groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  const runtime = getResolvedGroupRuntimeState(group);
  const action = runtime.lockOn ? 'unlock_device' : 'lock_device';
  const result = await executeGroupDeviceAction(group.id, action);
  if ((result?.sent || 0) > 0) {
    setGroupUiOverride(group.id, { lockOn: action === 'lock_device' });
    renderGroupUI();
  }
}

function renderGroupUI() {
  const groupsWrap = document.getElementById('grouplist');
  const select = document.getElementById('bcgroup');
  if (!groupsWrap || !select) return;

  groupsWrap.innerHTML = userGroups.length ? userGroups.map(group => {
    const members = getGroupMembers(group);
    const onlineMembers = members.filter(peer => peer.online);
    const memberNames = members.map(peer => peer.username).filter(Boolean);
    const runtime = getResolvedGroupRuntimeState(group);
    const initials = esc(String(group.name || '?').slice(0, 2).toUpperCase());
    return `
    <article class="directory-card compact group-directory-card">
      <div class="directory-top compact">
        <div class="directory-avatar">${initials}</div>
        <div class="directory-id">
          <div class="directory-name">${esc(group.name)}</div>
          <div class="directory-sub">${group.memberIds.length} member(s) · ${onlineMembers.length} online</div>
        </div>
        <div class="directory-dot${onlineMembers.length ? '' : ' off'}"></div>
      </div>

      <div class="directory-tags compact">
        <span class="directory-tag role">Group</span>
        ${renderGroupStatusBadge('lock', 'LOCK', !!runtime.lockOn)}
        ${renderGroupStatusBadge('video', 'VIDEO', !!runtime.videoOn)}
      </div>

      <div class="directory-quick-meta">
        <span>${esc(memberNames.length ? memberNames.join(', ') : 'No members yet')}</span>
      </div>

      <div class="directory-actions compact">
        <button class="ubtn" onclick="openGroupMembersModal('${group.id}')">Edit</button>
        <button class="ubtn" onclick="openGroupActionsModal('${group.id}')">Actions</button>
        <button class="ubtn group-state-btn ${runtime.videoOn ? 'on' : 'off'}" onclick="toggleGroupVideo('${group.id}')">${runtime.videoOn ? 'Stop Video' : 'Force Video'}</button>
        <button class="ubtn group-state-btn ${runtime.lockOn ? 'on' : 'off'}" onclick="toggleGroupLock('${group.id}')">${runtime.lockOn ? 'Unlock Group' : 'Lock Group'}</button>
      </div>
    </article>`;
  }).join('') : '<div class="group-empty-state">No saved groups yet.</div>';

  select.innerHTML = `<option value="">All Users</option>` + userGroups.map(group => `<option value="${group.id}">${esc(group.name)}</option>`).join('');
  const delSelect = document.getElementById('groupDeleteSelect');
  if (delSelect) delSelect.innerHTML = `<option value="">Select group to delete</option>` + userGroups.map(group => `<option value="${group.id}">${esc(group.name)}</option>`).join('');
}
