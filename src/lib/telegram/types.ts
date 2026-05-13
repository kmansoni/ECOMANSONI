/**
 * Telegram Mini App — Unified Type Definitions
 * Covers Bot API 9.6–10.0 Mini App interfaces
 */

// ── Core ──────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
}

// ── Theme Parameters ──────────────────────────────────

export interface TelegramThemeParams {
  bg_color?: string;
  button_color?: string;
  button_text_color?: string;
  hint_color?: string;
  link_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export interface TelegramColorScheme {
  bg_color: string;
  button_color: string;
  button_text_color: string;
}

// ── Biometric ─────────────────────────────────────────

export interface TelegramBiometricStatus {
  available: boolean;
  type: 'finger' | 'face' | 'unknown';
  access_requested: boolean;
}

export interface TelegramBiometricToken {
  token: string;
}

export interface TelegramBiometricAuthenticateParams {
  reason?: string;
  finger_print?: string;
}

// ── Cloud Storage ─────────────────────────────────────

export interface TelegramCloudStorageItem {
  key: string;
  value: string;
}

// ── Location ──────────────────────────────────────────

export interface TelegramLocation {
  latitude: number;
  longitude: number;
  horizontal_accuracy?: number;
  live_period?: number;
}

// ── Accelerometer / Gyroscope ─────────────────────────

export interface TelegramAccelerometerData {
  x: number;
  y: number;
  z: number;
}

export interface TelegramGyroscopeData {
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface TelegramDeviceOrientationData {
  absolute: boolean;
  alpha: number;
  beta: number;
  gamma: number;
}

// ── QR Scanner ────────────────────────────────────────

export interface TelegramQRCodeText {
  data: string;
  text: string;
}

// ── Popup / Dialogs ───────────────────────────────────

export interface TelegramPopupButton {
  id?: string;
  type: 'default' | 'destructive' | 'ok' | 'cancel' | 'close';
  text: string;
}

export interface TelegramPopupParams {
  title?: string;
  message: string;
  buttons?: TelegramPopupButton[];
}

// ── Main Button ───────────────────────────────────────

export interface TelegramMainButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  has_shine_effect?: boolean;
  is_active?: boolean;
  is_visible?: boolean;
}

// ── Settings Button ───────────────────────────────────

export interface TelegramSettingsButtonParams {
  is_visible?: boolean;
  text?: string;
  color?: string;
  text_color?: string;
}

// ── Back Button ───────────────────────────────────────

export interface TelegramBackButtonParams {
  is_visible?: boolean;
}

// ── Swipe Behavior ────────────────────────────────────

export type TelegramSwipeBehavior = 'none' | 'horizontal' | 'vertical';

// ── Header Color ──────────────────────────────────────

export type TelegramHeaderColorType = 'bg_color' | 'secondary_bg_color';

// ── Emoji Status ──────────────────────────────────────

export interface TelegramEmojiStatus {
  emoji: string;
  duration?: number; // 1–31 days
  content_type?: 'application/emoji-status';
}

// ── Bio Check ─────────────────────────────────────────

export interface TelegramBioCheckData {
  text: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
    user?: TelegramUser;
  }>;
}

// ── Request Chat ──────────────────────────────────────

export interface TelegramChatRequest {
  chat_id: number | string;
  message_text?: string;
}

// ── File / Attachment ─────────────────────────────────

export interface TelegramAttachmentFile {
  name: string;
  blob: Blob;
}

// ── Safe Area ─────────────────────────────────────────

export interface TelegramSafeArea {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

// ── Init Data ─────────────────────────────────────────

export interface TelegramInitDataUnsafe {
  query_id?: string;
  user?: TelegramUser;
  auth_date?: string;
  hash?: string;
  chat?: string;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
}

export interface TelegramInitData {
  raw: string;
  parsed: TelegramInitDataUnsafe;
  hash: string;
}

// ── Secondary Button ───────────────────────────────────

export interface TelegramSecondaryButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
  has_shine_effect?: boolean;
  position?: 'left' | 'right' | 'top' | 'bottom';
}

// ── Fullscreen ───────────────────────────────────────────

export interface TelegramFullscreenStatus {
  is_fullscreen: boolean;
}

// ── Orientation ───────────────────────────────────────────

export type TelegramOrientationType = 'portrait' | 'landscape' | 'landscape-primary' | 'landscape-secondary' | 'portrait-primary' | 'portrait-secondary';

// ── Viewport ───────────────────────────────────────────────

export interface TelegramViewport {
  height: number;
  stable_height: number;
  is_state_stable: boolean;
}

// ── Safe Area (Enhanced) ──────────────────────────────────

