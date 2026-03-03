/**
 * Bot Webhook Handler
 * 
 * Telegram-compatible Bot API for receiving updates from bots.
 * This is a Supabase Edge Function that handles incoming webhook requests.
 */

import { createClient } from '@supabase/supabase-js';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// TYPES (Telegram-compatible)
// ============================================================================

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset?: string;
}

interface TelegramBotCommand {
  command: string;
  description: string;
}

type BotRecord = {
  owner_id?: string;
};

// ============================================================================
// HELPERS
// ============================================================================

function createSuccessResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...(data as Record<string, unknown>) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createErrorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractCommand(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/^\/(\w+)(?:@(\w+))?/);
  return match ? match[1].toLowerCase() : null;
}

async function verifyToken(token: string): Promise<{ botId: string; bot: any } | null> {
  const { data: tokenData, error } = await supabase
    .from('bot_tokens')
    .select('bot_id, bots(*)')
    .eq('token', token)
    .single();

  if (error || !tokenData) {
    return null;
  }

  return {
    botId: tokenData.bot_id,
    bot: tokenData.bots
  };
}

async function findOrCreateBotChat(botId: string, userId: string, chatId?: string) {
  if (!userId) return null;

  // Try to find existing chat
  const { data: existingChat } = await supabase
    .from('bot_chats')
    .select('*')
    .eq('bot_id', botId)
    .eq('user_id', userId)
    .single();

  if (existingChat) {
    await supabase
      .from('bot_chats')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: (existingChat.message_count || 0) + 1
      })
      .eq('id', existingChat.id);
    return existingChat;
  }

  // Create new chat
  const { data: newChat, error } = await supabase
    .from('bot_chats')
    .insert({
      bot_id: botId,
      user_id: userId,
      chat_id: null,
      message_count: 1
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating bot chat:', error);
    return null;
  }

  return newChat;
}

async function resolveProfileIdForTelegramUser(telegramUserId: number): Promise<string | null> {
  const telegramId = String(telegramUserId);

  const { data: crmClient } = await supabase
    .schema('crm')
    .from('clients')
    .select('user_id')
    .eq('telegram_id', telegramId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crmClient?.user_id) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', crmClient.user_id)
    .maybeSingle();

  return profile?.id ?? null;
}

async function storeBotUpdateEvent(input: {
  botId: string;
  direction: 'incoming' | 'outgoing';
  eventType: string;
  telegramChatId?: string;
  telegramMessageId?: string;
  telegramUserId?: number;
  payload: unknown;
}) {
  const { error } = await supabase.from('bot_update_events').insert({
    bot_id: input.botId,
    direction: input.direction,
    event_type: input.eventType,
    telegram_chat_id: input.telegramChatId ?? null,
    telegram_message_id: input.telegramMessageId ?? null,
    telegram_user_id: input.telegramUserId ?? null,
    payload: input.payload,
    processed_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Error storing bot update event:', error);
  }
}

async function processMessage(botId: string, bot: BotRecord, message: TelegramMessage) {
  const chat = message.chat;
  const from = message.from;
  
  // Only process private chats for now
  if (chat.type !== 'private' || !from) {
    return;
  }

  const linkedProfileId = await resolveProfileIdForTelegramUser(from.id);
  const userId = linkedProfileId ?? bot.owner_id ?? null;
  
  // Find or create bot chat
  if (userId) {
    await findOrCreateBotChat(botId, userId, String(chat.id));
  }

  // Extract command if present
  const command = extractCommand(message.text);

  // Store raw incoming update event
  await storeBotUpdateEvent({
    botId,
    direction: 'incoming',
    eventType: 'message',
    telegramChatId: String(chat.id),
    telegramMessageId: String(message.message_id),
    telegramUserId: from.id,
    payload: {
      text: message.text,
      command,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username,
      },
      linked_profile_id: linkedProfileId,
      fallback_owner_profile_id: linkedProfileId ? null : bot.owner_id,
    },
  });

  // Update analytics
  const today = new Date().toISOString().split('T')[0];
  try {
    await supabase.rpc('increment_bot_analytics', {
      p_bot_id: botId,
      p_date: today,
      p_messages_received: 1
    });
  } catch {
    // Ignore RPC errors - analytics table might not exist yet
  }
}

