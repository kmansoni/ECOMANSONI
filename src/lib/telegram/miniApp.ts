/**
 * Telegram Mini App — Core API Wrapper
 *
 * Единый интерфейс для вызовов Telegram Mini App API (Bot API 9.6–10.0).
 * Все методы возвращают Result-тип: { ok: true; result } | { ok: false; error }.
 */

export type {
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

function tg(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = (window as any).Telegram?.WebApp;
    return raw && typeof raw.ready === 'function' ? raw : null;
  } catch { return null; }
}

function wrap<T>(fn: () => T): Result<T> {
  try { return { ok: true, result: fn() }; }
  catch (e: any) { return { ok: false, error: e.message || 'Unknown error' }; }
}

function safeCall(fn: () => void): void {
  try { fn(); } catch {}
}

async function asyncWrap<T>(fn: (ok: (v: T) => void, err: (e: string) => void) => void): Promise<Result<T>> {
  return new Promise<Result<T>>((resolve) => {
    fn(
      (v) => resolve({ ok: true, result: v } as Result<T>),
      (e) => resolve({ ok: false, error: e } as Result<T>)
    );
  }).catch((e: any) => ({ ok: false, error: String(e) } as Result<T>));
}

// ── Lifecycle ───────────────────────────────────────────

export function ready() { safeCall(() => { tg()?.ready(); }); }
export function expand() { safeCall(() => { tg()?.expand?.(); }); }
export function close() { safeCall(() => { tg()?.close?.(); }); }
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
  show: () => safeCall(() => { tg()?.MainButton.show(); }),
  hide: () => safeCall(() => { tg()?.MainButton.hide(); }),
  setText: (text: string) => safeCall(() => { tg()?.MainButton.setText(text); }),
  setParams: (p: TelegramMainButtonParams) => wrap(() => tg()?.MainButton.setParams(p)),
  onClick: (cb: () => void) => safeCall(() => { tg()?.MainButton.onClick(cb); }),
  offClick: () => safeCall(() => { tg()?.MainButton.offClick(); }),
};

export const SecondaryButton = {
  show: () => safeCall(() => { tg()?.SecondaryButton?.show(); }),
  hide: () => safeCall(() => { tg()?.SecondaryButton?.hide(); }),
  setText: (text: string) => safeCall(() => { tg()?.SecondaryButton?.setText(text); }),
  setParams: (p: TelegramSecondaryButtonParams) => wrap(() => tg()?.SecondaryButton?.setParams(p)),
  onClick: (cb: () => void) => safeCall(() => { tg()?.SecondaryButton?.onClick(cb); }),
  offClick: () => safeCall(() => { tg()?.SecondaryButton?.offClick(); }),
};

export const SettingsButton = {
  show: () => safeCall(() => { tg()?.SettingsButton.show(); }),
  hide: () => safeCall(() => { tg()?.SettingsButton.hide(); }),
  setParams: (p: TelegramSettingsButtonParams) => wrap(() => tg()?.SettingsButton.setParams(p)),
  onClick: (cb: () => void) => safeCall(() => { tg()?.SettingsButton.onClick(cb); }),
};

export const BackButton = {
  show: () => safeCall(() => { tg()?.BackButton.show(); }),
  hide: () => safeCall(() => { tg()?.BackButton.hide(); }),
  onClick: (cb: () => void) => { safeCall(() => { tg()?.BackButton.onClick(cb); }); },
  offClick: () => { safeCall(() => { tg()?.BackButton.offClick(); }); },
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
    tg()?.cloudStorage.get(keys, (e: any, r: any) => e ? err(String(e)) : ok(r || []));
  }),
  getOne: async (key: string) => {
    const r = await cloudStorage.get([key]);
    return r.ok ? { ok: true, result: r.result[0]?.value ?? null } : r;
  },
  set: (items: TelegramCloudStorageItem[]) => asyncWrap<void>((ok, err) => {
    tg()?.cloudStorage.set(items, (e: any) => e ? err(String(e)) : ok(undefined));
  }),
  delete: (keys: string[]) => asyncWrap<void>((ok, err) => {
    tg()?.cloudStorage.delete(keys, (e: any) => e ? err(String(e)) : ok(undefined));
  }),
};