export interface TelegramContentSafeArea {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

// ── Contact ────────────────────────────────────────────

export interface TelegramContactPayload {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

// ── Request Contact Result ───────────────────────────────

export interface TelegramContactRequestResult {
  granted: boolean;
  contact?: TelegramContactPayload;
}

// ── Write Access Result ──────────────────────────────────

export interface TelegramWriteAccessResult {
  granted: boolean;
}

// ── QR Scanner Callback ──────────────────────────────────

export interface TelegramQRScannerCallback {
  (data: TelegramQRCodeText): void;
}

// ── Home Screen Result ───────────────────────────────────

export interface TelegramHomeScreenResult {
  status: 'added' | 'exists' | 'cancelled' | 'failed';
}

// ── Chat Request Result ──────────────────────────────────

export interface TelegramChatRequestResult {
  status: 'sent' | 'cancelled' | 'failed';
}

// ── Biometric Result ─────────────────────────────────────

export interface TelegramBiometricAuthResult {
  token?: TelegramBiometricToken;
  error?: string;
}

// ── File Download Result ─────────────────────────────────

export interface TelegramFileDownloadResult {
  status: 'completed' | 'cancelled' | 'failed';
  data?: Blob;
}

// ── Emoji Status Request Result ─────────────────────────────

export interface TelegramEmojiStatusRequestResult {
  granted: boolean;
}

// ── Emoji Status Set Result ─────────────────────────────────

export interface TelegramEmojiStatusSetResult {
  ok: boolean;
  error?: string;
}

// ── Switch Inline Query Params ─────────────────────────────

export interface TelegramSwitchInlineQueryParams {
  query: string;
  chat_types?: ('users' | 'bots' | 'groups' | 'channels')[];
}

// ── Open Link Params ──────────────────────────────────────

export interface TelegramOpenLinkParams {
  url: string;
  try_instant_view?: boolean;
  try_path?: string;
}

// ── Invoice Result ─────────────────────────────────────────

export interface TelegramInvoiceResult {
  status: 'paid' | 'cancelled' | 'failed';
  slug?: string;
}

// ── Share Message Params ───────────────────────────────────

export interface TelegramShareMessageParams {
  text: string;
}

// ── Share Story Params ─────────────────────────────────────

export interface TelegramShareStoryParams {
  media_url: string;
  text?: string;
  widget_link?: {
    url: string;
    name: string;
  };
}

// ── Clipboard Read Result ──────────────────────────────────

export interface TelegramClipboardReadResult {
  data: string;
}

// ── Location Manager Status ────────────────────────────────

export interface TelegramLocationManagerStatus {
  status: 'granted' | 'denied' | 'pending';
}

// ── Secure Storage Quota ───────────────────────────────────

export interface TelegramStorageQuota {
  used: number;
  total: number;
}

// ── Bot API 10.0 Guest Mode ─────────────────────────────────

export interface TelegramGuestUser extends TelegramUser {
  supports_guest_queries?: boolean;
}

export interface TelegramGuestMessage {
  message_id: number;
  guest_query_id?: string;
  guest_bot_caller_user?: TelegramUser;
  guest_bot_caller_chat?: TelegramChat;
}

export interface TelegramUpdateGuestMessage {
  type: 'guest_message';
  guest_message: TelegramGuestMessage;
}

// ── Bot API 10.0 Managed Bots ───────────────────────────────

export interface TelegramManagedBotCreated {
  managed_bot_user_id: number;
  bot_access_settings?: TelegramBotAccessSettings;
}

export interface TelegramBotAccessSettings {
  can_manage_bots?: boolean;
  can_reply_to_messages?: boolean;
  can_send_media?: boolean;
}

export interface TelegramManagedBotUpdated {
  user_id: number;
  access_settings: TelegramBotAccessSettings;
}

// ── Bot API 10.0 Poll Enhancements ───────────────────────────

export interface TelegramPollMedia {
  type: 'photo' | 'video' | 'animation' | 'sticker' | 'location' | 'venue';
  media: string; // file_id or URL
}

export interface TelegramInputPollOptionMedia {
  text: string;
  media?: TelegramPollMedia;
}

export interface TelegramPoll {
  id: string;
  question: string;
  options: Array<{
    text: string;
    voter_count: number;
    added_by_user?: TelegramUser;
    added_by_chat?: TelegramChat;
    addition_date?: number;
  }>;
  media?: TelegramPollMedia;
  members_only?: boolean;
  country_codes?: string[];
  allows_revoting?: boolean;
  description?: string;
  description_entities?: Array<{ type: string; offset: number; length: number }>;
}