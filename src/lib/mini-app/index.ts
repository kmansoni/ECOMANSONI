/**
 * Mansoni Mini App — Unified Bridge
 *
 * Автоматически выбирает реализацию: Telegram WebApp или нативные Web API.
 * Полностью независимая от presence window.Telegram.
 * Основной публичный интерфейс для useMiniApp и внешних пакетов.
 *
 * Принцип:
 * - Если window.Telegram?.WebApp доступен → использует Telegram-обёртки
 * - Иначе → использует нативные Web API (fallback)
 *
 * Все асинхронные методы возвращают Result<T> = { ok: true; result } | { ok: false; error }.
 */

import type {
  TelegramThemeParams, TelegramPopupParams, TelegramPopupButton,
  TelegramMainButtonParams, TelegramSettingsButtonParams,
  TelegramLocation, TelegramAccelerometerData, TelegramGyroscopeData,
  TelegramDeviceOrientationData, TelegramQRCodeText, TelegramContactPayload,
  TelegramEmojiStatus, TelegramViewport, TelegramSafeArea, TelegramContentSafeArea,
  TelegramAttachmentFile, TelegramHeaderColorType, TelegramOrientationType,
  TelegramSwitchInlineQueryParams, TelegramOpenLinkParams,
  TelegramShareMessageParams, TelegramShareStoryParams,
} from '../telegram/types';

import {
  // Telegram-обёртки
  ready as tgReady, expand as tgExpand, close as tgClose,
  getPlatform as tgGetPlatform, getVersion as tgGetVersion,
  getColorScheme as tgGetColorScheme, getThemeParams as tgGetThemeParams,
  isDesktop as tgIsDesktop, isMobile as tgIsMobile,
  setHeaderColor as tgSetHeaderColor, setBackgroundColor as tgSetBackgroundColor,
  getColorSchemeColors as tgGetColorSchemeColors,
  MainButton as TgMainButton, SecondaryButton as TgSecondaryButton,
  SettingsButton as TgSettingsButton, BackButton as TgBackButton,
  showPopup as tgShowPopupImpl, showAlert as tgShowAlertImpl, showConfirm as tgShowConfirmImpl,
  haptic as TgHaptic,
  cloudStorage as TgCloudStorage, secureStorage as TgSecureStorage,
  openQRScanner as TgOpenQRScanner, closeQRScanner as TgCloseQRScanner,
  addToHomeScreen as TgAddToHomeScreen, checkHomeScreenStatus as TgCheckHomeScreenStatus,
  requestContact as TgRequestContact, requestWriteAccess as TgRequestWriteAccess,
  downloadFile as TgDownloadFile, shareFiles as TgShareFiles,
  getLocation as TgGetLocation, locationManager as TgLocationManager,
  accelerometer as TgAccelerometer, gyroscope as TgGyroscope, deviceOrientation as TgDeviceOrientation,
  getInitData as TgGetInitData, getInitDataRaw as TgGetInitDataRaw,
  showEmojiStatus as TgShowEmojiStatus, showBioCheckPopup as TgShowBioCheckPopup,
  setSwipeBehavior as TgSetSwipeBehavior, requestChat as TgRequestChat,
  hideKeyboard as TgHideKeyboard,
  requestFullscreen as TgRequestFullscreen, exitFullscreen as TgExitFullscreen, isFullscreen as TgIsFullscreen,
  lockOrientation as TgLockOrientation, unlockOrientation as TgUnlockOrientation, isOrientationLocked as TgIsOrientationLocked,
  enableVerticalSwipes as TgEnableVerticalSwipes, disableVerticalSwipes as TgDisableVerticalSwipes, isVerticalSwipesEnabled as TgIsVerticalSwipesEnabled,
  getViewportHeight as TgGetViewportHeight, getViewportStableHeight as TgGetViewportStableHeight,
  getSafeArea as TgGetSafeArea, getContentSafeArea as TgGetContentSafeArea,
  isActive as TgIsActive,
  switchInlineQuery as TgSwitchInlineQuery, openLink as TgOpenLink, openTelegramLink as TgOpenTelegramLink,
  openInvoice as TgOpenInvoice, shareToStory as TgShareToStory, shareMessage as TgShareMessage,
  readTextFromClipboard as TgReadTextFromClipboard,
  requestEmojiStatusAccess as TgRequestEmojiStatusAccess, setEmojiStatus as TgSetEmojiStatus,
  // Events
  onFullscreenChange as TgOnFullscreenChange, onOrientationChange as TgOnOrientationChange,
  onViewportChange as TgOnViewportChange, onActiveChange as TgOnActiveChange,
  onInvoiceClose as TgOnInvoiceClose, onPopupClosed as TgOnPopupClosed,
  onFlashModeChange as TgOnFlashModeChange,
  onAccelerometerChange as TgOnAccelerometerChange, onGyroscopeChange as TgOnGyroscopeChange,
  onDeviceOrientationChange as TgOnDeviceOrientationChange, onLocationUpdate as TgOnLocationUpdate,
  // Flash mode
  getFlashMode as TgGetFlashMode, setFlashMode as TgSetFlashMode,
  // Biometric
  biometric as TgBiometric, requestBiometricAccess as TgRequestBiometricAccess,
  // Device storage
  deviceStorage as TgDeviceStorage,
  // Send data
  sendData as TgSendData,
  // Off-хендлеры
  offFullscreenChange as TgOffFullscreenChange, offOrientationChange as TgOffOrientationChange,
  offViewportChange as TgOffViewportChange, offActiveChange as TgOffActiveChange,
  offInvoiceClose as TgOffInvoiceClose, offPopupClosed as TgOffPopupClosed,
  offFlashModeChange as TgOffFlashModeChange,
  offAccelerometerChange as TgOffAccelerometerChange, offGyroscopeChange as TgOffGyroscopeChange,
  offDeviceOrientationChange as TgOffDeviceOrientationChange, offLocationUpdate as TgOffLocationUpdate,
} from '../telegram/miniApp';

