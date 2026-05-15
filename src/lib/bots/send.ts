/**
 * Bot Engine — Message Sender & Delivery
 *
 * Отправляет сообщения от бота в чат через собственный протокол.
 * Не зависит от Telegram API.
 */

import { supabase } from '@/integrations/supabase/client';

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface BotOutboundPayload {
  method: string;
  params: Record<string, unknown>;
  options?: {
    reply_to_message_id?: string;
    disable_notification?: boolean;
    parse_mode?: 'markdown' | 'html';
  };
}

/**
 * Отправляет сообщение от бота в чат
 */
export async function sendBotMessage(
  botId: string,
  chatId: string,
  payload: BotOutboundPayload
): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'No auth user' };

    const { data: bot } = await supabase
      .from('bots')
      .select('id, owner_id')
      .eq('id', botId)
      .single();

    if (!bot || bot.owner_id !== user.id) {
      return { ok: false, error: 'Bot not found or access denied' };
    }

    let content: Record<string, unknown> = {};
    let contentType = 'text';

    switch (payload.method) {
      case 'sendMessage':
        content = { text: payload.params.text };
        contentType = 'text';
        break;
      case 'sendPhoto':
        content = { media_url: payload.params.photo, caption: payload.params.caption };
        contentType = 'media';
        break;
      case 'sendVideo':
        content = { media_url: payload.params.video, caption: payload.params.caption };
        contentType = 'video';
        break;
      case 'sendDocument':
        content = { media_url: payload.params.document, caption: payload.params.caption };
        contentType = 'document';
        break;
      case 'sendAudio':
        content = { media_url: payload.params.audio, caption: payload.params.caption };
        contentType = 'audio';
        break;
      case 'sendVoice':
        content = { media_url: payload.params.voice, caption: payload.params.caption };
        contentType = 'voice';
        break;
      case 'sendVideoNote':
        content = { media_url: payload.params.video_note };
        contentType = 'video_note';
        break;
      case 'sendAnimation':
        content = { media_url: payload.params.animation, caption: payload.params.caption };
        contentType = 'animation';
        break;
      case 'sendSticker':
        content = { sticker_id: payload.params.sticker };
        contentType = 'sticker';
        break;
      case 'sendPoll':
        content = {
          question: payload.params.question,
          options: payload.params.options,
          is_anonymous: payload.params.is_anonymous,
          type: payload.params.type || 'regular',
          allows_multiple_answers: payload.params.allows_multiple_answers,
          correct_option_id: payload.params.correct_option_id,
          explanation: payload.params.explanation,
          open_period: payload.params.open_period,
          close_date: payload.params.close_date,
          is_closed: payload.params.is_closed,
        };
        contentType = 'poll';
        break;
      case 'sendLocation':
        content = {
          latitude: payload.params.latitude,
          longitude: payload.params.longitude,
          horizontal_accuracy: payload.params.horizontal_accuracy,
          live_period: payload.params.live_period,
          heading: payload.params.heading,
          proximity_alert_radius: payload.params.proximity_alert_radius,
        };
        contentType = 'location';
        break;
      case 'sendVenue':
        content = {
          latitude: payload.params.latitude,
          longitude: payload.params.longitude,
          title: payload.params.title,
          address: payload.params.address,
          foursquare_id: payload.params.foursquare_id,
          foursquare_type: payload.params.foursquare_type,
          google_place_id: payload.params.google_place_id,
          google_place_type: payload.params.google_place_type,
        };
        contentType = 'venue';
        break;
      case 'sendContact':
        content = {
          phone_number: payload.params.phone_number,
          first_name: payload.params.first_name,
          last_name: payload.params.last_name,
          user_id: payload.params.user_id,
          vcard: payload.params.vcard,
        };
        contentType = 'contact';
        break;
      case 'sendAction':
        content = { action: payload.params.action };
        contentType = 'action';
        break;
      case 'answerCallback':
        content = { text: payload.params.text, show_alert: payload.params.show_alert };
        contentType = 'callback_answer';
        break;
      case 'answerInlineQuery':
        content = {
          inline_query_id: payload.params.inline_query_id,
          results: payload.params.results,
          cache_time: payload.params.cache_time,
          is_personal: payload.params.is_personal,
          next_offset: payload.params.next_offset,
        };
        contentType = 'inline_query_answer';
        break;
      case 'editMessageText':
        content = {
          message_id: payload.params.message_id,
          text: payload.params.text,
          parse_mode: payload.params.parse_mode,
          disable_web_page_preview: payload.params.disable_web_page_preview,
          reply_markup: payload.params.reply_markup,
        };
        contentType = 'edit_message';
        break;
      case 'editMessageMedia':
        content = {
          message_id: payload.params.message_id,
          media: payload.params.media,
          reply_markup: payload.params.reply_markup,
        };
        contentType = 'edit_message';
        break;
      case 'editMessageReplyMarkup':
        content = {
          message_id: payload.params.message_id,
          reply_markup: payload.params.reply_markup,
        };
        contentType = 'edit_message';
        break;
      case 'deleteMessage':
        content = { message_id: payload.params.message_id };
        contentType = 'delete_message';
        break;
      case 'setTyping':
        content = { action: payload.params.action };
        contentType = 'typing';
        break;
      case 'pinMessage':
        content = { message_id: payload.params.message_id, disable_notification: payload.params.disable_notification };
        contentType = 'pin';
        break;
      case 'unpinMessage':
        content = { message_id: payload.params.message_id };
        contentType = 'unpin';
        break;
      case 'leaveChat':
      case 'getChat':
      case 'getChatAdministrators':
      case 'getChatMembersCount':
      case 'getChatMember':
      case 'promoteMember':
      case 'restrictMember':
      case 'banMember':
      case 'unbanMember':
      case 'setChatAdministratorCustomTitle':
      case 'setChatTitle':
      case 'setChatPhoto':
      case 'deleteChatPhoto':
      case 'chat_boost':
        content = payload.params as Record<string, unknown>;
        contentType = payload.method;
        break;
      default:
        content = { text: `[Unsupported method: ${payload.method}]` };
    }

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: chatId,
        sender_id: user.id,
        sender_type: 'bot',
        bot_id: botId,
        content_type: contentType,
        content: content as any,
        metadata: {
          bot_method: payload.method,
          bot_params: payload.params,
          bot_options: payload.options,
        },
      })
      .select('id')
      .single();

    if (msgError) return { ok: false, error: msgError.message };

    await supabase.from('bot_messages').insert({
      bot_id: botId,
      chat_id: chatId,
      message_id: message.id,
      direction: 'outgoing',
      raw_update: payload,
    });

    await supabase.rpc('increment_bot_analytics', {
      p_bot_id: botId,
      p_date: new Date().toISOString().split('T')[0],
      p_messages_sent: 1,
    }).catch(() => {});

    return { ok: true, message_id: message.id };
  } catch (error: any) {
    console.error('[bot-sender] Error:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Отправка списка сообщений (batch)
 */
export async function sendBotMessagesBatch(
  botId: string,
  messages: Array<{ chatId: string; payload: BotOutboundPayload }>
): Promise<{ ok: boolean; results: Array<{ chatId: string; ok: boolean; error?: string }> }> {
  const results = await Promise.all(
    messages.map(async (msg) => {
      const result = await sendBotMessage(botId, msg.chatId, msg.payload);
      return { chatId: msg.chatId, ...result };
    })
  );

  const allOk = results.every(r => r.ok);
  return { ok: allOk, results };
}

/**
 * Получение ответа от пользователя (ожидание следующего сообщения)
 */
export async function waitForUserMessage(
  botId: string,
  chatId: string,
  timeoutMs: number = 60000
): Promise<{ ok: boolean; content?: Record<string, unknown>; error?: string }> {
  return new Promise((resolve) => {
    const channel = supabase.channel(`bot-wait:${chatId}`);

    const timeout = setTimeout(() => {
      channel.unsubscribe();
      resolve({ ok: false, error: 'Timeout waiting for user response' });
    }, timeoutMs);

    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${chatId}`,
      })
      .subscribe(async (payload) => {
        if (payload.new.sender_type === 'bot' && payload.new.bot_id === botId) return;

        clearTimeout(timeout);
        await channel.unsubscribe();

        resolve({
          ok: true,
          content: {
            text: payload.new.content?.text,
            media_url: payload.new.content?.media_url,
            content_type: payload.new.content_type,
          },
        });
      });
  });
}

/**
 * Типизированные методы отправки для удобства
 */
export const BotSend = {
  text: (botId: string, chatId: string, text: string, options?: BotOutboundPayload['options']) =>
    sendBotMessage(botId, chatId, { method: 'sendMessage', params: { text }, options }),

  photo: (botId: string, chatId: string, photoUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendPhoto', params: { photo: photoUrl, caption } }),

  video: (botId: string, chatId: string, videoUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendVideo', params: { video: videoUrl, caption } }),

  document: (botId: string, chatId: string, documentUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendDocument', params: { document: documentUrl, caption } }),

  audio: (botId: string, chatId: string, audioUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendAudio', params: { audio: audioUrl, caption } }),

  voice: (botId: string, chatId: string, voiceUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendVoice', params: { voice: voiceUrl, caption } }),

  videoNote: (botId: string, chatId: string, videoNoteUrl: string) =>
    sendBotMessage(botId, chatId, { method: 'sendVideoNote', params: { video_note: videoNoteUrl } }),

  animation: (botId: string, chatId: string, animationUrl: string, caption?: string) =>
    sendBotMessage(botId, chatId, { method: 'sendAnimation', params: { animation: animationUrl, caption } }),

  sticker: (botId: string, chatId: string, stickerId: string) =>
    sendBotMessage(botId, chatId, { method: 'sendSticker', params: { sticker: stickerId } }),

  poll: (botId: string, chatId: string, question: string, options: string[], opts?: {
    is_anonymous?: boolean;
    type?: 'regular' | 'quiz';
    correct_option_id?: number;
    allows_multiple_answers?: boolean;
    explanation?: string;
    open_period?: number;
    close_date?: number;
    is_closed?: boolean;
    members_only?: boolean;
    country_codes?: string[];
    allows_revoting?: boolean;
    shuffle_ones?: boolean;
    allow_adding_options?: boolean;
    hide_results_until_closed?: boolean;
    description?: string;
    description_parse_mode?: 'Markdown' | 'HTML';
  }) =>
    sendBotMessage(botId, chatId, {
      method: 'sendPoll',
      params: {
        question,
        options,
        is_anonymous: opts?.is_anonymous ?? true,
        type: opts?.type ?? 'regular',
        ...opts,
      },
    }),

  location: (botId: string, chatId: string, latitude: number, longitude: number, opts?: {
    horizontal_accuracy?: number;
    live_period?: number;
    heading?: number;
    proximity_alert_radius?: number;
  }) =>
    sendBotMessage(botId, chatId, {
      method: 'sendLocation',
      params: { latitude, longitude, ...opts },
    }),

  venue: (botId: string, chatId: string, opts: {
    latitude: number;
    longitude: number;
    title: string;
    address: string;
    foursquare_id?: string;
    foursquare_type?: string;
    google_place_id?: string;
    google_place_type?: string;
  }) =>
    sendBotMessage(botId, chatId, { method: 'sendVenue', params: opts }),

  contact: (botId: string, chatId: string, opts: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: string;
    vcard?: string;
  }) =>
    sendBotMessage(botId, chatId, { method: 'sendContact', params: opts }),

  typing: (botId: string, chatId: string) =>
    sendBotMessage(botId, chatId, { method: 'sendAction', params: { action: 'typing' } }),

  answerCallback: (callbackQueryId: string, text?: string, showAlert?: boolean, url?: string) =>
    sendBotMessage('0', '', {
      method: 'answerCallback',
      params: { callback_query_id: callbackQueryId, text, show_alert: showAlert, url },
    }),

  answerInlineQuery: (inlineQueryId: string, results: InlineQueryResult[], opts?: {
    cache_time?: number;
    is_personal?: boolean;
    next_offset?: string;
    button?: WebAppInfo;
  }) =>
    sendBotMessage('0', '', {
      method: 'answerInlineQuery',
      params: { inline_query_id: inlineQueryId, results, ...opts },
    }),

  editMessageText: (messageId: number, text: string, opts?: {
    parse_mode?: 'Markdown' | 'HTML';
    disable_web_page_preview?: boolean;
    reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply;
  }) =>
    sendBotMessage('0', '', {
      method: 'editMessageText',
      params: { message_id: messageId, text, ...opts },
    }),

  editMessageMedia: (messageId: number, media: string, opts?: {
    reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup;
  }) =>
    sendBotMessage('0', '', {
      method: 'editMessageMedia',
      params: { message_id: messageId, media, ...opts },
    }),

  editMessageReplyMarkup: (messageId: number, reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup) =>
    sendBotMessage('0', '', {
      method: 'editMessageReplyMarkup',
      params: { message_id: messageId, reply_markup },
    }),

  deleteMessage: (messageId: number) =>
    sendBotMessage('0', '', {
      method: 'deleteMessage',
      params: { message_id: messageId },
    }),

  pinMessage: (messageId: number, disableNotification?: boolean) =>
    sendBotMessage('0', '', {
      method: 'pinMessage',
      params: { message_id: messageId, disable_notification: disableNotification },
    }),

  unpinMessage: (messageId: number) =>
    sendBotMessage('0', '', {
      method: 'unpinMessage',
      params: { message_id: messageId },
    }),

  leaveChat: (chatId: string) =>
    sendBotMessage('0', '', {
      method: 'leaveChat',
      params: { chat_id: chatId },
    }),

  setChatTitle: (chatId: string, title: string) =>
    sendBotMessage('0', '', {
      method: 'setChatTitle',
      params: { chat_id: chatId, title },
    }),
};