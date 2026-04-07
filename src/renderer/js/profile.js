function openProfileModal() {
      document.getElementById('modname').value = me.username || '';
      document.getElementById('modtitle').value = me.title || '';
      modalAvatar = me.avatar || null;
      const a = document.getElementById('profprev'); applyAvatar(a, { ...me, avatar: modalAvatar, role: _appMode === 'client' ? 'user' : me.role });
      document.getElementById('profprevname').innerHTML = `${esc(me.username)} ${_appMode !== 'client' ? roleBadgeHTML(me.role) : ''}`;
      document.getElementById('profprevtitle').textContent = me.title || 'No title set';
      document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('sel', s.dataset.color === me.color));
      document.getElementById('profmodal').classList.add('show');
    }

function closeProfileModal() { document.getElementById('profmodal').classList.remove('show'); }

async function saveProfile() {
      const username = (document.getElementById('modname').value || '').trim();
      const title = document.getElementById('modtitle').value.trim();
      const color = document.querySelector('.swatch.sel')?.dataset.color || me.color;
      me = await IPC.updateProfile({ username: username || me.username, title, color, avatar: modalAvatar });
      renderMyProfile(); closeProfileModal();
    }

async function pickAvatar() {
      const result = await IPC.selectAvatar();
      if (!result?.success) {
        if (result?.error) showToast('Profile image failed', result.error, 'warn');
        return;
      }
      modalAvatar = result.avatar;
      applyAvatar(document.getElementById('profprev'), { ...me, avatar: modalAvatar, role: _appMode === 'client' ? 'user' : me.role });
    }

function removeAvatar() {
      modalAvatar = null;
      applyAvatar(document.getElementById('profprev'), { ...me, avatar: null, role: _appMode === 'client' ? 'user' : me.role });
    }