export const secureStorage = {
  get: (key: string) => asyncWrap<string | null>((ok, err) => {
    tg()?.secureStorage.get(key, (e: any, v: any) => e ? err(String(e)) : ok(v ?? null));
  }),
  set: (key: string, value: string) => asyncWrap<void>((ok, err) => {
    tg()?.secureStorage.set(key, value, (e: any) => e ? err(String(e)) : ok(undefined));
  }),
};

// ── Biometric ───────────────────────────────────────────

export const biometric = {
  check: () => asyncWrap<TelegramBiometricStatus>((ok) => {
    tg()?.biometricManager.isAvailable((status: any) => ok(status));
  }),
  authenticate: (params?: TelegramBiometricAuthenticateParams) => asyncWrap<TelegramBiometricToken>(
    (ok, err) => {
      tg()?.biometricManager.authenticate(
        { reason: params?.reason, fingerprint: params?.finger_print },
        (token: any) => ok(token),
        (error: any) => err(String(error))
      );
    }
  ),
};

export function requestBiometricAccess(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.biometricManager.requestAccess?.((granted: any) => ok(!!granted));
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
    tg()?.shareMessage?.(params.text, (result: { status: string }) => {
      if (result.status === 'sent') ok();
      else err(result.status);
    });
  });
}

// ── Read Text from Clipboard ──────────────────────────────────

export function readTextFromClipboard(): Promise<Result<string>> {
  return asyncWrap<string>((ok, err) => {
    tg()?.readTextFromClipboard?.((data: string | null) => ok(data ?? ''), err);
  });
}

// ── Emoji Status ───────────────────────────────────────────────

export function requestEmojiStatusAccess(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.requestEmojiStatusAccess?.((granted: any) => ok(!!granted));
  });
}

export function setEmojiStatus(status: TelegramEmojiStatus): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.setEmojiStatus?.(status, (result: { ok: boolean; error?: string }) => {
      if (result.ok) ok();
      else err(result.error ?? 'Failed to set emoji status');
    });
  });
}

// ── Swipe ───────────────────────────────────────────────

export function setSwipeBehavior(b: TelegramSwipeBehavior) { safeCall(() => { tg()?.setSwipeBehavior(b); }); }

// ── Hide Keyboard ─────────────────────────────────────────────

export function hideKeyboard(): Result<void> {
  return wrap(() => tg()?.hideKeyboard?.());
}

// ── Home Screen ───────────────────────────────────────────────

export function addToHomeScreen(): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.addToHomeScreen((result: { status: string }) => result.status === 'completed' ? ok(undefined) : err(result.status));
  });
}
export function checkHomeScreenStatus(): Promise<Result<string>> {
  return asyncWrap<string>((ok) => {
    tg()?.checkHomeScreenStatus((result: { status: string }) => ok(result.status));
  });
}

// ── Request Chat ────────────────────────────────────────

export function requestChat(params: TelegramChatRequest): Promise<Result<void>> {
  return asyncWrap<void>((ok, err) => {
    tg()?.requestChat(params, (result: { status: string }) => result.status === 'sent' ? ok(undefined) : err(result.status));
  });
}

// ── File Download ───────────────────────────────────────

