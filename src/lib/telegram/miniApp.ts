/**
 * Telegram Mini App — Core API Wrapper
 *
 * Единый интерфейс для вызовов Telegram Mini App API (Bot API 9.6–10.0).
 * Все методы возвращают Result-тип: { ok: true; result } | { ok: false; error }.
 */

export {
  TelegramThemeParams, TelegramColorScheme, TelegramBiometricStatus,
  TelegramBiometricAuthenticateParams, TelegramBiometricToken,
  TelegramCloudStorageItem, TelegramLocation, TelegramAccelerometerData,
  TelegramGyroscopeData, TelegramDeviceOrientationData, TelegramQRCodeText,
  TelegramPopupParams, TelegramChatRequest, TelegramEmojiStatus,
  TelegramAttachmentFile, TelegramSafeArea, TelegramContactPayload,
  TelegramSwipeBehavior, TelegramHeaderColorType, TelegramPopupButton,
  TelegramMainButtonParams, TelegramSettingsButtonParams,
  TelegramBackButtonParams, TelegramInitData, TelegramInitDataUnsafe,
  TelegramSecondaryButtonParams, TelegramOrientationType, TelegramViewport,
  TelegramContentSafeArea, TelegramSwitchInlineQueryParams, TelegramOpenLinkParams,
  TelegramShareMessageParams, TelegramShareStoryParams,
} from './types';

import type {
  TelegramThemeParams, TelegramColorScheme, TelegramBiometricStatus,
  TelegramBiometricAuthenticateParams, TelegramBiometricToken,
  TelegramCloudStorageItem, TelegramLocation, TelegramAccelerometerData,
  TelegramGyroscopeData, TelegramDeviceOrientationData, TelegramQRCodeText,
  TelegramPopupParams, TelegramChatRequest, TelegramEmojiStatus,
  TelegramAttachmentFile, TelegramSafeArea, TelegramContactPayload,
  TelegramSwipeBehavior, TelegramHeaderColorType, TelegramPopupButton,
  TelegramMainButtonParams, TelegramSettingsButtonParams,
  TelegramBackButtonParams, TelegramInitData, TelegramInitDataUnsafe,
  TelegramSecondaryButtonParams, TelegramOrientationType, TelegramViewport,
  TelegramContentSafeArea, TelegramSwitchInlineQueryParams, TelegramOpenLinkParams,
  TelegramShareMessageParams, TelegramShareStoryParams,
} from './types';

type Result<T> = { ok: true; result: T } | { ok: false; error: string };

// ── Bridge ──────────────────────────────────────────────

function tg(): Telegram.WebApp | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = (window as any).Telegram?.WebApp;
    return raw && typeof raw.ready === 'function' ? (raw as Telegram.WebApp) : null;
  } catch { return null; }
}

function wrap<T>(fn: () => T): Result<T> {
  try { return { ok: true, result: fn() }; }
  catch (e: any) { return { ok: false, error: e.message || 'Unknown error' }; }
}

async function asyncWrap<T>(fn: (ok: (v: T) => void, err: (e: string) => void) => void): Promise<Result<T>> {
  return new Promise((resolve) => {
    fn(
      (v) => resolve({ ok: true, result: v }),
      (e) => resolve({ ok: false, error: e })
    );
  }).catch((e: any) => ({ ok: false, error: e.message }));
}

// ── Lifecycle ───────────────────────────────────────────

export function ready() { tg()?.ready(); }
export function expand() { tg()?.expand?.(); }
export function close() { tg()?.close?.(); }
export function getPlatform() { return tg()?.platform || 'unknown'; }
export function getVersion() { return tg()?.version; }
export function getColorScheme() { return tg()?.colorScheme || 'light'; }
export function getThemeParams() { return tg()?.themeParams || {}; }
export function isDesktop() { return ['tdesktop','weba','web'].includes(getPlatform()); }
export function isMobile() { return ['ios','android','macos','ipad'].includes(getPlatform()); }

// ── Navigation ──────────────────────────────────────────

