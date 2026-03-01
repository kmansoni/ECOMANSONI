/**
 * Bot Platform Types - Telegram-like Bot Platform
 * 
 * These types complement the auto-generated Supabase Database types.
 * Use these for frontend components and API interactions.
 */

// ============================================================================
// ENUMS (matching database enums)
// ============================================================================

export type BotChatType = 'private' | 'group' | 'supergroup' | 'channel';
export type BotStatus = 'active' | 'disabled' | 'archived';
export type MessageEntityType = 
  | 'mention' 
  | 'hashtag' 
  | 'bot_command' 
  | 'url' 
  | 'email'
  | 'bold' 
  | 'italic' 
  | 'underline' 
  | 'strikethrough'
  | 'code' 
  | 'pre' 
  | 'text_link' 
  | 'text_mention';

export type KeyboardType = 'reply' | 'inline' | 'remove';
export type BotMessageDirection = 'incoming' | 'outgoing';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Bot {
  id: string;
  owner_id: string;
  username: string;
  display_name: string;
  description?: string;
  about?: string;
  avatar_url?: string;
  bot_chat_type: BotChatType;
  status: BotStatus;
  is_verified: boolean;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  is_private: boolean;
  language_code: string;
  created_at: string;
  updated_at: string;
}

export interface BotWithOwner extends Bot {
  owner?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface BotToken {
  id: string;
  bot_id: string;
  token: string;
  name?: string;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface BotCommand {
  id: string;
  bot_id: string;
  command: string;
  description?: string;
  language_code: string;
  created_at: string;
}

export interface BotWebhook {
  id: string;
  bot_id: string;
  url: string;
  secret_token?: string;
  is_active: boolean;
  last_triggered_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface BotChat {
  id: string;
  bot_id: string;
  user_id: string;
  chat_id?: string;
  last_message_at: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface BotChatWithBot extends BotChat {
  bot?: Bot;
}

export interface BotAnalytics {
  id: string;
  bot_id: string;
  date: string;
  messages_sent: number;
  messages_received: number;
  unique_users: number;
  new_subscriptions: number;
  total_commands: number;
  created_at: string;
}

export interface BotMessage {
  id: string;
  bot_id: string;
  chat_id: string;
  message_id: string;
  direction: BotMessageDirection;
  raw_update?: Record<string, unknown>;
  processed_at?: string;
  created_at: string;
}

// ============================================================================
// MINI APPS TYPES
// ============================================================================

export interface MiniApp {
  id: string;
  owner_id: string;
  bot_id?: string;
  title: string;
  slug: string;
  description?: string;
  icon_url?: string;
  url: string;
  version?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MiniAppWithOwner extends MiniApp {
  owner?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  bot?: Bot;
}

export interface MiniAppSession {
  id: string;
  mini_app_id: string;
  user_id: string;
  platform?: string;
  device_info?: Record<string, unknown>;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateBotRequest {
  username: string;
  display_name: string;
  description?: string;
  about?: string;
  avatar_url?: string;
  bot_chat_type?: BotChatType;
  is_private?: boolean;
  language_code?: string;
}

export interface UpdateBotRequest {
  display_name?: string;
  description?: string;
  about?: string;
  avatar_url?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  is_private?: boolean;
  language_code?: string;
  status?: BotStatus;
}

export interface CreateBotTokenRequest {
  name?: string;
  expires_at?: string;
}

export interface CreateBotCommandRequest {
  command: string;
  description?: string;
  language_code?: string;
}

export interface UpdateBotCommandsRequest {
  commands: CreateBotCommandRequest[];
}

export interface CreateBotWebhookRequest {
  url: string;
  secret_token?: string;
}

export interface CreateMiniAppRequest {
  title: string;
  slug: string;
  description?: string;
  icon_url?: string;
  url: string;
  version?: string;
  bot_id?: string;
}

export interface UpdateMiniAppRequest {
  title?: string;
  description?: string;
  icon_url?: string;
  url?: string;
  version?: string;
  bot_id?: string;
  is_active?: boolean;
}

// ============================================================================
// TELEGRAM API COMPATIBLE TYPES
// ============================================================================

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: TelegramWebAppInfo;
}

export interface TelegramWebAppInfo {
  url: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset?: string;
}

export interface TelegramChosenInlineResult {
  result_id: string;
  from: TelegramUser;
  query: string;
}

export interface TelegramBotCommand {
  command: string;
  description: string;
}

// ============================================================================
// BOT API RESPONSE TYPES
// ============================================================================

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface BotListResponse {
  bots: Bot[];
  total: number;
  page: number;
  page_size: number;
}

export interface MiniAppListResponse {
  mini_apps: MiniApp[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================================
// FRONTEND COMPONENT TYPES
// ============================================================================

export interface BotListItemProps {
  bot: Bot;
  onClick: () => void;
  onSettings?: () => void;
}

export interface BotChatProps {
  botId: string;
  botName: string;
  botAvatar?: string;
  initialMessages?: BotMessage[];
  onSendMessage?: (text: string) => void;
  onClose?: () => void;
}

export interface MiniAppContainerProps {
  appId: string;
  url: string;
  botContext?: {
    bot_id: string;
    user_id: string;
    chat_id?: string;
  };
  fullscreen?: boolean;
  onClose?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseBotReturn {
  bot: Bot | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updateBot: (data: UpdateBotRequest) => Promise<void>;
  disableBot: () => Promise<void>;
  enableBot: () => Promise<void>;
  deleteBot: () => Promise<void>;
}

export interface UseBotCommandsReturn {
  commands: BotCommand[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  addCommand: (command: CreateBotCommandRequest) => Promise<void>;
  updateCommands: (commands: CreateBotCommandRequest[]) => Promise<void>;
  deleteCommand: (commandId: string) => Promise<void>;
}

export interface UseUserBotsReturn {
  bots: Bot[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createBot: (data: CreateBotRequest) => Promise<Bot>;
}

export interface UseBotChatsReturn {
  chats: BotChatWithBot[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseMiniAppsReturn {
  miniApps: MiniApp[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createMiniApp: (data: CreateMiniAppRequest) => Promise<MiniApp>;
  updateMiniApp: (id: string, data: UpdateMiniAppRequest) => Promise<void>;
  deleteMiniApp: (id: string) => Promise<void>;
}

export interface UseBotAnalyticsReturn {
  analytics: BotAnalytics[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type ChatFolderItemKind = 'dm' | 'group' | 'channel' | 'bot' | 'mini_app' | 'game';

export interface SystemFolder {
  id: string;
  name: string;
  system_kind: ChatFolderItemKind;
  sort_order: number;
}