export function downloadFile(fileId: string, sec = true): Promise<Result<string>> {
  return asyncWrap<string>((ok, err) => {
    tg()?.downloadFile(fileId, { sec }, (status: string, data?: string) => status === 'cancelled' ? err(status) : ok(data || ''));
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
  on: (cb: (d: TelegramAccelerometerData) => void) => {
    if (sensorCurrentSubscribers.accelerometer.includes(cb)) {
      return;
    }

    sensorCurrentSubscribers.accelerometer.push(cb);
    if (sensorCurrentSubscribers.accelerometer.length === 1) {
      safeCall(() => { tg()?.accelerometer.onCurrent?.(emitAccelerometerCurrent); });
    }
  },
  off: () => {
    if (!sensorCurrentSubscribers.accelerometer.length) {
      return;
    }

    sensorCurrentSubscribers.accelerometer = [];
    safeCall(() => { tg()?.accelerometer.offCurrent?.(); });
  },
};

export const gyroscope = {
  start: (opts?: { sensitivity?: 'low'|'medium'|'high' }) => wrap(() => tg()?.gyroscope.start(opts)),
  stop: () => wrap(() => tg()?.gyroscope.stop()),
  on: (cb: (d: TelegramGyroscopeData) => void) => {
    if (sensorCurrentSubscribers.gyroscope.includes(cb)) {
      return;
    }

    sensorCurrentSubscribers.gyroscope.push(cb);
    if (sensorCurrentSubscribers.gyroscope.length === 1) {
      safeCall(() => { tg()?.gyroscope.onCurrent?.(emitGyroscopeCurrent); });
    }
  },
  off: () => {
    if (!sensorCurrentSubscribers.gyroscope.length) {
      return;
    }

    sensorCurrentSubscribers.gyroscope = [];
    safeCall(() => { tg()?.gyroscope.offCurrent?.(); });
  },
};

export const deviceOrientation = {
  start: () => wrap(() => tg()?.deviceOrientation.start()),
  stop: () => wrap(() => tg()?.deviceOrientation.stop()),
  on: (cb: (d: TelegramDeviceOrientationData) => void) => {
    if (sensorCurrentSubscribers.deviceOrientation.includes(cb)) {
      return;
    }

    sensorCurrentSubscribers.deviceOrientation.push(cb);
    if (sensorCurrentSubscribers.deviceOrientation.length === 1) {
      safeCall(() => { tg()?.deviceOrientation.onCurrent?.(emitDeviceOrientationCurrent); });
    }
  },
  off: () => {
    if (!sensorCurrentSubscribers.deviceOrientation.length) {
      return;
    }

    sensorCurrentSubscribers.deviceOrientation = [];
    safeCall(() => { tg()?.deviceOrientation.offCurrent?.(); });
  },
};

// ── Location Manager ────────────────────────────────────

export const locationManager = {
  request: (opts?: { enableHighAccuracy?: boolean }) => asyncWrap<void>((ok, err) => {
    tg()?.locationManager.request(opts ?? {}, (result: { status: string }) => result.status === 'granted' ? ok(undefined) : err(result.status));
  }),
  onUpdate: (cb: (loc: TelegramLocation) => void) => {
    if (locationManagerSubscribers.includes(cb)) {
      return;
    }

    locationManagerSubscribers.push(cb);
    if (locationManagerSubscribers.length === 1) {
      safeCall(() => { tg()?.locationManager.onLocationUpdated(emitLocationManagerUpdate); });
    }
  },
  offUpdate: (cb?: (loc: TelegramLocation) => void) => {
    if (!locationManagerSubscribers.length) {
      return;
    }

    if (!cb) {
      locationManagerSubscribers = [];
      safeCall(() => { tg()?.locationManager.offLocationUpdated(); });
      return;
    }

    locationManagerSubscribers = locationManagerSubscribers.filter((handler) => handler !== cb);
    if (!locationManagerSubscribers.length) {
      safeCall(() => { tg()?.locationManager.offLocationUpdated(); });
    }
  },
};

// ── Init Data ───────────────────────────────────────────

export function getInitData(): TelegramInitDataUnsafe | null { return tg()?.initDataUnsafe ?? null; }
export function getInitDataRaw(): string | undefined { return tg()?.initData; }

// ── Emoji Status ────────────────────────────────────────

export function showEmojiStatus() { safeCall(() => { tg()?.showEmojiStatus(); }); }

// ── Request Contact ─────────────────────────────────────

export function requestContact(): Promise<Result<TelegramContactPayload>> {
  return asyncWrap<TelegramContactPayload>((ok, err) => {
    tg()?.requestContact((granted: boolean, contact: any) => granted ? ok(contact!) : err('User denied'));
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
  safeCall(() => { tg()?.showBioCheckPopup?.(params, cb); });
}

// ── Event Subscriptions ─────────────────────────────────────

type EventHandlerEntry = {
  original: (...args: any[]) => void;
  wrapped: (...args: any[]) => void;
};

const eventHandlers: Record<string, EventHandlerEntry[]> = {};

const sensorSubscribers = {
  accelerometer: [] as Array<(data: TelegramAccelerometerData) => void>,
  gyroscope: [] as Array<(data: TelegramGyroscopeData) => void>,
  deviceOrientation: [] as Array<(data: TelegramDeviceOrientationData) => void>,
};

const sensorCurrentSubscribers = {
  accelerometer: [] as Array<(data: TelegramAccelerometerData) => void>,
  gyroscope: [] as Array<(data: TelegramGyroscopeData) => void>,
  deviceOrientation: [] as Array<(data: TelegramDeviceOrientationData) => void>,
};

let locationManagerSubscribers: Array<(loc: TelegramLocation) => void> = [];

function emitAccelerometer(data: TelegramAccelerometerData): void {
  sensorSubscribers.accelerometer.forEach((cb) => cb(data));
}

function emitGyroscope(data: TelegramGyroscopeData): void {
  sensorSubscribers.gyroscope.forEach((cb) => cb(data));
}

function emitDeviceOrientation(data: TelegramDeviceOrientationData): void {
  sensorSubscribers.deviceOrientation.forEach((cb) => cb(data));
}

function emitAccelerometerCurrent(data: TelegramAccelerometerData): void {
  sensorCurrentSubscribers.accelerometer.forEach((cb) => cb(data));
}

function emitGyroscopeCurrent(data: TelegramGyroscopeData): void {
  sensorCurrentSubscribers.gyroscope.forEach((cb) => cb(data));
}

function emitDeviceOrientationCurrent(data: TelegramDeviceOrientationData): void {
  sensorCurrentSubscribers.deviceOrientation.forEach((cb) => cb(data));
}

function emitLocationManagerUpdate(loc: TelegramLocation): void {
  locationManagerSubscribers.forEach((cb) => cb(loc));
}

export function onFullscreenChange(cb: (isFullscreen: boolean) => void): void {
  const handler = (value: boolean) => cb(value);
  eventHandlers.fullscreen = eventHandlers.fullscreen || [];
  eventHandlers.fullscreen.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('fullscreenChanged', handler); });
}

export function offFullscreenChange(cb?: (isFullscreen: boolean) => void): void {
  if (!eventHandlers.fullscreen?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('fullscreenChanged'); });
    eventHandlers.fullscreen = [];
    return;
  }

  const found = eventHandlers.fullscreen.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('fullscreenChanged', found.wrapped); });
  eventHandlers.fullscreen = eventHandlers.fullscreen.filter((entry) => entry !== found);
}

