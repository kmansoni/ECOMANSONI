import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — production-grade cross-platform setup.
 *
 * Push wake-up strategy:
 *   iOS  → PushKit (VoIP) for incoming calls (wakes device from doze/locked state).
 *          Regular APNS alert push for messages.
 *   Android → FCM high-priority data messages (content-available:1) for calls.
 *             FCM notification messages for standard alerts.
 *   PWA/Windows → Web Push API (Notification + Service Worker + PushManager).
 *
 * Background fetch / keep-alive:
 *   BackgroundRunner plugin provides background execution on both iOS and Android
 *   for periodic token refresh and queued-message delivery.
 */
const config: CapacitorConfig = {
  appId: 'ru.mansoni.app',
  appName: 'Mansoni',
  webDir: 'dist',

  server: {
    androidScheme: 'https',
    // Allow cleartext only during local dev; never in production bundles.
    cleartext: false,
  },

  // ─── iOS ──────────────────────────────────────────────────────────────────
  ios: {
    // Enables PushKit VoIP entitlement for call-wake on locked/sleeping device.
    // Requires: Xcode entitlements com.apple.developer.pushkit.unrestricted-voip = true
    // and background mode: voip, remote-notification in Info.plist.
    contentInset: 'automatic',
    scrollEnabled: true,
    backgroundColor: '#000000',
    // limitsNavigationsToAppBoundDomains — prevents navigation outside app domain.
    limitsNavigationsToAppBoundDomains: true,
  },

  // ─── Android ──────────────────────────────────────────────────────────────
  android: {
    // allowMixedContent: false — strict TLS enforcement.
    allowMixedContent: false,
    // captureInput: true — ensures IME keyboard events reach WebView correctly.
    captureInput: true,
    // webContentsDebuggingEnabled: false in production.
    webContentsDebuggingEnabled: false,
    backgroundColor: '#000000',
  },

  // ─── Plugins ──────────────────────────────────────────────────────────────
  plugins: {
    /**
     * PushNotifications — handles both FCM (Android) and APNS alert (iOS).
     * VoIP / call-wake is handled separately via @capacitor-community/fcm
     * and native CallKit (iOS) / ConnectionService (Android) bridges.
     */
    PushNotifications: {
      // presentationOptions controls foreground notification display.
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    /**
     * LocalNotifications — used as fallback when app is in foreground
     * to render call-ring UI without native system UI.
     */
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#5B21B6',
      sound: 'ringtone.wav',
    },

    /**
     * SplashScreen — minimal splash with no delay to prevent layout flash.
     */
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },

    /**
     * CapacitorHttp — routes all fetch() through native HTTP stack on iOS.
     * Prevents ATS (App Transport Security) blocks and preserves cookies.
     */
    CapacitorHttp: {
      enabled: true,
    },

    /**
     * Keyboard — prevents viewport resize jank on iOS Safari when keyboard appears.
     */
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },

    /**
     * StatusBar — overlaid translucent status bar for edge-to-edge layout.
     */
    StatusBar: {
      style: 'dark',
      overlaysWebView: true,
    },

    /**
     * BackgroundRunner — background task for periodic keep-alive / token refresh.
     * Label must match the registered BGTaskScheduler identifier in Info.plist.
     */
    BackgroundRunner: {
      label: 'ru.mansoni.app.background',
      src: 'background.js',
      event: 'background',
      repeat: true,
      interval: 15,                // minutes (iOS minimum is 15)
      autoStart: true,
    },
  },
};

export default config;
