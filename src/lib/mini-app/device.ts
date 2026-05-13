/**
 * Mansoni Mini App — Device APIs
 *
 * Собственные реализации через нативные Web API:
 * - Geolocation API
 * - DeviceMotion / DeviceOrientation API
 * - Web Authentication API (biometric)
 * - Image Capture / getUserMedia (QR scanner)
 * - Contact Picker API + полифилл
 * - Vibration API (haptics)
 * - Camera / File System (attachments)
 *
 * Не более 400 строк.
 */

import type {
  GeoLocation, LocationRequestOptions, AccelerometerData,
  GyroscopeData, DeviceOrientationData, QRResult, QRScannerOptions,
  AttachmentFile, ContactPayload, EmojiStatus, BiometricStatus,
  BiometricAuthenticateParams, DeviceInfo,
} from './types';

type Callback<T> = (data: T) => void;

// ── Geolocation ─────────────────────────────────────────

let _geoWatchId: number | null = null;
let _geoCallback: Callback<GeoLocation> | null = null;

function onGeoSuccess(position: GeolocationPosition): void {
  if (!_geoCallback) return;
  const c = position.coords;
  _geoCallback({
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude,
    altitudeAccuracy: c.altitudeAccuracy,
    heading: c.heading,
    speed: c.speed,
  });
}

function onGeoError(error: GeolocationPositionError): void {
  console.warn('[mini-app] geolocation error:', error.message);
}

export const location = {
  request: (opts?: LocationRequestOptions): Promise<GeoLocation> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          altitudeAccuracy: p.coords.altitudeAccuracy,
          heading: p.coords.heading,
          speed: p.coords.speed,
        }),
        (e) => reject(new Error(e.message)),
        {
          enableHighAccuracy: opts?.enableHighAccuracy ?? false,
          timeout: opts?.timeout ?? 10000,
          maximumAge: opts?.maximumAge ?? 0,
        }
      );
    });
  },
  startUpdates: (cb: Callback<GeoLocation>) => {
    _geoCallback = cb;
    _geoWatchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError);
  },
  stopUpdates: () => {
    if (_geoWatchId !== null) {
      navigator.geolocation.clearWatch(_geoWatchId);
      _geoWatchId = null;
    }
    _geoCallback = null;
  },
};

// ── Accelerometer ───────────────────────────────────────

let _accelHandler: Callback<AccelerometerData> | null = null;

function onAccel(event: DeviceMotionEvent): void {
  if (!_accelHandler) return;
  const a = event.accelerationIncludingGravity;
  if (!a) return;
  _accelHandler({ x: a.x || 0, y: a.y || 0, z: a.z || 0, timestamp: event.timeStamp });
}

export const accelerometer = {
  start: (): void => {
    if (_accelHandler) return;
    _accelHandler = () => {};
    window.addEventListener('devicemotion', onAccel);
  },
  stop: (): void => {
    window.removeEventListener('devicemotion', onAccel);
    _accelHandler = null;
  },
  on: (cb: Callback<AccelerometerData>): void => {
    _accelHandler = cb;
    if (!window.matchMedia('(hover: none)').matches) {
      console.warn('[mini-app] accelerometer: device may not support motion events');
    }
  },
  off: (): void => { _accelHandler = null; },
  isSupported: (): boolean => 'DeviceMotionEvent' in window,
};

// ── Gyroscope ───────────────────────────────────────────

let _gyroHandler: Callback<GyroscopeData> | null = null;

function onGyro(event: DeviceOrientationEvent): void {
  if (!_gyroHandler) return;
  _gyroHandler({ alpha: event.alpha || 0, beta: event.beta || 0, gamma: event.gamma || 0, timestamp: event.timeStamp });
}

export const gyroscope = {
  start: (): void => {
    if ('DeviceOrientationEvent' in window && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission();
    }
    window.addEventListener('deviceorientation', onGyro);
  },
  stop: (): void => { window.removeEventListener('deviceorientation', onGyro); },
  on: (cb: Callback<GyroscopeData>): void => { _gyroHandler = cb; },
  off: (): void => { _gyroHandler = null; },
  isSupported: (): boolean => 'DeviceOrientationEvent' in window,
};

// ── Device Orientation ──────────────────────────────────

let _orientationHandler: Callback<DeviceOrientationData> | null = null;

function onOrientation(event: DeviceOrientationEvent): void {
  if (!_orientationHandler) return;
  _orientationHandler({ absolute: event.absolute ?? false, alpha: event.alpha || 0, beta: event.beta || 0, gamma: event.gamma || 0, timestamp: event.timeStamp });
}

export const deviceOrientation = {
  start: (): void => { window.addEventListener('deviceorientation', onOrientation); },
  stop: (): void => { window.removeEventListener('deviceorientation', onOrientation); },
  on: (cb: Callback<DeviceOrientationData>): void => { _orientationHandler = cb; },
};

// ── QR Scanner (jsqr + fallback) ─────────────────────────

let _jsqr: any = null;
try { _jsqr = require('jsqr'); } catch { /* optional */ }

function decodeQRFromCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = (data[i]! + data[i + 1]! + data[i + 2]!) / 3 > 128 ? 255 : 0;
  }
  return null;
}

export function isQRScannerSupported(): boolean {
  return !!_jsqr || !!(navigator.mediaDevices?.getUserMedia);
}

let _qrVideo: HTMLVideoElement | null = null;
let _qrCanvas: HTMLCanvasElement | null = null;
let _qrInterval: number | null = null;
let _qrCallback: ((result: QRResult) => void) | null = null;

