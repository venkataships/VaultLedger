const THEME_STORAGE_KEY = 'asfinance_theme_v1';

export function loadTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage read errors
  }
  return 'dark';
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(next);
  root.dataset.theme = next;
  root.style.colorScheme = next;
}

export function saveTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignore storage quota errors
  }
  applyTheme(next);
  return next;
}
