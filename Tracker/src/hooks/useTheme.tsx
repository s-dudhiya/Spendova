import { useState, useEffect } from 'react';
import { safeStorage } from '@/lib/startup-safety';

type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'spendova-theme';
export const LEGACY_THEME_STORAGE_KEY = 'theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = safeStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    const legacy = safeStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme | null;
    if (legacy === 'light' || legacy === 'dark') {
      safeStorage.setItem(THEME_STORAGE_KEY, legacy);
      safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }

    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (theme === 'dark') {
      root.classList.add('dark');
      if (metaThemeColor) metaThemeColor.setAttribute('content', 'hsl(248, 40%, 7%)');
    } else {
      root.classList.remove('dark');
      if (metaThemeColor) metaThemeColor.setAttribute('content', 'hsl(250, 28%, 80%)');
    }
    safeStorage.setItem(THEME_STORAGE_KEY, theme);
    safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