// Нативные fallback-реализации
import {
  location as NativeLocation,
  accelerometer as NativeAccelerometer, gyroscope as NativeGyroscope, deviceOrientation as NativeDeviceOrientation,
  haptic as NativeHaptic,
  openQRScanner as NativeOpenQRScanner, closeQRScanner as NativeCloseQRScanner, isQRScannerSupported as NativeIsQRScannerSupported,
  requestContact as NativeRequestContact,
  setEmojiStatus as NativeSetEmojiStatus,
  getDeviceInfo as nativeGetDeviceInfo,
} from './device';

import {
  cloudStorage as NativeCloudStorage, secureStorage as NativeSecureStorage, sessionStorage as NativeSessionStorage,
} from './storage';

import {
  showPopup as NativeShowPopup, showAlert as NativeShowAlert, showConfirm as NativeShowConfirm,
} from './ui';

import { parseDeepLink, buildMiniAppLink, extractStartAppPayload } from '../telegram/deepLinks';

// ── Result type alias ───────────────────────────────────────────

type Result<T> = { ok: true; result: T } | { ok: false; error: string };

function wrapNativeResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn()
    .then((result) => ({ ok: true, result } as Result<T>))
    .catch((error: any) => ({ ok: false, error: error?.message || 'Unknown error' }));
}

// ── Detection ─────────────────────────────────────────────────────

function getTg(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = (window as any).Telegram?.WebApp;
    return raw && typeof raw.ready === 'function' ? raw : null;
  } catch {
    return null;
  }
}

function isTelegram(): boolean {
  if (typeof window === 'undefined') return false;
  const tg = getTg();
  return tg !== null;
}

// ── Lifecycle ─────────────────────────────────────────────────────

export function ready(): void { if (isTelegram()) tgReady(); }
export function expand(): void { if (isTelegram()) tgExpand(); }
export function close(): void { if (isTelegram()) tgClose(); }