export function setHeaderColor(type: TelegramHeaderColorType) { return wrap(() => tg()?.setHeaderColor(type)); }
export function setBackgroundColor(color: string) { return wrap(() => tg()?.setBackgroundColor(color)); }
export function getColorSchemeColors(): Result<TelegramColorScheme> {
  return wrap(() => {
    const t = tg()?.themeParams || {};
    return { bg_color: t.bg_color||'#fff', button_color: t.button_color||'#2481cc', button_text_color: t.button_text_color||'#fff' };
  });
}

// ── Bottom Buttons ──────────────────────────────────────

export const MainButton = {
  show: () => tg()?.MainButton.show(),
  hide: () => tg()?.MainButton.hide(),
  setText: (text: string) => tg()?.MainButton.setText(text),
  setParams: (p: TelegramMainButtonParams) => wrap(() => tg()?.MainButton.setParams(p)),
  onClick: (cb: () => void) => tg()?.MainButton.onClick(cb),
  offClick: () => tg()?.MainButton.offClick(),
};

export const SecondaryButton = {
  show: () => tg()?.SecondaryButton?.show(),
  hide: () => tg()?.SecondaryButton?.hide(),
  setText: (text: string) => tg()?.SecondaryButton?.setText(text),
  setParams: (p: TelegramSecondaryButtonParams) => wrap(() => tg()?.SecondaryButton?.setParams(p)),
  onClick: (cb: () => void) => tg()?.SecondaryButton?.onClick(cb),
  offClick: () => tg()?.SecondaryButton?.offClick(),
};

export const SettingsButton = {
  show: () => tg()?.SettingsButton.show(),
  hide: () => tg()?.SettingsButton.hide(),
  setParams: (p: TelegramSettingsButtonParams) => wrap(() => tg()?.SettingsButton.setParams(p)),
  onClick: (cb: () => void) => tg()?.SettingsButton.onClick(cb),
};

export const BackButton = {
  show: () => tg()?.BackButton.show(),
  hide: () => tg()?.BackButton.hide(),
  onClick: (cb: () => void) => { tg()?.BackButton.onClick(cb); },
  offClick: () => { tg()?.BackButton.offClick(); },
};

// ── Fullscreen ───────────────────────────────────────────────

export function requestFullscreen(): Result<void> {
  return wrap(() => tg()?.requestFullscreen?.());
}

export function exitFullscreen(): Result<void> {
  return wrap(() => tg()?.exitFullscreen?.());
}

export function isFullscreen(): boolean {
  return tg()?.isFullscreen ?? false;
}

// ── Orientation ──────────────────────────────────────────────

export function lockOrientation(orientation: TelegramOrientationType): Result<void> {
  return wrap(() => tg()?.lockOrientation?.(orientation));
}

export function unlockOrientation(): Result<void> {
  return wrap(() => tg()?.unlockOrientation?.());
}

export function isOrientationLocked(): boolean {
  return tg()?.isOrientationLocked ?? false;
}

// ── Vertical Swipes ───────────────────────────────────────────

export function enableVerticalSwipes(): Result<void> {
  return wrap(() => tg()?.enableVerticalSwipes?.());
}

export function disableVerticalSwipes(): Result<void> {
  return wrap(() => tg()?.disableVerticalSwipes?.());
}

export function isVerticalSwipesEnabled(): boolean {
  return tg()?.isVerticalSwipesEnabled ?? false;
}

// ── Viewport ─────────────────────────────────────────────────

export function getViewportHeight(): number {
  return tg()?.viewportHeight ?? window.innerHeight;
}

export function getViewportStableHeight(): number {
  return tg()?.viewportStableHeight ?? window.innerHeight;
}

// ── Safe Area ─────────────────────────────────────────────────

export function getSafeArea(): TelegramSafeArea {
  return tg()?.safeAreaInset ?? { top: 0, left: 0, right: 0, bottom: 0 };
}

export function getContentSafeArea(): TelegramContentSafeArea {
  return tg()?.contentSafeAreaInset ?? { top: 0, left: 0, right: 0, bottom: 0 };
}

// ── isActive ──────────────────────────────────────────────────