export function onOrientationChange(cb: (orientation: { width: number; height: number }) => void): void {
  const handler = (data: { width: number; height: number }) => cb(data);
  eventHandlers.orientation = eventHandlers.orientation || [];
  eventHandlers.orientation.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('orientationChanged', handler); });
}

export function offOrientationChange(cb?: (orientation: { width: number; height: number }) => void): void {
  if (!eventHandlers.orientation?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('orientationChanged'); });
    eventHandlers.orientation = [];
    return;
  }

  const found = eventHandlers.orientation.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('orientationChanged', found.wrapped); });
  eventHandlers.orientation = eventHandlers.orientation.filter((entry) => entry !== found);
}

export function onViewportChange(cb: (viewport: TelegramViewport) => void): void {
  const handler = (data: TelegramViewport) => cb(data);
  eventHandlers.viewport = eventHandlers.viewport || [];
  eventHandlers.viewport.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('viewportChanged', handler); });
}

export function offViewportChange(cb?: (viewport: TelegramViewport) => void): void {
  if (!eventHandlers.viewport?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('viewportChanged'); });
    eventHandlers.viewport = [];
    return;
  }

  const found = eventHandlers.viewport.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('viewportChanged', found.wrapped); });
  eventHandlers.viewport = eventHandlers.viewport.filter((entry) => entry !== found);
}

export function onActiveChange(cb: (isActive: boolean) => void): void {
  const handler = (value: boolean) => cb(value);
  eventHandlers.active = eventHandlers.active || [];
  eventHandlers.active.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('activeChanged', handler); });
}

export function offActiveChange(cb?: (isActive: boolean) => void): void {
  if (!eventHandlers.active?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('activeChanged'); });
    eventHandlers.active = [];
    return;
  }

  const found = eventHandlers.active.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('activeChanged', found.wrapped); });
  eventHandlers.active = eventHandlers.active.filter((entry) => entry !== found);
}

