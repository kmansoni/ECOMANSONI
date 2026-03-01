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
  // Try to find existing chat
  const { data: existingChat } = await supabase
    .from('bot_chats')
    .select('*')
    .eq('bot_id', botId)
    .eq('user_id', userId)
    .single();

  if (existingChat) {
    // Update chat_id if provided and different
    if (chatId && existingChat.chat_id !== chatId) {
      await supabase
        .from('bot_chats')
        .update({ 
          chat_id: chatId,
          last_message_at: new Date().toISOString(),
          message_count: existingChat.message_count + 1
        })
        .eq('id', existingChat.id);
    }
    return existingChat;
  }

  // Create new chat
  const { data: newChat, error } = await supabase
    .from('bot_chats')
    .insert({
      bot_id: botId,
      user_id: userId,
      chat_id: chatId,
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

async function processMessage(botId: string, message: TelegramMessage) {
  const chat = message.chat;
  const from = message.from;
  
  // Only process private chats for now
  if (chat.type !== 'private' || !from) {
    return;
  }

  // Map Telegram user ID to platform user
  // This is a placeholder - in production, you'd need to link Telegram users to platform users
  const userId = `telegram_${from.id}`;
  
  // Find or create bot chat
  await findOrCreateBotChat(botId, userId, `tg_${chat.id}`);

  // Extract command if present
  const command = extractCommand(message.text);

  // Store the message
  await supabase.from('bot_messages').insert({
    bot_id: botId,
    chat_id: `tg_${chat.id}`, // Would reference actual chat in production
    message_id: `tg_${message.message_id}`,
    direction: 'incoming',
    raw_update: {
      update_type: 'message',
      text: message.text,
      command: command,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username
      }
    },
    processed_at: new Date().toISOString()
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
  const userId = `telegram_${from.id}`;

  // Find bot chat
  await findOrCreateBotChat(botId, userId);

  // Store callback query
  await supabase.from('bot_messages').insert({
    bot_id: botId,
    chat_id: callback.message ? `tg_${callback.message.chat.id}` : 'unknown',
    message_id: callback.message ? `tg_${callback.message.message_id}` : 'unknown',
    direction: 'incoming',
    raw_update: {
      update_type: 'callback_query',
      callback_id: callback.id,
      data: callback.data,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username
      }
    },
    processed_at: new Date().toISOString()
  });
}

async function processInlineQuery(botId: string, inline: TelegramInlineQuery) {
  const from = inline.from;
  const userId = `telegram_${from.id}`;

  // Find bot chat
  await findOrCreateBotChat(botId, userId);

  // Store inline query
  await supabase.from('bot_messages').insert({
    bot_id: botId,
    chat_id: 'inline',
    message_id: inline.id,
    direction: 'incoming',
    raw_update: {
      update_type: 'inline_query',
      query: inline.query,
      offset: inline.offset,
      from: {
        id: from.id,
        first_name: from.first_name,
        username: from.username
      }
    },
    processed_at: new Date().toISOString()
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
  // Store outgoing message
  const messageId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await supabase.from('bot_messages').insert({
    bot_id: botId,
    chat_id: String(chatId),
    message_id: messageId,
    direction: 'outgoing',
    raw_update: {
      update_type: 'send_message',
      text,
      options
    },
    processed_at: new Date().toISOString()
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

  // Update bot chat message count
  await supabase
    .from('bot_chats')
    .update({ 
      last_message_at: new Date().toISOString()
    })
    .eq('bot_id', botId)
    .like('chat_id', `%${chatId}%`);

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
      await processMessage(botId, update.message);
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