export function isActive(): boolean {
  return tg()?.isActive ?? true;
}

// ── Popup Dialogs ───────────────────────────────────────

export function showPopup(params: TelegramPopupParams): Promise<Result<string | undefined>> {
  return asyncWrap<string | undefined>((ok, err) => {
    tg()?.showPopup(params, (id?: string) => ok(id), () => {});
  });
}

export function showAlert(message: string): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => { tg()?.showAlert(message, (v: boolean) => ok(v)); });
}

export function showConfirm(message: string): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => { tg()?.showConfirm(message, (v: boolean) => ok(v)); });
}

// ── Haptics ─────────────────────────────────────────────

export const haptic = {
  impact: (style: 'light'|'medium'|'heavy'|'rigid'|'soft') => wrap(() => tg()?.HapticFeedback.impactOccurred(style)),
  notification: (type: 'error'|'success'|'warning') => wrap(() => tg()?.HapticFeedback.notificationOccurred(type)),
  selectionChanged: () => wrap(() => tg()?.HapticFeedback.selectionChanged()),
};

// ── Cloud & Secure Storage ──────────────────────────────

export const cloudStorage = {
  get: (keys: string[]) => asyncWrap<TelegramCloudStorageItem[]>((ok, err) => {
    tg()?.cloudStorage.get(keys, (e, r) => e ? err(e) : ok(r||[]));
  }),
  getOne: async (key: string) => { const r = await cloudStorage.get([key]); return r.ok ? {ok:true, result: r.result[0]?.value??null} : r; },
  set: (items: TelegramCloudStorageItem[]) => asyncWrap<void>((ok, err) => {
    tg()?.cloudStorage.set(items, (e) => e ? err(e) : ok(undefined));
  }),
  delete: (keys: string[]) => asyncWrap<void>((ok, err) => {
    tg()?.cloudStorage.delete(keys, (e) => e ? err(e) : ok(undefined));
  }),
};

export const secureStorage = {
  get: (key: string) => asyncWrap<string | null>((ok, err) => {
    tg()?.secureStorage.get(key, (e, v) => e ? err(e) : ok(v ?? null));
  }),
  set: (key: string, value: string) => asyncWrap<void>((ok, err) => {
    tg()?.secureStorage.set(key, value, (e) => e ? err(e) : ok(undefined));
  }),
};

// ── Biometric ───────────────────────────────────────────

export const biometric = {
  check: () => asyncWrap<TelegramBiometricStatus>((ok) => { tg()?.biometricManager.isAvailable(ok); }),
  authenticate: (params?: TelegramBiometricAuthenticateParams) => asyncWrap<TelegramBiometricToken>(
    (ok, err) => { tg()?.biometricManager.authenticate({reason:params?.reason, fingerprint:params?.finger_print}, ok, err); }
  ),
};

export function requestBiometricAccess(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.biometricManager.requestAccess?.((granted) => ok(granted));
  });
}

// ── QR Scanner ──────────────────────────────────────────

export function openQRScanner(text?: string, callback?: (data: TelegramQRCodeText) => void): Result<void> {
  return wrap(() => {
    if (callback && tg()?.showScanQrPopup) {
      tg()?.showScanQrPopup({ text }, callback);
    } else {
      tg()?.showScanQrPopup({ text }, () => {});
    }
  });
}
export function closeQRScanner(): Result<void> { return wrap(() => tg()?.closeScanQrPopup()); }

// ── Switch Inline Query ─────────────────────────────────────

export function switchInlineQuery(params: TelegramSwitchInlineQueryParams): Result<void> {
  return wrap(() => tg()?.switchInlineQuery?.(params.query, params.chat_types));
}

// ── Open Link ─────────────────────────────────────────────────

export function openLink(url: string, params?: TelegramOpenLinkParams): Result<void> {
  return wrap(() => {
    if (params) {
      tg()?.openLink?.(url, params);
    } else {
      tg()?.openLink?.(url);
    }
  });
}

export function openTelegramLink(path: string): Result<void> {
  return wrap(() => tg()?.openTelegramLink?.(path));
}