export function onInvoiceClose(cb: (result: { status: string; slug?: string }) => void): void {
  const handler = (result: { status: string; slug?: string }) => cb(result);
  eventHandlers.invoiceClosed = eventHandlers.invoiceClosed || [];
  eventHandlers.invoiceClosed.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('invoiceClosed', handler); });
}

export function offInvoiceClose(cb?: (result: { status: string; slug?: string }) => void): void {
  if (!eventHandlers.invoiceClosed?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('invoiceClosed'); });
    eventHandlers.invoiceClosed = [];
    return;
  }

  const found = eventHandlers.invoiceClosed.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('invoiceClosed', found.wrapped); });
  eventHandlers.invoiceClosed = eventHandlers.invoiceClosed.filter((entry) => entry !== found);
}

export function onPopupClosed(cb: (buttonId: string) => void): void {
  const handler = (buttonId: string) => cb(buttonId);
  eventHandlers.popupClosed = eventHandlers.popupClosed || [];
  eventHandlers.popupClosed.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('popupClosed', handler); });
}

export function offPopupClosed(cb?: (buttonId: string) => void): void {
  if (!eventHandlers.popupClosed?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('popupClosed'); });
    eventHandlers.popupClosed = [];
    return;
  }

  const found = eventHandlers.popupClosed.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('popupClosed', found.wrapped); });
  eventHandlers.popupClosed = eventHandlers.popupClosed.filter((entry) => entry !== found);
}

// ── Flash Mode ─────────────────────────────────────────────

export function getFlashMode(): 'on' | 'off' | 'auto' {
  return tg()?.flashMode ?? 'off';
}

export function setFlashMode(mode: 'on' | 'off' | 'auto'): Result<void> {
  return wrap(() => tg()?.setFlashMode?.(mode));
}

export function onFlashModeChange(cb: (mode: 'on' | 'off' | 'auto') => void): void {
  const handler = (mode: 'on' | 'off' | 'auto') => cb(mode);
  eventHandlers.flashModeChanged = eventHandlers.flashModeChanged || [];
  eventHandlers.flashModeChanged.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('flashModeChanged', handler); });
}

export function offFlashModeChange(cb?: (mode: 'on' | 'off' | 'auto') => void): void {
  if (!eventHandlers.flashModeChanged?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('flashModeChanged'); });
    eventHandlers.flashModeChanged = [];
    return;
  }

  const found = eventHandlers.flashModeChanged.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('flashModeChanged', found.wrapped); });
  eventHandlers.flashModeChanged = eventHandlers.flashModeChanged.filter((entry) => entry !== found);
}

// ── Emoji Status Events ─────────────────────────────────────

export function offEmojiStatus(): Result<void> {
  return wrap(() => tg()?.offEmojiStatus?.());
}

// ── Sensor Events ───────────────────────────────────────────

export function onAccelerometerChange(cb: (data: TelegramAccelerometerData) => void): void {
  if (sensorSubscribers.accelerometer.includes(cb)) {
    return;
  }

  sensorSubscribers.accelerometer.push(cb);
  if (sensorSubscribers.accelerometer.length === 1) {
    safeCall(() => { tg()?.accelerometer.onChange?.(emitAccelerometer); });
  }
}

export function offAccelerometerChange(cb?: (data: TelegramAccelerometerData) => void): void {
  if (!sensorSubscribers.accelerometer.length) {
    return;
  }

  if (!cb) {
    sensorSubscribers.accelerometer = [];
    safeCall(() => { tg()?.accelerometer.offChange?.(); });
    return;
  }

  sensorSubscribers.accelerometer = sensorSubscribers.accelerometer.filter((handler) => handler !== cb);
  if (!sensorSubscribers.accelerometer.length) {
    safeCall(() => { tg()?.accelerometer.offChange?.(); });
  }
}

export function onGyroscopeChange(cb: (data: TelegramGyroscopeData) => void): void {
  if (sensorSubscribers.gyroscope.includes(cb)) {
    return;
  }

  sensorSubscribers.gyroscope.push(cb);
  if (sensorSubscribers.gyroscope.length === 1) {
    safeCall(() => { tg()?.gyroscope.onChange?.(emitGyroscope); });
  }
}

