/**
 * Mansoni Mini App — Unified Type Definitions
 *
 * Собственные типы, не зависящие от Telegram WebApp.
 * Реализации используют нативные Web API браузера / Capacitor.
 */

// ── Theme ───────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark';

export interface ThemeParams {
  bg_color: string;
  button_color: string;
  button_text_color: string;
  hint_color: string;
  link_color: string;
  secondary_bg_color: string;
  header_bg_color: string;
  accent_text_color: string;
  section_bg_color: string;
  section_header_text_color: string;
  subtitle_text_color: string;
  destructive_text_color: string;
}

export const DEFAULT_THEME: ThemeParams = {
  bg_color: '#1a1a2e',
  button_color: '#6c63ff',
  button_text_color: '#ffffff',
  hint_color: '#8b8fa3',
  link_color: '#6c63ff',
  secondary_bg_color: '#16213e',
  header_bg_color: '#0f3460',
  accent_text_color: '#e94560',
  section_bg_color: '#16213e',
  section_header_text_color: '#ffffff',
  subtitle_text_color: '#8b8fa3',
  destructive_text_color: '#e94560',
};

export interface TouchPoint {
  x: number;
  y: number;
  force?: number;
  timestamp: number;
}

// ── Popup / Dialogs ─────────────────────────────────────

export type PopupButton = {
  id?: string;
  type: 'default' | 'destructive' | 'ok' | 'cancel' | 'close';
  text: string;
};

export interface PopupParams {
  title?: string;
  message: string;
  buttons?: PopupButton[];
}

export interface PopupResult {
  buttonId?: string;
}

// ── Biometric ───────────────────────────────────────────

export interface BiometricStatus {
  available: boolean;
  type: 'finger' | 'face' | 'unknown';
  accessRequested: boolean;
}

export interface BiometricAuthenticateParams {
  reason?: string;
}

// ── Cloud Storage ───────────────────────────────────────

export interface StorageItem {
  key: string;
  value: string;
}

// ── Secure Storage ──────────────────────────────────────

export interface SecureStorageConfig {
  /** Имя хранилища (по умолчанию 'mansoni_secure') */
  storeName?: string;
  /** Соль для шифрования (по умолчанию генерируется) */
  salt?: string;
}

// ── Sensors ─────────────────────────────────────────────

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface GyroscopeData {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface DeviceOrientationData {
  absolute: boolean;
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

// ── Location ────────────────────────────────────────────

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface LocationRequestOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

// ── QR Scanner ──────────────────────────────────────────

export interface QRResult {
  raw: string;
  text: string;
  format: 'qr_code' | 'barcode';
}

export interface QRScannerOptions {
  facingMode?: 'environment' | 'user';
  formats?: string[];
}

// ── Files ───────────────────────────────────────────────

export interface AttachmentFile {
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

// ── Contacts ────────────────────────────────────────────

export interface ContactPayload {
  phoneNumber: string;
  firstName: string;
  lastName?: string;
  userId?: string;
}

// ── Emoji Status ────────────────────────────────────────

export interface EmojiStatus {
  emoji: string;
  duration?: number;
}

// ── Main Button ─────────────────────────────────────────

export interface MainButtonParams {
  text?: string;
  color?: string;
  textColor?: string;
  hasShineEffect?: boolean;
  isActive?: boolean;
  isVisible?: boolean;
  onClick?: () => void;
}

// ── Back Button ─────────────────────────────────────────

export interface BackButtonParams {
  isVisible?: boolean;
  onClick?: () => void;
}

// ── Settings Button ─────────────────────────────────────

export interface SettingsButtonParams {
  isVisible?: boolean;
  text?: string;
  color?: string;
  textColor?: string;
  onClick?: () => void;
}

// ── Swipe ───────────────────────────────────────────────

export type SwipeBehavior = 'none' | 'horizontal' | 'vertical';

// ── Home Screen ─────────────────────────────────────────

export interface HomeScreenStatus {
  status: 'installed' | 'not_installed' | 'unsupported';
}

// ── Deep Link ───────────────────────────────────────────

export interface ParsedDeepLink {
  command: string;
  payload?: string;
  raw: string;
}

// ── Payment ─────────────────────────────────────────────

export interface Invoice {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'processing' | 'failed';
  createdAt: string;
  paidAt?: string;
}

export interface CreateInvoiceParams {
  title: string;
  description: string;
  amount: number;
  currency?: string;
  provider?: 'stripe' | 'yookassa' | 'internal';
  metadata?: Record<string, string>;
}

// ── Analytics ───────────────────────────────────────────

export interface AppMetric {
  event: string;
  props?: Record<string, string | number | boolean>;
}

// ── Device Info ─────────────────────────────────────────

export interface DeviceInfo {
  platform: string;
  version: string;
  isMobile: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  language: string;
}

// ── Init Data ───────────────────────────────────────────

export interface AppInitData {
  startParam?: string;
  payload?: string;
  user?: {
    id: string;
    username?: string;
    displayName: string;
    avatarUrl?: string;
  };
  chatId?: string;
  referrer?: string;
}