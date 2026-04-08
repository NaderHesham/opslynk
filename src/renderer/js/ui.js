function switchTab(t) {
      let targetTab = t;
      let workspaceTab = null;
      if (t === 'groups' || t === 'accounts') {
        targetTab = 'users';
        workspaceTab = t;
      } else if (t === 'users') {
        workspaceTab = 'directory';
      }

      document.querySelectorAll('#rail .tb, #tabbar .tb').forEach(b => {
        const buttonTab = b.dataset.tab;
        const isUsersFamily = targetTab === 'users' && (buttonTab === 'users' || buttonTab === 'groups' || buttonTab === 'accounts');
        b.classList.toggle('active', isUsersFamily ? buttonTab === 'users' : buttonTab === targetTab);
      });
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + targetTab));

      if (workspaceTab) setUsersWorkspaceTab(workspaceTab);
      if (targetTab === 'chat') ensureChatLayout();
      if (targetTab === 'dashboard') renderDashboard();
      if (targetTab === 'users' && (workspaceTab === 'accounts' || t === 'accounts')) loadAccounts();
    }

function setUsersWorkspaceTab(tab) {
      const normalized = tab === 'users' ? 'directory' : tab;
      document.querySelectorAll('.users-workspace-tab').forEach(btn => {
        const isActive = btn.id === `usersWorkspaceTab-${normalized}`;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      document.querySelectorAll('.users-workspace-panel').forEach(panel => {
        const isActive = panel.id === `usersWorkspacePanel-${normalized}`;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });
      if (normalized === 'accounts') loadAccounts();
}

window.setUsersWorkspaceTab = setUsersWorkspaceTab;

function showToast(title, body, type = '') {
      const t = document.createElement('div'); t.className = 'toast' + (type ? ' ' + type : '');
      t.innerHTML = `<div class="thdr"><span class="ttitle">${title}</span><button class="tclose" onclick="this.closest('.toast').remove()">✕</button></div><div class="tbody">${body}</div>`;
      document.getElementById('tc').appendChild(t); setTimeout(() => t?.remove(), 6000);
    }

function beep(f = 440, d = 0.12, v = 0.3) { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.start(); o.stop(c.currentTime + d); } catch { } }

function applyTheme(theme) {
  const activeTheme = normalizeTheme(theme);
  setTheme(activeTheme);
  document.querySelectorAll('.theme-sw [data-theme-option]').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.themeOption === activeTheme);
  });
  const themeValue = document.getElementById('settings-theme-value');
  if (themeValue) {
    themeValue.textContent = activeTheme.charAt(0).toUpperCase() + activeTheme.slice(1);
  }
  try { localStorage.setItem(THEME_STORAGE_KEY, activeTheme); } catch {}
}

window.applyTheme = applyTheme;

function initThemeSwitcher() {
  document.querySelectorAll('.theme-sw [data-theme-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeOption);
    });
  });
}

function openSettings() {
        document.getElementById('settings-overlay').classList.add('open');
      }

function closeSettings() {
        document.getElementById('settings-overlay').classList.remove('open');
      }

function settingsOverlayClick(e) {
        if (e.target === document.getElementById('settings-overlay')) closeSettings();
      }

try {
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
} catch {
  applyTheme('dark');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeSwitcher, { once: true });
} else {
  initThemeSwitcher();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSettings();
});
