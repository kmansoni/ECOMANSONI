/**
 * Mannoni Bot Protocol v1
 * 
 * Самостоятельный протокол обмена сообщениями с ботами.
 * Не зависит от Telegram API или любых внешних мессенджеров.
 * 
 * Интеграция: https://docs.mannoni.ru/bot-protocol/v1
 */

// ── Типы событий ──────────────────────────────────────────────────

export type BotEventType =
  | 'message'           // Текстовое сообщение от пользователя
  | 'callback'          // Нажатие на inline/reply кнопку
  | 'media'             // Фото, видео, документ, стикер, голос, локация, контакт
  | 'reaction'          // Реакция на сообщение
  | 'member_joined'     // Пользователь добавлен в чат с ботом
  | 'member_left'       // Пользователь удалён из чата
  | 'start'             /start команда
  | 'command'           // Любая /команда
  | 'inline_query'      // Запрос для inline-режима
  | 'chosen_inline'     // Пользователь выбрал inline-результат
  | 'poll_answer'       // Ответ на опрос
  | 'dice'              // Бросок кубика/стрелки
  | 'game'              // Игра
  | 'video_note'        // Видеосообщение
  | 'voice'             // Голосовое сообщение
  | 'location'          // Геолокация
  | 'contact'           // Контакт
  | 'venue'             // Место (геолокация + название)
  | 'invoice'           // Платёжное уведомление
  | 'successful_payment' // Успешная оплата
  | 'my_chat_member'    // Бот добавлен/удалён из чата или изменены права
  | 'chat_join_request' // Запрос на вступление в чат
  | 'chat_boost'        // Подарочный буст чата
  | 'removed_chat_photo' // Удалено фото чата
  | 'new_chat_photo'    // Новое фото чата
  | 'new_chat_title'    // Изменено название чата
  | 'delete_chat_photo' // Удалено фото чата
  | 'pinned_message'    // Закреплено сообщение
  | 'proximity_alert'   // Предупреждение о близости
  | 'group_chat_created' // Создан групповой чат
  | 'supergroup_chat_created' // Создан супергрупповой чат
  | 'channel_chat_created'    // Создан канал
  | 'message_auto_delete_timer_changed' // Изменён таймер автоудаления
  | 'migrate_to_chat_id'  // Чат мигрировал в супергруппу
  | 'migrate_from_chat_id' // Чат мигрировал из супергруппы
  | 'poll'               // Опрос (bot → user)
  | 'typing_start'       // Бот начал печатать
  | 'typing_stop'        // Бот прекратил печатать
  | 'error'              // Ошибка обработки
  | 'fallback'           // Сработал fallback-обработчик
  | 'ai_response'        // Ответ от AI-обработчика
  | 'welcome'            // Первое сообщение нового пользователя
  | 'schedule'           // Триггер по расписанию

// ── Типы ответов бота ────────────────────────────────────────────

export type BotResponseMethod =
  | 'sendMessage'
  | 'sendMedia'
  | 'sendPhoto'
  | 'sendVideo'
  | 'sendDocument'
  | 'sendAudio'
  | 'sendVoice'
  | 'sendVideoNote'
  | 'sendSticker'
  | 'sendAnimation'
  | 'sendLocation'
  | 'sendVenue'
  | 'sendContact'
  | 'sendPoll'
  | 'sendQuiz'
  | 'sendDice'
  | 'sendAction'
  | 'answerCallback'
  | 'answerInlineQuery'
  | 'editMessageText'
  | 'editMessageMedia'
  | 'editMessageReplyMarkup'
  | 'deleteMessage'
  | 'setTyping'
  | 'setChatTitle'
  | 'setChatPhoto'
  | 'deleteChatPhoto'
  | 'pinMessage'
  | 'unpinMessage'
  | 'banMember'
  | 'unbanMember'
  | 'restrictMember'
  | 'promoteMember'
  | 'setChatAdministratorCustomTitle'
  | 'sendChatAction'
  | 'leaveChat'
  | 'getChat'
  | 'getChatAdministrators'
  | 'getChatMembersCount'
  | 'getChatMember'

// ── Интерфейсы протокола ─────────────────────────────────────────

export interface BotInboundEvent {
  /** Уникальный ID события */
  event_id: string;
  /** Временная метка события */
  timestamp: string;
  /** ID бота */
  bot_id: string;
  /** ID пользователя, отправившего событие */
  user_id: string;
  /** ID чата */
  chat_id: string;
  /** Тип события */
  type: BotEventType;
  /** ID сообщения (если применимо) */
  message_id?: string;
  /** Содержимое события */
  content: BotEventContent;
  /** Контекст (данные сессии, переменные) */
  context: BotEventContext;
}

