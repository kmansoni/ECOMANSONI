/**
 * Type definitions for useMiniApp hook
 */

import type {
  TelegramThemeParams,
  TelegramViewport,
  TelegramHeaderColorType,
  TelegramLocation,
  TelegramAccelerometerData,
  TelegramGyroscopeData,
  TelegramDeviceOrientationData,
  TelegramQRCodeText,
  TelegramContactPayload,
  TelegramEmojiStatus,
} from '@/lib/telegram/types';

// Result type for all async API calls
export type Result<T> = { ok: true; result: T } | { ok: false; error: string };

export interface MiniAppState {
  platform: string;
  version: string | undefined;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isFullscreen: boolean;
  isOrientationLocked: boolean;
  isActive: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  flashMode: 'on' | 'off' | 'auto';
}

export interface UseMiniAppReturn extends MiniAppState {
  // Lifecycle
  ready: () => void;
  expand: () => void;
  close: () => void;
  init: () => void;
  // Theme
  setHeaderColor: (type: 'bg_color' | 'secondary_bg_color') => void;
  setBackgroundColor: (color: string) => void;
  getColorSchemeColors: () => { bg_color: string; button_color: string; button_text_color: string };
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  lockOrientation: (orientation: 'portrait' | 'landscape') => Promise<void>;
  unlockOrientation: () => Promise<void>;
  isVerticalSwipesEnabled: () => boolean;
  enableVerticalSwipes: () => Promise<void>;
  disableVerticalSwipes: () => Promise<void>;
  getFlashMode: () => 'on' | 'off' | 'auto';
  setFlashMode: (mode: 'on' | 'off' | 'auto') => void;
  // Main button
  showMainButton: () => void;
  hideMainButton: () => void;
  setMainButton: (text: string) => void;
  onMainButtonClick: (cb: () => void) => void;
  offMainButtonClick: () => void;
  // Secondary button
  showSecondaryButton: () => void;
  hideSecondaryButton: () => void;
  setSecondaryButton: (text: string) => void;
  onSecondaryButtonClick: (cb: () => void) => void;
  // Back button
  showBackButton: () => void;
  hideBackButton: () => void;
  onBackButtonClick: (cb: () => void) => void;
  offBackButtonClick: () => void;
  // Dialogs (Result-based)
  showPopup: (params: { title?: string; message: string; buttons?: Array<{ id?: string; type: 'default' | 'destructive' | 'ok' | 'cancel' | 'close'; text: string }> }) => Promise<Result<string | undefined>>;
  showConfirm: (message: string) => Promise<Result<boolean>>;
  showAlert: (message: string) => Promise<Result<boolean>>;
  // Events
  onFullscreenChange: (cb: (v: boolean) => void) => void;
  offFullscreenChange: () => void;
  onOrientationChange: (cb: (o: { width: number; height: number }) => void) => void;
  offOrientationChange: () => void;
  onViewportChange: (cb: (v: TelegramViewport) => void) => void;
  offViewportChange: () => void;
  onActiveChange: (cb: (v: boolean) => void) => void;
  offActiveChange: () => void;
  onInvoiceClose: (cb: (r: { status: string; slug?: string }) => void) => void;
  offInvoiceClose: () => void;
  onPopupClosed: (cb: (buttonId: string) => void) => void;
  offPopupClosed: () => void;
  onFlashModeChange: (cb: (mode: 'on' | 'off' | 'auto') => void) => void;
  offFlashModeChange: () => void;
  onAccelerometerChange: (cb: (d: TelegramAccelerometerData) => void) => void;
  offAccelerometerChange: () => void;
  onGyroscopeChange: (cb: (d: TelegramGyroscopeData) => void) => void;
  offGyroscopeChange: () => void;
  onDeviceOrientationChange: (cb: (d: TelegramDeviceOrientationData) => void) => void;
  offDeviceOrientationChange: () => void;
  onLocationUpdate: (cb: (loc: TelegramLocation) => void) => void;
  offLocationUpdate: () => void;
  // Storage (Result-based)
  storage: {
    get: (keys: string[]) => Promise<Result<Array<{ key: string; value: string }>>>;
    getOne: (key: string) => Promise<Result<string | null>>;
    set: (items: Array<{ key: string; value: string }>) => Promise<Result<void>>;
    delete: (keys: string[]) => Promise<Result<void>>;
  };
  secure: {
    get: (key: string) => Promise<Result<string | null>>;
    set: (key: string, value: string) => Promise<Result<void>>;
  };
  session: {
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
    clear: () => void;
  };
  deviceStorage: {
    get: (key: string) => Promise<Result<string | null>>;
    set: (key: string, value: string) => Promise<Result<void>>;
    remove: (key: string) => Promise<Result<void>>;
    clear: () => Promise<Result<void>>;
  };
  // Sensors
  accelerometerApi: {
    start: () => void;
    stop: () => void;
    on: (cb: (d: { x: number; y: number; z: number }) => void) => void;
    off: () => void;
    isSupported: () => boolean;
  };
  gyroscopeApi: {
    start: () => void;
    stop: () => void;
    on: (cb: (d: { alpha?: number; beta?: number; gamma?: number }) => void) => void;
    off: () => void;
    isSupported: () => boolean;
  };
  deviceOrientationApi: {
    start: () => void;
    stop: () => void;
    on: (cb: (d: { absolute: boolean; alpha: number; beta: number; gamma: number }) => void) => void;
  };
  // Location (Result-based)
  location: {
    request: (opts?: { enableHighAccuracy?: boolean }) => Promise<Result<TelegramLocation>>;
    startUpdates: (cb: (loc: TelegramLocation) => void) => void;
    stopUpdates: () => void;
  };
  getLocationApi: () => Promise<Result<TelegramLocation>>;
  locationManagerApi: {
    request: (opts?: { enableHighAccuracy?: boolean }) => Promise<void>;
    onUpdate: (cb: (loc: TelegramLocation) => void) => void;
    offUpdate: () => void;
  };
  // QR (Result-based)
  scanQR: () => Promise<Result<TelegramQRCodeText | null>>;
  isQRScannerSupported: () => boolean;
  // Contact (Result-based)
  contact: { request: () => Promise<Result<TelegramContactPayload | null>> };
  writeAccess: () => Promise<Result<boolean>>;
  // Haptics
  hapticApi: {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notification: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  // Biometric (Result-based)
  biometricApi: {
    check: () => Promise<Result<{ available: boolean; type: string; access_requested: boolean }>>;
    authenticate: (params?: { reason?: string; finger_print?: string }) => Promise<Result<{ token?: string }>>;
  };
  requestBiometricAccess: () => Promise<Result<boolean>>;
  // Files
  files: {
    download: (fileId: string, secure?: boolean) => Promise<Result<string>>;
    share: (files: Array<{ name: string; blob: Blob }>) => Result<void>;
  };
  // Clipboard (Result-based)
  clipboard: { readText: () => Promise<Result<string>> };
  // Init Data
  initData: Record<string, unknown> | null;
  initDataRaw: string | undefined;
  // Misc
  sendData: (data: string | object) => void;
  getDeviceInfo: () => { platform: string; model?: string; isIOS?: boolean; isAndroid?: boolean };
  // Additional API
  switchInlineQuery: (params: { query: string; chat_types?: string[] }) => void;
  openLink: (url: string, params?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (path: string) => void;
  openInvoice: (url: string) => void;
  shareToStory: (params: { media_url: string; text?: string; widget_link?: { url: string; name: string } }) => void;
  showEmojiStatus: () => void;
  setEmojiStatus: (status: TelegramEmojiStatus) => Promise<Result<void>>;
  requestEmojiStatusAccess: () => Promise<Result<boolean>>;
  setSwipeBehavior: (behavior: 'none' | 'horizontal' | 'vertical') => void;
  requestChat: (params: { chat_id: number | string; message_text?: string }) => Promise<Result<void>>;
  addToHomeScreen: () => Promise<Result<void>>;
  checkHomeScreenStatus: () => Promise<Result<string>>;
  hideKeyboard: () => void;
  // Backward-compatible (deprecated)
  setBackHandler: (cb: () => void) => void;
  clearBackHandler: () => void;
  // Button objects (Telegram API objects)
  mainButton: typeof import('@/lib/mini-app').MainButton;
  secondaryButton: typeof import('@/lib/mini-app').SecondaryButton;
  settingsButton: typeof import('@/lib/mini-app').SettingsButton;
}