async function processCallbackQuery(botId: string, callback: TelegramCallbackQuery) {
  const from = callback.from;
  const userId = await resolveProfileIdForTelegramUser(from.id);

  // Find bot chat
  if (userId) {
    await findOrCreateBotChat(botId, userId);
  }

  // Store callback query event
  await storeBotUpdateEvent({
    botId,
    direction: 'incoming',
    eventType: 'callback_query',
    telegramChatId: callback.message ? String(callback.message.chat.id) : undefined,
    telegramMessageId: callback.message ? String(callback.message.message_id) : undefined,
    telegramUserId: from.id,
    payload: {
      callback_id: callback.id,
      data: callback.data,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username,
      },
      linked_profile_id: userId,
    },
  });
}

async function processInlineQuery(botId: string, inline: TelegramInlineQuery) {
  const from = inline.from;
  const userId = await resolveProfileIdForTelegramUser(from.id);

  // Find bot chat
  if (userId) {
    await findOrCreateBotChat(botId, userId);
  }

  // Store inline query event
  await storeBotUpdateEvent({
    botId,
    direction: 'incoming',
    eventType: 'inline_query',
    telegramMessageId: inline.id,
    telegramUserId: from.id,
    payload: {
      query: inline.query,
      offset: inline.offset,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username,
      },
      linked_profile_id: userId,
    },
  });
}

// ============================================================================
// BOT API METHODS (Telegram-compatible)
// ============================================================================

async function sendMessage(
  botId: string,
  chatId: string | number,
  text: string,
  options?: {
    parse_mode?: 'Markdown' | 'HTML';
    reply_markup?: object;
    reply_to_message_id?: number;
  }
): Promise<{ message_id: number }> {
  // Store outgoing command as event-log entry
  await storeBotUpdateEvent({
    botId,
    direction: 'outgoing',
    eventType: 'send_message',
    telegramChatId: String(chatId),
    telegramMessageId: `out_${Date.now()}`,
    payload: {
      text,
      options,
    },
  });

  // Update analytics
  const today = new Date().toISOString().split('T')[0];
  try {
    await supabase.rpc('increment_bot_analytics', {
      p_bot_id: botId,
      p_date: today,
      p_messages_sent: 1
    });
  } catch {
    // Best-effort analytics
  }

  return { message_id: Date.now() };
}

async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  options?: {
    url?: string;
    show_alert?: boolean;
  }
): Promise<{ ok: boolean }> {
  // In production, this would send the answer back via Telegram API
  console.log('Answering callback query:', callbackQueryId, text);
  return { ok: true };
}

async function getMyCommands(botId: string): Promise<TelegramBotCommand[]> {
  const { data: commands } = await supabase
    .from('bot_commands')
    .select('command, description')
    .eq('bot_id', botId)
    .eq('language_code', 'en');

  return (commands || []).map(c => ({
    command: c.command,
    description: c.description || ''
  }));
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Bot-Token',
      }
    });
  }

  // Get bot token from header
  const token = req.headers.get('X-Bot-Token') || req.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return createErrorResponse('Bot token required', 401);
  }

  // Verify token and get bot
  const botInfo = await verifyToken(token);
  if (!botInfo) {
    return createErrorResponse('Invalid bot token', 401);
  }

  const { botId, bot } = botInfo;

  // Parse update
  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return createErrorResponse('Invalid JSON', 400);
  }

  if (!update.update_id) {
    return createErrorResponse('Invalid update', 400);
  }

  try {
    // Process update based on type
    if (update.message) {
      await processMessage(botId, bot as BotRecord, update.message);
    } else if (update.callback_query) {
      await processCallbackQuery(botId, update.callback_query);
    } else if (update.inline_query) {
      await processInlineQuery(botId, update.inline_query);
    }

    return createSuccessResponse({
      update_id: update.update_id
    });
  } catch (error) {
    console.error('Error processing update:', error);
    return createErrorResponse('Internal error', 500);
  }
});

// Export for use in other functions
export { sendMessage, answerCallbackQuery, getMyCommands };