export function getPlatform(): string { return isTelegram() ? tgGetPlatform() : 'web'; }
export function getVersion(): string | undefined { return isTelegram() ? tgGetVersion() : undefined; }
export function getColorScheme(): 'light' | 'dark' { return isTelegram() ? tgGetColorScheme() : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
export function getThemeParams(): TelegramThemeParams { return isTelegram() ? tgGetThemeParams() : {}; }
export function isDesktop(): boolean { return isTelegram() ? tgIsDesktop() : window.innerWidth >= 1024; }
export function isMobile(): boolean { return isTelegram() ? tgIsMobile() : window.innerWidth < 1024; }

// ── Theme ─────────────────────────────────────────────────────────

export function setHeaderColor(type: TelegramHeaderColorType): void {
  if (isTelegram()) tgSetHeaderColor(type);
}
export function setBackgroundColor(color: string): void {
  if (isTelegram()) tgSetBackgroundColor(color);
}
export function getColorSchemeColors(): { bg_color: string; button_color: string; button_text_color: string } {
  if (isTelegram()) {
    const res = tgGetColorSchemeColors();
    return res.ok ? res.result : { bg_color: '#ffffff', button_color: '#6c63ff', button_text_color: '#ffffff' };
  }
  return { bg_color: '#ffffff', button_color: '#6c63ff', button_text_color: '#ffffff' };
}

// ── Buttons ───────────────────────────────────────────────────────

export const MainButton = TgMainButton;
export const SecondaryButton = TgSecondaryButton;
export const SettingsButton = TgSettingsButton;
export const BackButton = TgBackButton;

export function onBackButtonClick(cb: () => void): void { TgBackButton.onClick(cb); }
export function offBackButtonClick(): void { TgBackButton.offClick(); }

// ── Dialogs ───────────────────────────────────────────────────────

export function showPopup(params: TelegramPopupParams): Promise<Result<string | undefined>> {
  return isTelegram()
    ? tgShowPopupImpl(params)
    : NativeShowPopup(params).then((r) => ({ ok: true, result: r.buttonId }));
}

export function showAlert(message: string): Promise<Result<boolean>> {
  return isTelegram()
    ? tgShowAlertImpl(message)
    : NativeShowAlert(message).then(() => ({ ok: true, result: true }));
}

export function showConfirm(message: string): Promise<Result<boolean>> {
  return isTelegram()
    ? tgShowConfirmImpl(message)
    : NativeShowConfirm(message).then((r) => ({ ok: true, result: r.ok }));
}

// ── Haptics ───────────────────────────────────────────────────────

export const haptic = isTelegram()
  ? {
      impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
        try { TgHaptic.impact(style); } catch {}
      },
      notification: (type: 'error' | 'success' | 'warning') => {
        try { TgHaptic.notification(type); } catch {}
      },
      selectionChanged: () => {
        try { TgHaptic.selectionChanged(); } catch {}
      },
    }
  : NativeHaptic;

// ── Storage (Result-based) ───────────────────────────────────────

export const cloudStorage = isTelegram()
  ? TgCloudStorage
  : {
      get: (keys: string[]): Promise<Result<Array<{ key: string; value: string }>>> => {
        return wrapNativeResult(() => NativeCloudStorage.get(keys));
      },
      getOne: (key: string): Promise<Result<string | null>> => {
        return wrapNativeResult(() => NativeCloudStorage.getOne(key));
      },
      set: (items: { key: string; value: string }[]): Promise<Result<void>> => {
        return wrapNativeResult(() => NativeCloudStorage.set(items));
      },
      delete: (keys: string[]): Promise<Result<void>> => {
        return wrapNativeResult(() => NativeCloudStorage.delete(keys));
      },
    };

export const secureStorage = isTelegram()
  ? TgSecureStorage
  : {
      get: (key: string): Promise<Result<string | null>> => {
        return wrapNativeResult(() => NativeSecureStorage.get(key));
      },
      set: (key: string, value: string): Promise<Result<void>> => {
        return wrapNativeResult(() => NativeSecureStorage.set(key, value));
      },
    };

export const sessionStorage = NativeSessionStorage;

// ── Device Storage (Telegram-only) ───────────────────────────────

