import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'spendova-theme';
export const LEGACY_THEME_STORAGE_KEY = 'theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme | null;
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }

    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';

    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