export function offGyroscopeChange(cb?: (data: TelegramGyroscopeData) => void): void {
  if (!sensorSubscribers.gyroscope.length) {
    return;
  }

  if (!cb) {
    sensorSubscribers.gyroscope = [];
    safeCall(() => { tg()?.gyroscope.offChange?.(); });
    return;
  }

  sensorSubscribers.gyroscope = sensorSubscribers.gyroscope.filter((handler) => handler !== cb);
  if (!sensorSubscribers.gyroscope.length) {
    safeCall(() => { tg()?.gyroscope.offChange?.(); });
  }
}

export function onDeviceOrientationChange(cb: (data: TelegramDeviceOrientationData) => void): void {
  if (sensorSubscribers.deviceOrientation.includes(cb)) {
    return;
  }

  sensorSubscribers.deviceOrientation.push(cb);
  if (sensorSubscribers.deviceOrientation.length === 1) {
    safeCall(() => { tg()?.deviceOrientation.onChange?.(emitDeviceOrientation); });
  }
}

export function offDeviceOrientationChange(cb?: (data: TelegramDeviceOrientationData) => void): void {
  if (!sensorSubscribers.deviceOrientation.length) {
    return;
  }

  if (!cb) {
    sensorSubscribers.deviceOrientation = [];
    safeCall(() => { tg()?.deviceOrientation.offChange?.(); });
    return;
  }

  sensorSubscribers.deviceOrientation = sensorSubscribers.deviceOrientation.filter((handler) => handler !== cb);
  if (!sensorSubscribers.deviceOrientation.length) {
    safeCall(() => { tg()?.deviceOrientation.offChange?.(); });
  }
}

// ── Accelerometer/Gyroscope Permission ──────────────────────

export function requestAccelerometer(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.accelerometer.requestPermission?.((granted: any) => ok(!!granted));
  });
}

export function requestGyroscope(): Promise<Result<boolean>> {
  return asyncWrap<boolean>((ok) => {
    tg()?.gyroscope.requestPermission?.((granted: any) => ok(!!granted));
  });
}

// ── Location Updates ────────────────────────────────────────

export function onLocationUpdate(cb: (loc: TelegramLocation) => void): void {
  const handler = (loc: TelegramLocation) => cb(loc);
  eventHandlers.locationChanged = eventHandlers.locationChanged || [];
  eventHandlers.locationChanged.push({ original: cb as (...args: any[]) => void, wrapped: handler });
  safeCall(() => { tg()?.onEvent?.('locationChanged', handler); });
}

export function offLocationUpdate(cb?: (loc: TelegramLocation) => void): void {
  if (!eventHandlers.locationChanged?.length) {
    return;
  }

  if (!cb) {
    safeCall(() => { tg()?.offEvent?.('locationChanged'); });
    eventHandlers.locationChanged = [];
    return;
  }

  const found = eventHandlers.locationChanged.find((entry) => entry.original === cb);
  if (!found) {
    return;
  }

  safeCall(() => { tg()?.offEvent?.('locationChanged', found.wrapped); });
  eventHandlers.locationChanged = eventHandlers.locationChanged.filter((entry) => entry !== found);
}

// ── Init ────────────────────────────────────────────────

export function initTelegramMiniApp() {
  ready();
  expand();
}

// ── Device Storage ──────────────────────────────────────────

export const deviceStorage = {
  get: (key: string) => asyncWrap<string | null>((ok, err) => {
    tg()?.deviceStorage?.get(key, (e: any, v: any) => e ? err(String(e)) : ok(v ?? null));
  }),
  set: (key: string, value: string) => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.set(key, value, (e: any) => e ? err(String(e)) : ok(undefined));
  }),
  remove: (key: string) => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.remove(key, (e: any) => e ? err(String(e)) : ok(undefined));
  }),
  clear: () => asyncWrap<void>((ok, err) => {
    tg()?.deviceStorage?.clear((e: any) => e ? err(String(e)) : ok(undefined));
  }),
};

// ── Send Data (for keyboard-button Mini Apps) ─────────────

export function sendData(data: string | object): Result<void> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return wrap(() => tg()?.sendData(payload));
}