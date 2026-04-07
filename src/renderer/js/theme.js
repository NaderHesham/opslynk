const THEME_STORAGE_KEY = 'opslynk-theme';

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
}

try {
  setTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
} catch {
  setTheme('dark');
}