// ── Invoice ──────────────────────────────────────────────────

export function openInvoice(url: string, callback?: (result: { status: string; slug?: string }) => void): Result<void> {
  return wrap(() => {
    if (callback) {
      tg()?.openInvoice?.(url, callback);
    } else {
      tg()?.openInvoice?.(url, () => {});
    }
  });
}

// ── Share Story ───────────────────────────────────────────────

export function shareToStory(params: TelegramShareStoryParams): Result<void> {
  return wrap(() => tg()?.shareToStory?.(params.media_url, {
    text: params.text,
    widget_link: params.widget_link ? {
      url: params.widget_link.url,
      name: params.widget_link.name,
    } : undefined,
  }));
}

// ── Share Message ─────────────────────────────────────────────

export function shareMessage(params: TelegramShareMessageParams): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.shareMessage?.(params.text, ({ status }) => {
      if (status === 'sent') ok();
      else err(status);
    });
  });
}

// ── Read Text from Clipboard ──────────────────────────────────

export function readTextFromClipboard(): Promise<Result<string>> {
  return asyncWrap<string>((ok, err) => {
    tg()?.readTextFromClipboard?.((data) => ok(data ?? ''), err);
  });
}

// ── Emoji Status ───────────────────────────────────────────────

export function requestEmojiStatusAccess(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.requestEmojiStatusAccess?.((granted) => ok(granted));
  });
}

export function setEmojiStatus(status: TelegramEmojiStatus): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.setEmojiStatus?.(status, ({ ok: success, error }) => {
      if (success) ok();
      else err(error ?? 'Failed to set emoji status');
    });
  });
}

// ── Swipe ───────────────────────────────────────────────

export function setSwipeBehavior(b: TelegramSwipeBehavior) { tg()?.setSwipeBehavior(b); }

// ── Hide Keyboard ─────────────────────────────────────────────

export function hideKeyboard(): Result<void> {
  return wrap(() => tg()?.hideKeyboard?.());
}

// ── Home Screen ───────────────────────────────────────────────

export function addToHomeScreen(): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.addToHomeScreen(({ status }) => status === 'completed' ? ok(undefined) : err(status));
  });
}
export function checkHomeScreenStatus(): Promise<Result<string>> {
  return asyncWrap<string>((ok) => { tg()?.checkHomeScreenStatus(({ status }) => ok(status)); });
}

// ── Request Chat ────────────────────────────────────────

export function requestChat(params: TelegramChatRequest): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.requestChat(params, ({ status }) => status === 'sent' ? ok(undefined) : err(status));
  });
}

// ── File Download ───────────────────────────────────────

export function downloadFile(fileId: string, sec = true): Promise<Result<string>> {
  return asyncWrap<string>((ok, err) => {
    tg()?.downloadFile(fileId, { sec }, (status, data) => status === 'cancelled' ? err(status) : ok(data||''));
  });
}

// ── Location ────────────────────────────────────────────

export function getLocation(): Promise<Result<TelegramLocation>> {
  return asyncWrap<TelegramLocation>((ok) => { tg()?.getLocation(ok); });
}

// ── Sensors ─────────────────────────────────────────────

export const accelerometer = {
  start: (opts?: { sensitivity?: 'low'|'medium'|'high' }) => wrap(() => tg()?.accelerometer.start(opts)),
  stop: () => wrap(() => tg()?.accelerometer.stop()),
  on: (cb: (d: TelegramAccelerometerData) => void) => { tg()?.accelerometer.onCurrent(cb); },
  off: () => { tg()?.accelerometer.offCurrent(); },
};

export const gyroscope = {
  start: (opts?: { sensitivity?: 'low'|'medium'|'high' }) => wrap(() => tg()?.gyroscope.start(opts)),
  stop: () => wrap(() => tg()?.gyroscope.stop()),
  on: (cb: (d: TelegramGyroscopeData) => void) => { tg()?.gyroscope.onCurrent(cb); },
  off: () => { tg()?.gyroscope.offCurrent(); },
};