export interface BotEventContent {
  text?: string;
  entities?: BotTextEntity[];
  media_url?: string;
  media_type?: 'photo' | 'video' | 'document' | 'sticker' | 'animation' | 'audio' | 'voice' | 'video_note';
  media_file_id?: string;
  media_caption?: string;
  poll?: BotPoll;
  location?: BotLocation;
  contact?: BotContact;
  venue?: BotVenue;
  callback_data?: string;
  inline_query?: string;
  chosen_inline_result_id?: string;
  reaction?: string;
  dice_value?: number;
  dice_emoji?: string;
  invoice?: BotInvoice;
  successful_payment?: BotSuccessfulPayment;
  forwarded_from?: BotForwardInfo;
  reply_to_message_id?: string;
  new_chat_member?: BotUser;
  left_chat_member?: BotUser;
  new_chat_title?: string;
  new_chat_photo?: string;
  delete_chat_photo?: boolean;
  pinned_message?: BotMessage;
  proximity_alert?: BotProximityAlert;
  voice_chat_scheduled?: BotVoiceChatScheduled;
  voice_chat_ended?: BotVoiceChatEnded;
  voice_chat_participants_invited?: BotVoiceChatParticipantsInvited;
  web_app_data?: BotWebAppData;
  is_automatic_forward?: boolean;
  has_protected_content?: boolean;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  channel_chat_created?: boolean;
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
  connected_website?: string;
  author_signature?: string;
  is_topic_message?: boolean;
  is_automatic_forward?: boolean;
  has_protected_content?: boolean;
  edit_date?: number;
  sender_chat?: BotChat;
}

export interface BotEventContext {
  /** ID пользователя в формате платформы */
  platform_user_id: string;
  /** Имя пользователя */
  first_name: string;
  /** Фамилия (если доступно) */
  last_name?: string;
  /** Username */
  username?: string;
  /** Язык интерфейса */
  language_code?: string;
  /** Premium-подписка */
  is_premium?: boolean;
  /** Платформа */
  platform: 'web' | 'ios' | 'android' | 'desktop';
  /** Переменные сессии */
  session_variables: Record<string, string>;
  /** Текущее состояние диалога */
  session_state: string;
  /** Язык интерфейса бота */
  bot_language: string;
}

export interface BotMessage {
  message_id: number;
  from?: BotUser;
  sender_chat?: BotChat;
  date: number;
  chat: BotChat;
  forward_from?: BotUser;
  forward_from_chat?: BotChat;
  forward_date?: number;
  is_automatic_forward?: boolean;
  reply_to_message?: BotMessage;
  via_bot?: BotUser;
  edit_date?: number;
  media_group_id?: string;
  author_signature?: string;
  text?: string;
  entities?: BotTextEntity[];
  animation?: BotAnimation;
  audio?: BotAudio;
  document?: BotDocument;
  photo?: BotPhotoSize[];
  sticker?: BotSticker;
  video?: BotVideo;
  video_note?: BotVideoNote;
  voice?: BotVoice;
  caption?: string;
  caption_entities?: BotTextEntity[];
  contact?: BotContact;
  dice?: BotDice;
  game?: BotGame;
  poll?: BotPoll;
  venue?: BotVenue;
  location?: BotLocation;
  new_chat_members?: BotUser[];
  left_chat_member?: BotUser;
  new_chat_title?: string;
  new_chat_photo?: BotPhotoSize[];
  delete_chat_photo?: boolean;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  channel_chat_created?: boolean;
  pinned_message?: BotMessage;
  successful_payment?: BotSuccessfulPayment;
  connected_website?: string;
  proximity_alert_triggered?: BotProximityAlert;
}

export interface BotUser {
  id: string;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
  supports_chat_bubbles?: boolean;
}

export interface BotChat {
  id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
  photo?: ChatPhoto;
  active_usernames?: string[];
  emoji_status_custom_emoji_id?: string;
  bio?: string;
  has_private_forwards?: boolean;
  has_restricted_voice_and_video_note_messages?: boolean;
  join_to_send_messages?: boolean;
  join_by_request?: boolean;
  description?: string;
  invite_link?: string;
  pinned_message?: BotMessage;
  permissions?: ChatPermissions;
  slow_mode_delay?: number;
  message_auto_delete_time?: number;
  accent_color?: string;
  background_color?: string;
  available_reactions?: ReactionType[];
}

export interface BotTextEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: BotUser;
  language?: string;
  custom_emoji_id?: string;
}

