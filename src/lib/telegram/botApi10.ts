/**
 * Telegram Bot API 10.0 — New Types and Methods
 */

// ── Guest Mode Types ───────────────────────────────────────

export interface TelegramGuestQueryParams {
  guest_query_id: string;
  user_id?: number;
}

export interface TelegramAnswerGuestQueryOptions {
  text?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: any;
  disable_web_page_preview?: boolean;
}

// ── Poll Enhancements Types ────────────────────────────────

export interface TelegramSendPollOptions {
  chat_id: number | string;
  question: string;
  options: Array<{ text: string; media?: any }>;
  is_anonymous?: boolean;
  type?: 'quiz' | 'regular';
  correct_option_id?: number;
  explanation?: string;
  explanation_parse_mode?: 'HTML' | 'MarkdownV2';
  explanation_entities?: any[];
  open_period?: number;
  close_date?: number;
  is_closed?: boolean;
  disable_notifications?: boolean;
  reply_markup?: any;
  allow_adding_options?: boolean;
  hide_results_until_closed?: boolean;
  shuffle_ones?: boolean;
  members_only?: boolean;
  country_codes?: string[];
  allows_revoting?: boolean;
}

// ── Live Photo Types ───────────────────────────────────────

export interface TelegramLivePhoto {
  duration: number;
  width: number;
  height: number;
  file_id: string;
  file_unique_id: string;
  file_size?: number;
}

export interface TelegramInputMediaLivePhoto {
  type: 'live_photo';
  media: string;
  thumbnail?: string;
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  caption_entities?: any[];
}

export interface TelegramPaidMediaLivePhoto {
  type: 'live_photo';
  live_photo: TelegramLivePhoto;
}

// ── Message Drafts Types ───────────────────────────────────

export interface TelegramSendMessageDraftOptions {
  chat_id: number | string;
  text: string;
  disable_notification?: boolean;
  reply_markup?: any;
}

// ── Managed Bots Types ─────────────────────────────────────

export interface TelegramManagedBotCreated {
  managed_bot_user_id: number;
  access_settings?: TelegramBotAccessSettings;
}

export interface TelegramBotAccessSettings {
  can_manage_bots?: boolean;
  can_reply_to_messages?: boolean;
  can_send_media?: boolean;
}

// ── Effects Types ───────────────────────────────────────────

export interface TelegramMessageEffect {
  effect_id: string;
  name: string;
  premium_required?: boolean;
}