export const deviceOrientation = {
  start: () => wrap(() => tg()?.deviceOrientation.start()),
  stop: () => wrap(() => tg()?.deviceOrientation.stop()),
  on: (cb: (d: TelegramDeviceOrientationData) => void) => { tg()?.deviceOrientation.onCurrent(cb); },
};

// ── Location Manager ────────────────────────────────────

export const locationManager = {
  request: (opts?: { enableHighAccuracy?: boolean }) => asyncWrap<void>((ok, err) => {
    tg()?.locationManager.request(opts??{}, ({ status }) => status === 'granted' ? ok(undefined) : err(status));
  }),
  onUpdate: (cb: (loc: TelegramLocation) => void) => { tg()?.locationManager.onLocationUpdated(cb); },
  offUpdate: () => { tg()?.locationManager.offLocationUpdated(); },
};

// ── Init Data ───────────────────────────────────────────

export function getInitData(): TelegramInitDataUnsafe | null { return tg()?.initDataUnsafe ?? null; }
export function getInitDataRaw(): string | undefined { return tg()?.initData; }

// ── Emoji Status ────────────────────────────────────────

export function showEmojiStatus() { tg()?.showEmojiStatus(); }

// ── Request Contact ─────────────────────────────────────

export function requestContact(): Promise<Result<TelegramContactPayload>> {
  return asyncWrap<TelegramContactPayload>((ok, err) => {
    tg()?.requestContact((granted, contact) => granted ? ok(contact!) : err('User denied'));
  });
}

// ── Write Access ────────────────────────────────────────

export function requestWriteAccess(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => { tg()?.requestWriteAccess(ok); });
}

// ── File Sharing ────────────────────────────────────────

export function shareFiles(files: TelegramAttachmentFile[]): Result<void> {
  return wrap(() => tg()?.sendData(JSON.stringify(files)));
}

// ── Bio Check ───────────────────────────────────────────

export function showBioCheckPopup(params: { text?: string; username?: string; bio?: string; photo_url?: string }, cb: (r: any) => void) {
  // @ts-expect-error — newer API may not be typed yet
  tg()?.showBioCheckPopup?.(params, cb);
}

// ── Event Subscriptions ─────────────────────────────────────

const eventHandlers: Record<string, ((...args: any[]) => void)[]> = {};

export function onFullscreenChange(cb: (isFullscreen: boolean) => void): void {
  const handler = (value: boolean) => cb(value);
  eventHandlers.fullscreen = eventHandlers.fullscreen || [];
  eventHandlers.fullscreen.push(handler);
  tg()?.onEvent?.('fullscreenChanged', handler);
}

export function offFullscreenChange(cb?: (isFullscreen: boolean) => void): void {
  if (cb && eventHandlers.fullscreen) {
    eventHandlers.fullscreen = eventHandlers.fullscreen.filter(h => h !== cb);
  }
  tg()?.offEvent?.('fullscreenChanged');
}

export function onOrientationChange(cb: (orientation: { width: number; height: number }) => void): void {
  const handler = (data: { width: number; height: number }) => cb(data);
  eventHandlers.orientation = eventHandlers.orientation || [];
  eventHandlers.orientation.push(handler);
  tg()?.onEvent?.('orientationChanged', handler);
}

export function offOrientationChange(cb?: (orientation: { width: number; height: number }) => void): void {
  if (cb && eventHandlers.orientation) {
    eventHandlers.orientation = eventHandlers.orientation.filter(h => h !== cb);
  }
  tg()?.offEvent?.('orientationChanged');
}

export function onViewportChange(cb: (viewport: TelegramViewport) => void): void {
  const handler = (data: TelegramViewport) => cb(data);
  eventHandlers.viewport = eventHandlers.viewport || [];
  eventHandlers.viewport.push(handler);
  tg()?.onEvent?.('viewportChanged', handler);
}

export function offViewportChange(cb?: (viewport: TelegramViewport) => void): void {
  if (cb && eventHandlers.viewport) {
    eventHandlers.viewport = eventHandlers.viewport.filter(h => h !== cb);
  }
  tg()?.offEvent?.('viewportChanged');
}

