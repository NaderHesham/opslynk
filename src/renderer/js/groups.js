async function saveGroup() {
      const name = (document.getElementById('groupname')?.value || '').trim();
      const memberIds = [...document.querySelectorAll('#groupmembers input:checked')].map(el => el.value);
      const result = await IPC.saveUserGroup({ name, memberIds });
      if (!result?.success) {
        showToast('Group failed', result?.error || 'Could not save group.', 'warn');
        return;
      }
      userGroups = result.groups || [];
      document.getElementById('groupname').value = '';
      document.querySelectorAll('#groupmembers input:checked').forEach(el => { el.checked = false; });
      renderGroupUI();
      renderMonitorTab();
      addDashboardActivity('system', 'Group saved', `Audience "${name}" is ready for targeted broadcasts.`, `${memberIds.length} member(s)`);
      showToast('Group saved', 'Broadcast group saved successfully.');
    }

async function deleteGroup(id) {
      const result = await IPC.deleteUserGroup({ id });
      if (!result?.success) return;
      userGroups = result.groups || [];
      renderGroupUI();
      renderMonitorTab();
      addDashboardActivity('system', 'Group removed', 'Saved audience deleted from the admin console.', id);
    }

function renderGroupUI() {
      const membersWrap = document.getElementById('groupmembers');
      const groupsWrap = document.getElementById('grouplist');
      const select = document.getElementById('bcgroup');
      if (!membersWrap || !groupsWrap || !select) return;
      const sorted = getSortedPeers();

      membersWrap.innerHTML = sorted.length ? sorted.map(peer => `
    <label class="member-check">
      <input type="checkbox" value="${peer.id}">
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
          <span class="member-check-tag role">${esc(hasAdminAccess(peer.role) ? 'Admin' : 'User')}</span>
        </div>
      </div>
    </label>
  `).join('') : '<div class="group-empty-state">No connected users yet.</div>';

      groupsWrap.innerHTML = userGroups.length ? userGroups.map(group => {
        const memberNames = group.memberIds.map(id => peers[id]?.username).filter(Boolean);
        return `
    <article class="group-row">
      <div class="group-row-copy">
        <div class="group-row-head">
          <div class="group-row-title">${esc(group.name)}</div>
          <div class="group-row-meta">${group.memberIds.length} member(s)</div>
        </div>
        <div class="group-members">${esc(memberNames.length ? memberNames.join(', ') : 'No members currently online')}</div>
      </div>
      <div class="group-row-actions">
        <button class="ubtn" onclick="deleteGroup('${group.id}')">Delete</button>
      </div>
    </article>`;
      }).join('') : '<div class="group-empty-state">No saved groups yet.</div>';

      select.innerHTML = `<option value="">All Users</option>` + userGroups.map(group => `<option value="${group.id}">${esc(group.name)}</option>`).join('');
    }
