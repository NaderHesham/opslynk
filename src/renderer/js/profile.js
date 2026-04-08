function openProfileModal() {
      document.getElementById('modname').value = me.username || '';
      document.getElementById('modtitle').value = me.title || '';
      const acctCard = document.getElementById('profacct-card');
      if (acctCard) acctCard.style.display = (_appMode !== 'client' && me?.role === 'super_admin') ? '' : 'none';
      const acctMsg = document.getElementById('profacct-msg');
      if (acctMsg) {
        acctMsg.textContent = '';
        acctMsg.className = 'acct-self-msg';
        acctMsg.style.display = 'none';
      }
      ['profCurrentPw', 'profNewPw', 'profConfirmPw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      modalAvatar = me.avatar || null;
      const a = document.getElementById('profprev'); applyAvatar(a, { ...me, avatar: modalAvatar, role: _appMode === 'client' ? 'user' : me.role });
      document.getElementById('profprevname').innerHTML = `${esc(me.username)} ${_appMode !== 'client' ? roleBadgeHTML(me.role) : ''}`;
      document.getElementById('profprevtitle').textContent = me.title || 'No title set';
      document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('sel', s.dataset.color === me.color));
      document.getElementById('profmodal').classList.add('show');
    }

function closeProfileModal() { document.getElementById('profmodal').classList.remove('show'); }

function showProfileAccountMsg(msg, type) {
      const el = document.getElementById('profacct-msg');
      if (!el) return;
      el.textContent = msg;
      el.className = `acct-self-msg ${type}`;
      el.style.display = 'block';
    }

async function saveProfile() {
      const username = (document.getElementById('modname').value || '').trim();
      const title = document.getElementById('modtitle').value.trim();
      const color = document.querySelector('.swatch.sel')?.dataset.color || me.color;
      const nextUsername = username || me.username;
      if (_appMode !== 'client' && me?.role === 'super_admin' && _acctCurrentUserId && nextUsername !== me.username) {
        const result = await IPC.auth.updateSelfProfile({ userId: _acctCurrentUserId, username: nextUsername });
        if (!result?.success) {
          showToast('Profile save failed', result?.error || 'Could not update display name.', 'warn');
          return;
        }
      }
      me = await IPC.updateProfile({ username: nextUsername, title, color, avatar: modalAvatar });
      const askUser = document.getElementById('afh-user');
      if (askUser) askUser.textContent = me.username || '';
      renderMyProfile(); closeProfileModal();
    }

async function changeMyPasswordFromProfile() {
      if (_appMode === 'client' || me?.role !== 'super_admin' || !_acctCurrentUserId) {
        showProfileAccountMsg('Only Super Admin can update this password.', 'err');
        return;
      }

      const currentPassword = String(document.getElementById('profCurrentPw')?.value || '');
      const newPassword = String(document.getElementById('profNewPw')?.value || '');
      const confirmPassword = String(document.getElementById('profConfirmPw')?.value || '');

      if (!currentPassword) {
        showProfileAccountMsg('Current password is required.', 'err');
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        showProfileAccountMsg('New password must be at least 6 characters.', 'err');
        return;
      }
      if (newPassword !== confirmPassword) {
        showProfileAccountMsg('New password confirmation does not match.', 'err');
        return;
      }

      try {
        const result = await IPC.auth.changePassword({ userId: _acctCurrentUserId, currentPassword, newPassword });
        if (!result?.success) {
          showProfileAccountMsg(result?.error || 'Failed to update password.', 'err');
          return;
        }

        document.getElementById('profCurrentPw').value = '';
        document.getElementById('profNewPw').value = '';
        document.getElementById('profConfirmPw').value = '';
        showProfileAccountMsg('Password updated successfully.', 'ok');
      } catch {
        showProfileAccountMsg('An unexpected error occurred.', 'err');
      }
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
