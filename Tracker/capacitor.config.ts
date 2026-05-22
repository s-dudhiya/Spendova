import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.expensemate.app',
  appName: 'ExpenseMate',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',           // white icons on dark background
      backgroundColor: '#00000000', // transparent
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
