import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.mansoni.app',
  appName: 'mansoni',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
