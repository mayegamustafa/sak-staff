import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedDark: boolean;
}

function applyTheme(theme: Theme): boolean {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  return dark;
}

const saved = (localStorage.getItem('sak_theme') ?? 'system') as Theme;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialDark = saved === 'dark' || (saved === 'system' && prefersDark);

export const useThemeStore = create<ThemeState>(() => ({
  theme: saved,
  resolvedDark: initialDark,

  setTheme: (theme: Theme) => {
    localStorage.setItem('sak_theme', theme);
    const dark = applyTheme(theme);
    useThemeStore.setState({ theme, resolvedDark: dark });
  },
}));

// Keep theme in sync when the OS preference changes (only if tracking system)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { theme } = useThemeStore.getState();
  if (theme === 'system') {
    useThemeStore.getState().setTheme('system');
  }
});