export interface BotPhotoSize {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface BotAnimation {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumb?: BotPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface BotAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: BotPhotoSize;
}

export interface BotDocument {
  file_id: string;
  file_unique_id: string;
  thumb?: BotPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface BotVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumb?: BotPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface BotVideoNote {
  file_id: string;
  file_unique_id: string;
  length: number;
  duration: number;
  thumb?: BotPhotoSize;
}

export interface BotVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface BotSticker {
  file_id: string;
  file_unique_id: string;
  type: 'regular' | 'mask' | 'custom_emoji';
  width: number;
  height: number;
  is_video?: boolean;
  is_animated?: boolean;
  thumb?: BotPhotoSize;
  emoji?: string;
  set_name?: string;
  mask_position?: MaskPosition;
  custom_emoji_id?: string;
}

export interface BotContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: string;
  vcard?: string;
}

export interface BotLocation {
  longitude: number;
  latitude: number;
  horizontal_accuracy?: number;
  live_period?: number;
  heading?: number;
  proximity_alert_radius?: number;
}

export interface BotVenue {
  location: BotLocation;
  title: string;
  address: string;
  foursquare_id?: string;
  foursquare_type?: string;
  google_place_id?: string;
  google_place_type?: string;
}

export interface BotPoll {
  id: string;
  question: string;
  options: BotPollOption[];
  total_voter_count: number;
  is_closed: boolean;
  is_anonymous: boolean;
  type: 'regular' | 'quiz';
  allows_multiple_answers?: boolean;
  correct_option_id?: number;
  explanation?: string;
  explanation_entities?: BotTextEntity[];
  open_period?: number;
  close_date?: number;
}

export interface BotPollOption {
  text: string;
  voter_count: number;
}

export interface BotDice {
  emoji: string;
  value: number;
}

export interface BotSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  shipping_option_id?: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface BotInvoice {
  title: string;
  description: string;
  payload: string;
  provider_token: string;
  currency: string;
  prices: BotLabeledPrice[];
  max_tip_amount?: number;
  suggested_tip_amounts?: number[];
}

export interface BotLabeledPrice {
  label: string;
  amount: number;
}

export interface BotForwardInfo {
  id: string;
  type: 'user' | 'channel' | 'group' | 'supergroup';
  date: number;
  author_signature?: string;
  sender_name?: string;
}

export interface BotWebAppData {
  data: string;
  button_text: string;
}

export interface BotProximityAlert {
  traveler: BotUser;
  watcher: BotUser;
  distance: number;
}

export interface BotVoiceChatScheduled {
  start_date: number;
}

export interface BotVoiceChatEnded {
  duration: number;
}

export interface BotVoiceChatParticipantsInvited {
  users: BotUser[];
}

export interface ChatPhoto {
  small_file_id: string;
  small_file_unique_id: string;
  big_file_id: string;
  big_file_unique_id: string;
}

export interface ChatPermissions {
  can_send_messages?: boolean;
  can_send_audios?: boolean;
  can_send_documents?: boolean;
  can_send_photos?: boolean;
  can_send_videos?: boolean;
  can_send_video_notes?: boolean;
  can_send_voice_notes?: boolean;
  can_send_polls?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
  can_send_paid_media?: boolean;
  is_paid_member?: boolean;
}

export interface MaskPosition {
  point: string;
  x_shift: number;
  y_shift: number;
  scale: number;
}

export interface ReactionType {
  type: string;
  emoji?: string;
  custom_emoji_id?: string;
}

// ── Outbound (Bot → User) ────────────────────────────────────────

export interface BotOutboundMessage {
  method: BotResponseMethod;
  params: Record<string, unknown>;
  options?: BotSendOptions;
}

export interface BotSendOptions {
  reply_to_message_id?: number;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply;
  parse_mode?: 'Markdown' | 'HTML';
  disable_web_page_preview?: boolean;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: WebAppInfo;
  login_url?: LoginUrl;
  pay?: boolean;
}

export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  is_persistent?: boolean;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
  selective?: boolean;
}

export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
  request_poll?: KeyboardButtonPollType;
  web_app?: WebAppInfo;
}

export interface KeyboardButtonPollType {
  type?: 'quiz' | 'regular' | 'custom_period';
}

export interface WebAppInfo {
  url: string;
}

export interface LoginUrl {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

export interface ForceReply {
  force_reply: true;
  input_field_placeholder?: string;
  selective?: boolean;
}

// ── Inline Mode ──────────────────────────────────────────────────

export interface InlineQuery {
  id: string;
  from: BotUser;
  query: string;
  offset: string;
  chat_type?: string;
  location?: BotLocation;
}

export interface ChosenInlineResult {
  result_id: string;
  from: BotUser;
  location?: BotLocation;
  inline_message_id?: string;
  query: string;
}

export interface InlineQueryResult {
  type: 'article' | 'photo' | 'gif' | 'mpeg4_gif' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'venue' | 'contact' | 'game' | 'sticker';
  id: string;
  title?: string;
  input_message_content?: InputTextMessageContent;
  reply_markup?: InlineKeyboardMarkup;
  url?: string;
  description?: string;
  thumb_url?: string;
}

export interface InputTextMessageContent {
  message_text: string;
  parse_mode?: 'Markdown' | 'HTML';
  disable_web_page_preview?: boolean;
}

// ── Payment ──────────────────────────────────────────────────────

export interface BotPayment {
  invoice: BotInvoice;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed' | 'processing';
  paid_at?: string;
  refund_at?: string;
  transaction_id?: string;
}