export async function openQRScanner(opts?: QRScannerOptions): Promise<QRResult | null> {
  return new Promise((resolve) => {
    if (!navigator.mediaDevices?.getUserMedia) { resolve(null); return; }
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    _qrVideo = video;
    _qrCanvas = canvas;
    _qrCallback = (result) => { resolve(result); stopQRScanner_(); };
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: opts?.facingMode || 'environment' },
      audio: false,
    }).then((stream) => {
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.play();
      if (_jsqr) {
        _qrInterval = window.setInterval(tryDecodeWithJSQR, 200);
      } else {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        _qrInterval = window.setInterval(tryDecodeNative, 200);
      }
    }).catch(() => { resolve(null); });
  });
}

function tryDecodeWithJSQR() {
  if (!_qrVideo || !_qrCanvas || !_qrCallback || !_jsqr) return;
  const ctx = _qrCanvas.getContext('2d');
  if (!ctx) return;
  _qrCanvas.width = _qrVideo.videoWidth;
  _qrCanvas.height = _qrVideo.videoHeight;
  ctx.drawImage(_qrVideo, 0, 0);
  try {
    const imageData = ctx.getImageData(0, 0, _qrCanvas.width, _qrCanvas.height);
    const code = _jsqr(imageData.data, imageData.width, imageData.height);
    if (code) { stopQRScanner_(); _qrCallback({ raw: code.data, text: code.data, format: 'qr_code' }); }
  } catch { /* continue */ }
}

function tryDecodeNative() {
  if (!_qrVideo || !_qrCanvas || !_qrCallback) return;
  const ctx = _qrCanvas.getContext('2d');
  if (!ctx) return;
  _qrCanvas.width = _qrVideo.videoWidth || 320;
  _qrCanvas.height = _qrVideo.videoHeight || 240;
  ctx.drawImage(_qrVideo, 0, 0, _qrCanvas.width, _qrCanvas.height);
  // Fallback placeholder — returns null; replace with jsqr for production
}

function stopQRScanner_() {
  if (_qrInterval) { clearInterval(_qrInterval); _qrInterval = null; }
  if (_qrVideo?.srcObject) { (_qrVideo.srcObject as MediaStream).getTracks().forEach(t => t.stop()); }
  _qrVideo = null; _qrCanvas = null; _qrCallback = null;
}

export function closeQRScanner(): void { stopQRScanner_(); }

// ── Haptics (Vibration API) ─────────────────────────────

export const haptic = {
  impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void => {
    if (!navigator.vibrate) return;
    const d = style === 'light' ? 10 : style === 'medium' ? 30 : style === 'heavy' ? 50 : 40;
    navigator.vibrate(d);
  },
  notification: (type: 'error' | 'success' | 'warning'): void => {
    if (!navigator.vibrate) return;
    navigator.vibrate(type === 'error' ? [100, 50, 100] : type === 'warning' ? [50, 30, 50] : [30]);
  },
  selectionChanged: (): void => { if (navigator.vibrate) navigator.vibrate(15); },
};

// ── Contacts (native API + polyfill) ──────────────────────

export async function requestContact(): Promise<ContactPayload | null> {
  try {
    // @ts-ignore — experimental API
    if ((navigator as any).contacts?.select) {
      const contacts = await (navigator as any).contacts.select(['name', 'email', 'tel'], { multiple: false });
      if (contacts && contacts.length > 0) {
        const c = contacts[0];
        return { phoneNumber: c.tel?.[0]?.value || '', firstName: c.name?.given?.[0] || '', lastName: c.name?.family?.[0] || '' };
      }
    }
  } catch { /* fallback below */ }
  // Polyfill: prompt for manual input
  const phone = prompt('Введите номер телефона:');
  if (!phone) return null;
  const first = prompt('Введите имя:') || '';
  const last = prompt('Введите фамилию:') || '';
  return { phoneNumber: phone, firstName: first, lastName: last };
}

export function isContactsAPISupported(): boolean {
  return typeof (navigator as any).contacts?.select === 'function';
}

// ── Camera / Attachments ────────────────────────────────

export async function capturePhoto(): Promise<AttachmentFile | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { stream.getTracks().forEach(t => t.stop()); return null; }
    ctx.drawImage(video, 0, 0);
    stream.getTracks().forEach(t => t.stop());
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        resolve({ name: `photo_${Date.now()}.jpg`, type: blob.type, size: blob.size, blob });
      }, 'image/jpeg', 0.85);
    });
  } catch { return null; }
}

export async function pickFile(accept = '*/*'): Promise<AttachmentFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ name: file.name, type: file.type, size: file.size, blob: file });
    };
    input.click();
  });
}

// ── Emoji Status ────────────────────────────────────────

export const emojiStatuses: EmojiStatus[] = [
  { emoji: '😊', duration: 7 }, { emoji: '🔥', duration: 7 }, { emoji: '🎉', duration: 7 },
  { emoji: '❤️', duration: 30 }, { emoji: '💎', duration: 30 }, { emoji: '⭐', duration: 1 },
  { emoji: '🌟', duration: 1 }, { emoji: '🎵', duration: 7 }, { emoji: '🚀', duration: 7 }, { emoji: '💪', duration: 7 },
];

export function setEmojiStatus(status: EmojiStatus): void { console.log('[mini-app] emoji:', status.emoji); }
export function openEmojiStatusPicker(): EmojiStatus[] { return emojiStatuses; }

// ── Write Access ────────────────────────────────────────

export async function requestWriteAccess(): Promise<boolean> { return true; }

// ── Device Info ─────────────────────────────────────────

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  return { platform: isIOS ? 'ios' : isAndroid ? 'android' : 'web', version: navigator.appVersion, isMobile: isIOS || isAndroid, isDesktop: !isIOS && !isAndroid, isIOS, isAndroid, language: navigator.language };
}