export const deviceStorage = isTelegram() ? TgDeviceStorage : {
  get: async (key: string): Promise<Result<string | null>> => ({ ok: true, result: null }),
  set: async (): Promise<Result<void>> => ({ ok: true, result: undefined }),
  remove: async (): Promise<Result<void>> => ({ ok: true, result: undefined }),
  clear: async (): Promise<Result<void>> => ({ ok: true, result: undefined }),
};

// ── QR Scanner ────────────────────────────────────────────────────

export function openQRScanner(text?: string): Promise<Result<TelegramQRCodeText | null>> {
  return isTelegram()
    ? new Promise((resolve) => {
        TgOpenQRScanner(text, (data) => {
          resolve({ ok: true, result: data });
        });
      })
    : (async () => {
        const qr = await NativeOpenQRScanner();
        if (!qr) {
          return { ok: true, result: null };
        }
        return { ok: true, result: { data: qr.raw, text: qr.text } };
      })();
}

export function closeQRScanner(): void {
  if (isTelegram()) TgCloseQRScanner();
  else NativeCloseQRScanner();
}

export function isQRScannerSupported(): boolean {
  return isTelegram() ? true : NativeIsQRScannerSupported();
}

// ── Contacts ──────────────────────────────────────────────────────

export async function requestContact(): Promise<Result<TelegramContactPayload | null>> {
  if (isTelegram()) {
    return await TgRequestContact();
  }
  const native = await NativeRequestContact();
  if (!native) {
    return { ok: true, result: null };
  }
  return {
    ok: true,
    result: {
      phone_number: native.phoneNumber,
      first_name: native.firstName,
      last_name: native.lastName,
    },
  };
}

export function requestWriteAccess(): Promise<Result<boolean>> {
  return isTelegram()
    ? TgRequestWriteAccess()
    : Promise.resolve({ ok: true, result: true });
}

// ── Geolocation ──────────────────────────────────────────────────

export const location = {
  request: (opts?: { enableHighAccuracy?: boolean }): Promise<Result<TelegramLocation>> => {
    return isTelegram()
      ? TgGetLocation()
      : wrapNativeResult(() => NativeLocation.request(opts));
  },
  startUpdates: (cb: (loc: TelegramLocation) => void): void => {
    if (isTelegram()) {
      TgOnLocationUpdate(cb);
    } else {
      NativeLocation.startUpdates((loc) => cb(loc as TelegramLocation));
    }
  },
  stopUpdates: (): void => {
    if (isTelegram()) TgOffLocationUpdate();
    else NativeLocation.stopUpdates();
  },
};

export function getLocation(): Promise<Result<TelegramLocation>> {
  return isTelegram()
    ? TgGetLocation()
    : wrapNativeResult(() => NativeLocation.request());
}

export const locationManager = isTelegram()
  ? TgLocationManager
  : {
      request: async (opts?: { enableHighAccuracy?: boolean }) => {
        await NativeLocation.request(opts);
      },
      onUpdate: (cb: (loc: TelegramLocation) => void) => {
        NativeLocation.startUpdates((loc) => cb(loc as TelegramLocation));
      },
      offUpdate: () => {
        NativeLocation.stopUpdates();
      },
    };

// ── Sensors ──────────────────────────────────────────────────────

export const accelerometer = isTelegram()
  ? {
      start: (opts?: any) => { try { TgAccelerometer.start(opts); } catch {} },
      stop: () => { try { TgAccelerometer.stop(); } catch {} },
      on: (cb: any) => { try { TgAccelerometer.on(cb); } catch {} },
      off: () => { try { TgAccelerometer.off(); } catch {} },
      isSupported: () => NativeAccelerometer.isSupported(),
    }
  : NativeAccelerometer;

export const gyroscope = isTelegram()
  ? {
      start: (opts?: any) => { try { TgGyroscope.start(opts); } catch {} },
      stop: () => { try { TgGyroscope.stop(); } catch {} },
      on: (cb: any) => { try { TgGyroscope.on(cb); } catch {} },
      off: () => { try { TgGyroscope.off(); } catch {} },
      isSupported: () => NativeGyroscope.isSupported(),
    }
  : NativeGyroscope;

