import { useState, useEffect } from 'react';
import { safeStorage } from '@/lib/startup-safety';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'spendova-theme';
export const LEGACY_THEME_STORAGE_KEY = 'theme';

export function applyThemeColor(theme: Theme) {
  const isDark = theme === 'dark';
  const hexColor = isDark ? '#0D0B19' : '#C2BDDA';
  const hslColor = isDark ? 'hsl(248, 40%, 7%)' : 'hsl(250, 28%, 80%)';
  const root = document.documentElement;

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.style.backgroundColor = hslColor;
  if (document.body) {
    document.body.style.backgroundColor = hslColor;
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', hexColor);
  }

  // Dynamically update mobile app native status bar text color/style and background color
  try {
    if (Capacitor.isPluginAvailable('StatusBar')) {
      void StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light
      });
      
      // Explicitly set the background color on Android to eliminate divider/border lines
      if (Capacitor.getPlatform() === 'android') {
        void StatusBar.setBackgroundColor({ color: hexColor });
      }
    }
  } catch (err) {
    console.warn('Native status bar styling not available:', err);
  }
}

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
    applyThemeColor(theme);
    safeStorage.setItem(THEME_STORAGE_KEY, theme);
    safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
