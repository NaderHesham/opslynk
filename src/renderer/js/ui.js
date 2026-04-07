function switchTab(t) {
      document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
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
  ['dark', 'white', 'gaming'].forEach(t => {
    document.getElementById('tc-' + t)?.classList.toggle('active', t === theme);
  });
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSettings();
});