export const deviceOrientation = isTelegram()
  ? {
      start: () => { try { TgDeviceOrientation.start(); } catch {} },
      stop: () => { try { TgDeviceOrientation.stop(); } catch {} },
      on: (cb: any) => { try { TgDeviceOrientation.on(cb); } catch {} },
    }
  : NativeDeviceOrientation;

// ── Fullscreen & Orientation ─────────────────────────────────────

export function requestFullscreen(): Promise<void> {
  if (isTelegram()) {
    TgRequestFullscreen();
    return Promise.resolve();
  }
  return document.documentElement.requestFullscreen?.() ?? Promise.resolve();
}
export function exitFullscreen(): Promise<void> {
  if (isTelegram()) {
    TgExitFullscreen();
    return Promise.resolve();
  }
  return document.exitFullscreen?.() ?? Promise.resolve();
}
export function isFullscreen(): boolean {
  return isTelegram() ? TgIsFullscreen() : !!document.fullscreenElement;
}

export function lockOrientation(orientation: TelegramOrientationType): Promise<void> {
  if (isTelegram()) {
    TgLockOrientation(orientation);
    return Promise.resolve();
  }
  return Promise.resolve();
}
export function unlockOrientation(): Promise<void> {
  if (isTelegram()) {
    TgUnlockOrientation();
    return Promise.resolve();
  }
  return Promise.resolve();
}
export function isOrientationLocked(): boolean {
  return isTelegram() ? TgIsOrientationLocked() : false;
}

export function enableVerticalSwipes(): Promise<void> {
  if (isTelegram()) {
    TgEnableVerticalSwipes();
    return Promise.resolve();
  }
  return Promise.resolve();
}
export function disableVerticalSwipes(): Promise<void> {
  if (isTelegram()) {
    TgDisableVerticalSwipes();
    return Promise.resolve();
  }
  return Promise.resolve();
}
export function isVerticalSwipesEnabled(): boolean {
  return isTelegram() ? TgIsVerticalSwipesEnabled() : false;
}

// ── Viewport & Safe Area ─────────────────────────────────────────

export function getViewportHeight(): number {
  return isTelegram() ? TgGetViewportHeight() : window.innerHeight;
}
export function getViewportStableHeight(): number {
  return isTelegram() ? TgGetViewportStableHeight() : window.innerHeight;
}
export function getSafeArea(): TelegramSafeArea {
  return isTelegram() ? TgGetSafeArea() : { top: 0, left: 0, right: 0, bottom: 0 };
}
export function getContentSafeArea(): TelegramContentSafeArea {
  return isTelegram() ? TgGetContentSafeArea() : { top: 0, left: 0, right: 0, bottom: 0 };
}
export function isActive(): boolean {
  return isTelegram() ? TgIsActive() : true;
}

// ── Navigation & Sharing ─────────────────────────────────────────

export function switchInlineQuery(params: TelegramSwitchInlineQueryParams): void {
  if (isTelegram()) TgSwitchInlineQuery(params);
}
export function openLink(url: string, params?: TelegramOpenLinkParams): void {
  if (isTelegram()) TgOpenLink(url, params);
  else window.open(url, '_blank');
}
export function openTelegramLink(path: string): void {
  if (isTelegram()) TgOpenTelegramLink(path);
  else window.open(`https://t.me/${path}`, '_blank');
}
export function openInvoice(url: string): void {
  if (isTelegram()) TgOpenInvoice(url);
  else window.open(url, '_blank');
}
export function shareToStory(params: { media_url: string; text?: string; widget_link?: { url: string; name: string } }): void {
  if (isTelegram()) TgShareToStory(params);
}
export function shareMessage(params: TelegramShareMessageParams): Promise<Result<boolean>> {
  return isTelegram()
    ? TgShareMessage(params).then((res): Result<boolean> => {
        if (res.ok) return { ok: true, result: true };
        const e = (res as { ok: false; error: string }).error;
        return { ok: false, error: e };
      })
    : navigator.share
    ? navigator.share(params).then(
        () => ({ ok: true, result: true }),
        (e: any) => ({ ok: false, error: e?.message || 'Share failed' })
      )
    : Promise.resolve({ ok: false, error: 'share_not_supported' });
}
export function readTextFromClipboard(): Promise<Result<string>> {
  return isTelegram()
    ? TgReadTextFromClipboard()
    : wrapNativeResult(() => navigator.clipboard.readText());
}

