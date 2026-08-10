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
  const root = document.documentElement;

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Remove inline background style overrides so CSS variables drive page background cleanly
  root.style.removeProperty('background-color');
  if (document.body) {
    document.body.style.removeProperty('background-color');
  }

  // Force Chrome / WebKit browsers to update top status bar tint by replacing meta theme-color tag in <head>
  try {
    const existingMetas = document.querySelectorAll('meta[name="theme-color"]');
    existingMetas.forEach(meta => meta.remove());

    const newMeta = document.createElement('meta');
    newMeta.name = 'theme-color';
    newMeta.content = hexColor;
    document.head.appendChild(newMeta);
  } catch (e) {
    // Ignore DOM errors if any
  }

  // Dynamically update mobile app native status bar in Capacitor (Android APK & iOS IPA builds)
  try {
    if (Capacitor.isPluginAvailable('StatusBar')) {
      void StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light
      });
      if (Capacitor.isNativePlatform()) {
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
