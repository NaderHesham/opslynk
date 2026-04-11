function openProfileModal() {
      document.getElementById('modname').value = getCurrentUserDisplayName(me);
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
      const verifiedIcon = verifiedSuperIconHTML(me.role);
      const badge = roleBadgeHTML(me.role);
      document.getElementById('profprevname').innerHTML = `<span class="mname-main"><span class="mname-text">${esc(getCurrentUserDisplayName(me))}</span>${verifiedIcon}</span>${badge}`;
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

function showSelfPasswordMsg(msg, type) {
      const el = document.getElementById('selfPwMsg');
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
      if (askUser) askUser.textContent = getCurrentUserDisplayName(me);
      renderMyProfile(); closeProfileModal();
    }

async function changeMyPasswordFromProfile() {
      openSelfPasswordModal();
    }

function openSelfPasswordModal() {
      if (_appMode === 'client' || me?.role !== 'super_admin' || !_acctCurrentUserId) {
        showToast('Not allowed', 'Only Super Admin can update this password.', 'warn');
        return;
      }
      ['selfPwCurrent', 'selfPwNext', 'selfPwConfirm'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
      });
      const msg = document.getElementById('selfPwMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'acct-self-msg';
        msg.style.display = 'none';
      }
      document.getElementById('selfPwModal')?.classList.add('show');
}

function closeSelfPasswordModal() {
      document.getElementById('selfPwModal')?.classList.remove('show');
}

async function submitSelfPasswordChange() {
      if (_appMode === 'client' || me?.role !== 'super_admin' || !_acctCurrentUserId) {
        showSelfPasswordMsg('Only Super Admin can update this password.', 'err');
        return;
      }
      const currentPassword = String(document.getElementById('selfPwCurrent')?.value || '');
      const newPassword = String(document.getElementById('selfPwNext')?.value || '');
      const confirmPassword = String(document.getElementById('selfPwConfirm')?.value || '');

      if (!currentPassword) {
        showSelfPasswordMsg('Current password is required.', 'err');
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        showSelfPasswordMsg('New password must be at least 6 characters.', 'err');
        return;
      }
      if (newPassword !== confirmPassword) {
        showSelfPasswordMsg('New password confirmation does not match.', 'err');
        return;
      }

      try {
        const result = await IPC.auth.changePassword({ userId: _acctCurrentUserId, currentPassword, newPassword });
        if (!result?.success) {
          showSelfPasswordMsg(result?.error || 'Failed to update password.', 'err');
          return;
        }
        showSelfPasswordMsg('Password updated successfully.', 'ok');
        setTimeout(() => closeSelfPasswordModal(), 500);
      } catch {
        showSelfPasswordMsg('An unexpected error occurred.', 'err');
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