export function onActiveChange(cb: (isActive: boolean) => void): void {
  const handler = (value: boolean) => cb(value);
  eventHandlers.active = eventHandlers.active || [];
  eventHandlers.active.push(handler);
  tg()?.onEvent?.('activeChanged', handler);
}

export function offActiveChange(cb?: (isActive: boolean) => void): void {
  if (cb && eventHandlers.active) {
    eventHandlers.active = eventHandlers.active.filter(h => h !== cb);
  }
  tg()?.offEvent?.('activeChanged');
}

export function onInvoiceClose(cb: (result: { status: string; slug?: string }) => void): void {
  tg()?.onEvent?.('invoiceClosed', cb);
}

export function offInvoiceClose(): void {
  tg()?.offEvent?.('invoiceClosed');
}

export function onPopupClosed(cb: (buttonId: string) => void): void {
  tg()?.onEvent?.('popupClosed', cb);
}

export function offPopupClosed(): void {
  tg()?.offEvent?.('popupClosed');
}

// ── Flash Mode ─────────────────────────────────────────────

export function getFlashMode(): 'on' | 'off' | 'auto' {
  return tg()?.flashMode ?? 'off';
}

export function setFlashMode(mode: 'on' | 'off' | 'auto'): Result<void> {
  return wrap(() => tg()?.setFlashMode?.(mode));
}

export function onFlashModeChange(cb: (mode: 'on' | 'off' | 'auto') => void): void {
  tg()?.onEvent?.('flashModeChanged', cb);
}

export function offFlashModeChange(): void {
  tg()?.offEvent?.('flashModeChanged');
}

// ── Emoji Status Events ─────────────────────────────────────

export function offEmojiStatus(): Result<void> {
  return wrap(() => tg()?.offEmojiStatus?.());
}

// ── Sensor Events ───────────────────────────────────────────

export function onAccelerometerChange(cb: (data: TelegramAccelerometerData) => void): void {
  tg()?.accelerometer.onChange?.(cb);
}

export function offAccelerometerChange(): void {
  tg()?.accelerometer.offChange?.();
}

export function onGyroscopeChange(cb: (data: TelegramGyroscopeData) => void): void {
  tg()?.gyroscope.onChange?.(cb);
}

export function offGyroscopeChange(): void {
  tg()?.gyroscope.offChange?.();
}

export function onDeviceOrientationChange(cb: (data: TelegramDeviceOrientationData) => void): void {
  tg()?.deviceOrientation.onChange?.(cb);
}

export function offDeviceOrientationChange(): void {
  tg()?.deviceOrientation.offChange?.();
}

// ── Accelerometer/Gyroscope Permission ──────────────────────

export function requestAccelerometer(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.accelerometer.requestPermission?.((granted) => ok(granted));
  });
}

export function requestGyroscope(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.gyroscope.requestPermission?.((granted) => ok(granted));
  });
}

// ── Location Updates ────────────────────────────────────────

export function onLocationUpdate(cb: (loc: TelegramLocation) => void): void {
  tg()?.onEvent?.('locationChanged', cb);
}

export function offLocationUpdate(): void {
  tg()?.offEvent?.('locationChanged');
}

// ── Init ────────────────────────────────────────────────

export function initTelegramMiniApp() {
  ready();
  expand();
}

// ── Device Storage ──────────────────────────────────────────

export const deviceStorage = {
  get: (key: string) => asyncWrap<string | null>((ok, err) => {
    tg()?.deviceStorage?.get(key, (e, v) => e ? err(e) : ok(v ?? null));
  }),
  set: (key: string, value: string) => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.set(key, value, (e) => e ? err(e) : ok(undefined));
  }),
  remove: (key: string) => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.remove(key, (e) => e ? err(e) : ok(undefined));
  }),
  clear: () => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.clear((e) => e ? err(e) : ok(undefined));
  }),
};

// ── Send Data (for keyboard-button Mini Apps) ─────────────

export function sendData(data: string | object): Result<void> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return wrap(() => tg()?.sendData(payload));
}