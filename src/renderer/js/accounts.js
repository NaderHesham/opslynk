async function loadAccounts() {
      const listEl    = document.getElementById('acct-list');
      const countEl   = document.getElementById('acct-count');
      const addBtn    = document.getElementById('acct-add-btn');
      if (!listEl) return;
      listEl.innerHTML = '<div class="acct-state">Loading...</div>';

      try {
        const users = await IPC.auth.listUsers();
        countEl.textContent = `${users.length} account${users.length !== 1 ? 's' : ''}`;

        const isSA = me?.role === 'super_admin';
        if (addBtn) addBtn.style.display = isSA ? '' : 'none';
        const saOpt = document.getElementById('acctSuperOption');
        if (saOpt) saOpt.style.display = isSA ? '' : 'none';

        if (!users.length) {
          listEl.innerHTML = '<div class="acct-state empty">No accounts found.</div>';
          return;
        }

        listEl.innerHTML = `<div class="acct-card-list">${users.map(u => {
          const isSelf = u.id === _acctCurrentUserId;
          const isSAUser = u.role === 'super_admin';
          const created = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-';
          const initial = esc((u.username || '?')[0]?.toUpperCase() || '?');
          const roleClass = u.role === 'super_admin' ? 'super' : 'admin';
          const roleLabel = u.role === 'super_admin' ? 'Super Admin' : 'Admin';
          const actions = isSA
            ? `<button class="btns acct-delete-btn" onclick="acctDelete('${u.id}','${esc(u.username)}')" ${isSelf || isSAUser ? 'disabled title="Cannot delete"' : ''}>Delete</button>`
            : '';
          return `
          <article class="acct-card">
            <div class="acct-card-top">
              <div class="acct-avatar ${roleClass}">${initial}</div>
              <div class="acct-id">
                <div class="acct-user">${esc(u.username)}${isSelf ? ' <span class="acct-self">(you)</span>' : ''}</div>
                <div class="acct-created">Created ${created}</div>
              </div>
              <span class="acct-role ${roleClass}">${roleLabel}</span>
            </div>
            <div class="acct-card-actions">
              ${actions || '<span class="acct-action-placeholder">Managed by current session role</span>'}
            </div>
          </article>`;
        }).join('')}</div>`;
      } catch (e) {
        listEl.innerHTML = '<div class="acct-state error">Failed to load accounts.</div>';
      }
    }

function acctToggleForm(show) {
      const form = document.getElementById('acct-add-form');
      if (!form) return;
      form.style.display = show ? '' : 'none';
      if (show) {
        document.getElementById('acctNewUser').value = '';
        document.getElementById('acctNewPw').value   = '';
        document.getElementById('acctNewRole').value = 'admin';
        document.getElementById('acct-form-err').style.display = 'none';
        document.getElementById('acctNewUser').focus();
      }
    }

async function acctCreateUser() {
      const username = document.getElementById('acctNewUser').value.trim();
      const password = document.getElementById('acctNewPw').value;
      const role     = document.getElementById('acctNewRole').value;
      const errEl    = document.getElementById('acct-form-err');
      errEl.style.display = 'none';

      if (!username) { acctShowFormErr('Username is required.'); return; }
      if (!password || password.length < 6) { acctShowFormErr('Password must be at least 6 characters.'); return; }

      try {
        const result = await IPC.auth.createUser({ username, password, role });
        if (result.success) {
          acctToggleForm(false);
          acctShowFeedback('Account created successfully.', 'ok');
          await loadAccounts();
        } else {
          acctShowFormErr(result.error || 'Failed to create account.');
        }
      } catch {
        acctShowFormErr('An unexpected error occurred.');
      }
    }

async function acctDelete(userId, username) {
      if (!_acctCurrentUserId) return;
      const confirmed = confirm(`Delete account "${username}"? This cannot be undone.`);
      if (!confirmed) return;
      try {
        const result = await IPC.auth.deleteUser({ userId, requesterId: _acctCurrentUserId });
        if (result.success) {
          acctShowFeedback('Account deleted.', 'ok');
          await loadAccounts();
        } else {
          acctShowFeedback(result.error || 'Failed to delete account.', 'err');
        }
      } catch {
        acctShowFeedback('An unexpected error occurred.', 'err');
      }
    }

function acctShowFormErr(msg) {
      const el = document.getElementById('acct-form-err');
      el.textContent = msg;
      el.style.display = 'block';
    }

function acctShowFeedback(msg, type) {
      const el = document.getElementById('acct-feedback');
      el.textContent = msg;
      el.style.color   = type === 'ok' ? 'var(--green)' : 'var(--red)';
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
