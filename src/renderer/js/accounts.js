async function loadAccounts() {
      const listEl    = document.getElementById('acct-list');
      const countEl   = document.getElementById('acct-count');
      const addBtn    = document.getElementById('acct-add-btn');
      if (!listEl) return;
      listEl.innerHTML = '<div style="color:var(--txt2);font-size:12px;padding:8px 0;">Loading…</div>';

      try {
        const users = await IPC.auth.listUsers();
        countEl.textContent = `${users.length} account${users.length !== 1 ? 's' : ''}`;

        const isSA = me?.role === 'super_admin';
        if (addBtn) addBtn.style.display = isSA ? '' : 'none';
        const saOpt = document.getElementById('acctSuperOption');
        if (saOpt) saOpt.style.display = isSA ? '' : 'none';

        if (!users.length) {
          listEl.innerHTML = '<div style="color:var(--txt3);font-size:12px;padding:8px 0;">No accounts found.</div>';
          return;
        }

        listEl.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="color:var(--txt3);border-bottom:1px solid var(--border);">
                <th style="text-align:left;padding:6px 10px 8px 0;font-weight:600;">Username</th>
                <th style="text-align:left;padding:6px 10px 8px;font-weight:600;">Role</th>
                <th style="text-align:left;padding:6px 10px 8px;font-weight:600;">Created</th>
                ${isSA ? '<th style="text-align:right;padding:6px 0 8px 10px;font-weight:600;">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const isSelf   = u.id === _acctCurrentUserId;
                const isSAUser = u.role === 'super_admin';
                const created  = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
                const roleBadge = u.role === 'super_admin'
                  ? '<span style="background:rgba(88,166,255,.12);color:#58a6ff;border:1px solid rgba(88,166,255,.25);border-radius:3px;font-size:10px;padding:1px 6px;font-family:monospace;">SUPER ADMIN</span>'
                  : '<span style="background:rgba(139,125,255,.1);color:#8b7dff;border:1px solid rgba(139,125,255,.2);border-radius:3px;font-size:10px;padding:1px 6px;font-family:monospace;">ADMIN</span>';
                const actions = isSA ? `
                  <td style="text-align:right;padding:8px 0 8px 10px;">
                    <button class="btns" style="font-size:11px;padding:3px 10px;" onclick="acctDelete('${u.id}','${esc(u.username)}')" ${isSelf || isSAUser ? 'disabled title="Cannot delete"' : ''}>Delete</button>
                  </td>` : '';
                return `<tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 10px 10px 0;color:var(--txt);font-weight:500;">${esc(u.username)}${isSelf ? ' <span style="color:var(--txt3);font-size:10px;">(you)</span>' : ''}</td>
                  <td style="padding:10px;">${roleBadge}</td>
                  <td style="padding:10px;color:var(--txt2);">${created}</td>
                  ${actions}
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      } catch (e) {
        listEl.innerHTML = '<div style="color:var(--red);font-size:12px;">Failed to load accounts.</div>';
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