// ── Emoji Status ─────────────────────────────────────────────────

export function showEmojiStatus(): void {
  if (isTelegram()) TgShowEmojiStatus();
}

export async function requestEmojiStatusAccess(): Promise<Result<boolean>> {
  return isTelegram() ? TgRequestEmojiStatusAccess() : { ok: true, result: true };
}

export function setEmojiStatus(status: TelegramEmojiStatus): Promise<Result<void>> {
  return isTelegram()
    ? TgSetEmojiStatus(status)
    : Promise.resolve({ ok: true, result: undefined });
}

// ── Request Chat ─────────────────────────────────────────────────

export function requestChat(params: { chat_id: number | string; message_text?: string }): Promise<Result<void>> {
  return isTelegram()
    ? TgRequestChat(params)
    : Promise.resolve({ ok: true, result: undefined });
}

// ── Flash Mode ───────────────────────────────────────────────────

export function getFlashMode(): 'on' | 'off' | 'auto' {
  return isTelegram() ? TgGetFlashMode() : 'off';
}
export function setFlashMode(mode: 'on' | 'off' | 'auto'): void {
  if (isTelegram()) TgSetFlashMode(mode);
}

// ── Additional API ───────────────────────────────────────────────────

export function setSwipeBehavior(behavior: 'none' | 'horizontal' | 'vertical'): void {
  if (isTelegram()) TgSetSwipeBehavior(behavior);
}

export function addToHomeScreen(): Promise<Result<void>> {
  return isTelegram()
    ? TgAddToHomeScreen()
    : Promise.resolve({ ok: false, error: 'add_to_home_screen_not_supported' });
}

export function checkHomeScreenStatus(): Promise<Result<string>> {
  return isTelegram()
    ? TgCheckHomeScreenStatus()
    : Promise.resolve({ ok: false, error: 'not_supported' });
}

export function hideKeyboard(): void {
  if (isTelegram()) TgHideKeyboard();
}

// ── Deprecated ────────────────────────────────────────────────────

/** @deprecated Use `ready()` + `expand()` separately */
export function init(): void {
  ready();
  expand();
}

// ── Events ────────────────────────────────────────────────────────

