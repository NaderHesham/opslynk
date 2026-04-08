function switchTab(t) {
      document.querySelectorAll('#rail .tb, #tabbar .tb').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
      if (t === 'chat') ensureChatLayout();
      if (t === 'dashboard') renderDashboard();
      if (t === 'accounts') loadAccounts();
    }

function showToast(title, body, type = '') {
      const t = document.createElement('div'); t.className = 'toast' + (type ? ' ' + type : '');
      t.innerHTML = `<div class="thdr"><span class="ttitle">${title}</span><button class="tclose" onclick="this.closest('.toast').remove()">✕</button></div><div class="tbody">${body}</div>`;
      document.getElementById('tc').appendChild(t); setTimeout(() => t?.remove(), 6000);
    }

function beep(f = 440, d = 0.12, v = 0.3) { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.start(); o.stop(c.currentTime + d); } catch { } }

function applyTheme(theme) {
  setTheme(theme);
  const activeTheme = theme === 'white' ? 'light' : theme;
  document.querySelectorAll('.theme-sw [data-theme-option]').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.themeOption === activeTheme);
  });
  const themeValue = document.getElementById('settings-theme-value');
  if (themeValue) {
    themeValue.textContent = activeTheme.charAt(0).toUpperCase() + activeTheme.slice(1);
  }
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
}

window.applyTheme = applyTheme;

function initThemeSwitcher() {
  document.querySelectorAll('.theme-sw [data-theme-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themeOption === 'light' ? 'light' : btn.dataset.themeOption;
      applyTheme(theme);
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
