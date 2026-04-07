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
      addDashboardActivity('system', 'Group saved', `Audience "${name}" is ready for targeted broadcasts.`, `${memberIds.length} member(s)`);
      showToast('Group saved', 'Broadcast group saved successfully.');
    }

async function deleteGroup(id) {
      const result = await IPC.deleteUserGroup({ id });
      if (!result?.success) return;
      userGroups = result.groups || [];
      renderGroupUI();
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
      <span>${esc(peer.username)}</span>
    </label>
  `).join('') : '<div class="group-meta">No connected users yet.</div>';
      groupsWrap.innerHTML = userGroups.length ? userGroups.map(group => {
        const memberNames = group.memberIds.map(id => peers[id]?.username).filter(Boolean);
        return `
    <div class="group-row">
      <div>
        <div style="font-size:12px;font-weight:700;">${esc(group.name)}</div>
        <div class="group-meta">${group.memberIds.length} member(s)</div>
        <div class="group-members">${esc(memberNames.length ? memberNames.join(', ') : 'No members currently online')}</div>
      </div>
      <button class="ubtn" onclick="deleteGroup('${group.id}')">Delete</button>
    </div>`;
      }).join('') : '<div class="group-meta">No saved groups yet.</div>';
      select.innerHTML = `<option value="">All Users</option>` + userGroups.map(group => `<option value="${group.id}">${esc(group.name)}</option>`).join('');
    }