export function onFullscreenChange(cb: (isFullscreen: boolean) => void): void {
  if (isTelegram()) TgOnFullscreenChange(cb);
}
export function offFullscreenChange(): void {
  if (isTelegram()) TgOffFullscreenChange();
}
export function onOrientationChange(cb: (o: { width: number; height: number }) => void): void {
  if (isTelegram()) TgOnOrientationChange(cb);
}
export function offOrientationChange(): void {
  if (isTelegram()) TgOffOrientationChange();
}
export function onViewportChange(cb: (v: TelegramViewport) => void): void {
  if (isTelegram()) TgOnViewportChange(cb);
}
export function offViewportChange(): void {
  if (isTelegram()) TgOffViewportChange();
}
export function onActiveChange(cb: (isActive: boolean) => void): void {
  if (isTelegram()) TgOnActiveChange(cb);
}
export function offActiveChange(): void {
  if (isTelegram()) TgOffActiveChange();
}
export function onInvoiceClose(cb: (r: { status: string; slug?: string }) => void): void {
  if (isTelegram()) TgOnInvoiceClose(cb);
}
export function offInvoiceClose(): void {
  if (isTelegram()) TgOffInvoiceClose();
}
export function onPopupClosed(cb: (buttonId: string) => void): void {
  if (isTelegram()) TgOnPopupClosed(cb);
}
export function offPopupClosed(): void {
  if (isTelegram()) TgOffPopupClosed();
}
export function onFlashModeChange(cb: (mode: 'on' | 'off' | 'auto') => void): void {
  if (isTelegram()) TgOnFlashModeChange(cb);
}
export function offFlashModeChange(): void {
  if (isTelegram()) TgOffFlashModeChange();
}
export function onAccelerometerChange(cb: (d: TelegramAccelerometerData) => void): void {
  if (isTelegram()) TgOnAccelerometerChange(cb);
  else NativeAccelerometer.on(cb as any);
}
export function offAccelerometerChange(): void {
  if (isTelegram()) TgOffAccelerometerChange();
  else NativeAccelerometer.off();
}
export function onGyroscopeChange(cb: (d: TelegramGyroscopeData) => void): void {
  if (isTelegram()) TgOnGyroscopeChange(cb);
  else NativeGyroscope.on(cb as any);
}
export function offGyroscopeChange(): void {
  if (isTelegram()) TgOffGyroscopeChange();
  else NativeGyroscope.off();
}
export function onDeviceOrientationChange(cb: (d: TelegramDeviceOrientationData) => void): void {
  if (isTelegram()) TgOnDeviceOrientationChange(cb);
  else NativeDeviceOrientation.on(cb as any);
}
export function offDeviceOrientationChange(): void {
  if (isTelegram()) TgOffDeviceOrientationChange();
  else NativeDeviceOrientation.stop();
}
export function onLocationUpdate(cb: (loc: TelegramLocation) => void): void {
  if (isTelegram()) TgOnLocationUpdate(cb);
  else locationManager.onUpdate(cb);
}
export function offLocationUpdate(): void {
  if (isTelegram()) TgOffLocationUpdate();
  else locationManager.offUpdate();
}

// ── Biometric ────────────────────────────────────────────────────

export const biometric = isTelegram()
  ? TgBiometric
  : {
      check: async (): Promise<Result<{ available: boolean; type: string; access_requested: boolean }>> => {
        try {
          const hasAuth = 'credentials' in navigator && 'get' in navigator.credentials;
          return { ok: true, result: { available: hasAuth, type: 'unknown', access_requested: false } };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      },
      authenticate: async (params?: { reason?: string; finger_print?: string }): Promise<Result<{ token?: string }>> => {
        return { ok: false, error: 'not_implemented' };
      },
    };

export async function requestBiometricAccess(): Promise<Result<boolean>> {
  return isTelegram() ? TgRequestBiometricAccess() : { ok: true, result: true };
}

// ── Init Data ────────────────────────────────────────────────────

export function getInitData(): Record<string, unknown> | null {
  return isTelegram() ? (TgGetInitData() as Record<string, unknown> | null) : null;
}
export function getInitDataRaw(): string | undefined {
  return isTelegram() ? TgGetInitDataRaw() : undefined;
}

// ── sendData ─────────────────────────────────────────────────────

export function sendData(data: string | object): void {
  if (isTelegram()) TgSendData(data);
}

// ── Deep Link helpers ────────────────────────────────────────────

export { parseDeepLink, buildMiniAppLink, extractStartAppPayload };

// ── Backward-compatible deprecated names ─────────────────────────

/** @deprecated use `init` */
export const initTelegramMiniApp = () => { ready(); expand(); };
/** @deprecated use `showPopup` (уже unified) */
export const tgShowPopup = showPopup;
/** @deprecated use `showConfirm` (уже unified) */
export const tgShowConfirm = showConfirm;
/** @deprecated use `showAlert` (уже unified) */
export const tgShowAlert = showAlert;

// ── Device Info ──────────────────────────────────────────────────

export const getDeviceInfo = nativeGetDeviceInfo;

// ── File Operations ───────────────────────────────────────────────

export function downloadFile(fileId: string, secure = true): Promise<Result<string>> {
  return isTelegram()
    ? TgDownloadFile(fileId, secure)
    : Promise.resolve({ ok: false, error: 'download_not_supported_in_browser' });
}

export function shareFiles(files: TelegramAttachmentFile[]): Result<void> {
  if (isTelegram()) {
    TgShareFiles(files);
    return { ok: true, result: undefined };
  }
  return { ok: false, error: 'file_sharing_not_supported_in_browser' };
}
