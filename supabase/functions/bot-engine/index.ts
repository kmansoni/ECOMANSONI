/**
 * Bot Engine — Event Router & Handler Executor
 *
 * Ядро системы ботов. Принимает входящие события, находит подходящие
 * обработчики и формирует ответы. Никаких внешних API.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type {
  BotInboundEvent,
  BotOutboundMessage,
  BotEventType,
  BotEventContent,
  BotEventContext,
  InlineQueryResult,
} from '@/lib/bots/protocol';
import type { BotHandler, BotSession, BotKeyboard, BotConversationState } from '@/lib/bots/types';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Context helper ──────────────────────────────────────────────

function makeContext(session: BotSession, event: BotInboundEvent, bot: any): BotEventContext {
  return {
    platform_user_id: event.user_id,
    first_name: event.content.text?.split(' ')[0] || '',
    language_code: event.content.text ? 'ru' : 'en',
    platform: 'web',
    session_variables: session.variables ?? {},
    session_state: session.state ?? 'idle',
    bot_language: bot.language_code ?? 'ru',
  };
}

// ============================================================================
// EVENT VALIDATION
// ============================================================================

function validateEvent(event: unknown): event is BotInboundEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.event_id === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.bot_id === 'string' &&
    typeof e.user_id === 'string' &&
    typeof e.chat_id === 'string' &&
    typeof e.type === 'string' &&
    typeof e.content === 'object'
  );
}

// ============================================================================
// BOT DISCOVERY
// ============================================================================

async function getBotById(botId: string) {
  const { data, error } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;
  return data;
}

async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, username')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

// ============================================================================
// INLINE MODE HANDLING
// ============================================================================

async function handleInlineQuery(inlineQuery: {
  id: string;
  from: { id: string; first_name?: string; username?: string };
  query: string;
  offset?: string;
}, botId: string): Promise<Response> {
  const handlers = await loadHandlers(botId);
  const queryHandlers = handlers.filter(h => h.trigger_type === 'inline_query');

  let matchedHandler: BotHandler | null = null;

  for (const handler of queryHandlers) {
    if (!handler.is_active) continue;
    if (handler.trigger_type === 'inline_query') {
      const keywords = (handler.trigger_value ?? '').split(',').map(k => k.trim().toLowerCase());
      if (keywords.some((k: string) => inlineQuery.query.toLowerCase().includes(k))) {
        matchedHandler = handler;
        break;
      }
    }
  }

  if (!matchedHandler) {
    matchedHandler = handlers.find(h => h.trigger_type === 'ai' && h.is_active) || null;
  }

  if (!matchedHandler) {
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await getOrCreateSession(botId, inlineQuery.from.id, `inline_${botId}_${inlineQuery.from.id}`);
  const response = buildResponse(matchedHandler.response_content);
  const results: InlineQueryResult[] = [];

  if (response.method === 'answerInlineQuery' && response.params.results) {
    return new Response(JSON.stringify({
      ok: true,
      result: response.params.results,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (response.params.text) {
    results.push({
      type: 'article',
      id: `inline_${Date.now()}_${crypto.randomUUID()}`,
      title: matchedHandler.name,
      input_message_content: {
        message_text: response.params.text,
      },
      reply_markup: response.params.reply_markup as any,
    });
  }

  return new Response(JSON.stringify({ ok: true, result: results, cache_time: response.params.cache_time || 300 }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  from: { id: string; first_name?: string };
  message?: { message_id: number; chat: { id: number | string } };
  data?: string;
}, botId: string): Promise<Response> {
  const handlers = await loadHandlers(botId);

  let matchedHandler: BotHandler | null = null;

  for (const handler of handlers) {
    if (!handler.is_active || handler.trigger_type !== 'callback') continue;
    if (handler.trigger_value === callbackQuery.data) {
      matchedHandler = handler;
      break;
    }
  }

  if (!matchedHandler) {
    matchedHandler = handlers.find(h => h.trigger_type === 'ai' && h.is_active) || null;
  }

  if (!matchedHandler) {
    return new Response(JSON.stringify({
      ok: true,
      result: { text: 'No handler found for this callback', show_alert: false },
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const userId = String(callbackQuery.from.id);
  const chatId = callbackQuery.message?.chat.id
    ? String(callbackQuery.message.chat.id)
    : `callback_${botId}_${userId}`;

  const event: BotInboundEvent = {
    event_id: `callback_${Date.now()}_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    bot_id: botId,
    user_id: userId,
    chat_id: chatId,
    type: 'callback',
    content: {
      callback_data: callbackQuery.data,
      message_id: callbackQuery.message?.message_id,
    },
    context: {
      platform_user_id: userId,
      first_name: callbackQuery.from.first_name || '',
      platform: 'web',
      session_variables: {},
      session_state: 'idle',
      bot_language: 'ru',
    },
  };

  const result = await processHandlerMatch(matchedHandler, event, { id: botId, owner_id: '' });

  return new Response(JSON.stringify({
    ok: true,
    result: result || { text: 'OK', show_alert: false },
  }), { headers: { 'Content-Type': 'application/json' } });
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

async function getOrCreateSession(botId: string, userId: string, chatId: string): Promise<BotSession> {
   // Try to find existing active session first (fast path)
   const { data: existing } = await supabase
     .from('bot_sessions')
     .select('*')
     .eq('bot_id', botId)
     .eq('user_id', userId)
     .is('expires_at', null)
     .single();

   if (existing) {
     // Touch the session to keep it alive
     const { data: updated } = await supabase
       .from('bot_sessions')
       .update({ updated_at: new Date().toISOString() })
       .eq('id', existing.id)
       .select()
       .single();

     return updated ?? existing;
   }

   // Upsert to handle race condition where two concurrent requests
   // both find no existing session and try to create one.
   // The unique index idx_bot_sessions_unique_active will prevent duplicates.
   const { data: session, error } = await supabase
     .from('bot_sessions')
     .insert({
       bot_id: botId,
       user_id: userId,
       conversation_id: chatId,
       state: 'idle',
       context: { started_at: new Date().toISOString() },
       variables: {},
     })
     .select()
     .single();

   if (error && error.code === '23505') {
     // Unique violation — another request created the session first.
     // Recursively retry (will hit the fast path on second call).
     return getOrCreateSession(botId, userId, chatId);
   }

   return session;
 }

/**
 * Atomic update session variables — prevents race conditions
 * on concurrent requests by using Supabase's update ... || merge semantics.
 */
async function updateSessionVariables(sessionId: string, updates: Record<string, string>) {
  // Use rpc for atomic merge to avoid read-then-write race condition
  const { data: session, error } = await supabase.rpc('atomic_update_session_vars', {
    p_session_id: sessionId,
    p_vars: updates,
  });

  if (error) {
    // Fallback: original read-then-write approach
    console.warn('[bot-engine] atomic_update_session_vars failed, falling back:', error.message);
    const { data: s } = await supabase
      .from('bot_sessions')
      .select('variables')
      .eq('id', sessionId)
      .single();

    const current = s?.variables ?? {};
    const next = { ...current, ...updates, updated_at: new Date().toISOString() };

    await supabase
      .from('bot_sessions')
      .update({ variables: next })
      .eq('id', sessionId);

    return next;
  }

  return session;
}

// ============================================================================
// HANDLER ENGINE
// ============================================================================

async function loadHandlers(botId: string): Promise<BotHandler[]> {
  const { data, error } = await supabase
    .from('bot_handlers')
    .select('*')
    .eq('bot_id', botId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) return [];
  return data;
}

/**
 * Проверяет совпадение trigger обработчика с входящим событием
 */
function matchesTrigger(handler: BotHandler, event: BotInboundEvent): boolean {
  switch (handler.trigger_type) {
    case 'keyword':
      if (event.type !== 'message' || !event.content.text) return false;
      const text = event.content.text.toLowerCase();
      const keywords = (handler.trigger_value ?? '').split(',').map(k => k.trim().toLowerCase());
      return keywords.some(k => text.includes(k));

    case 'command':
      if (event.type !== 'command') return false;
      const commands = (handler.trigger_value ?? '').split(',').map(c => c.trim().toLowerCase().replace(/^\//, ''));
      return commands.includes((event.content.text ?? '').replace(/^\//, '').split(' ')[0].toLowerCase());

    case 'callback':
      if (event.type !== 'callback') return false;
      return event.content.callback_data === handler.trigger_value;

    case 'regex':
      if (event.type !== 'message' || !event.content.text) return false;
      try {
        const regex = new RegExp(handler.trigger_value ?? '');
        return regex.test(event.content.text);
      } catch {
        return false;
      }

    case 'welcome':
      if (event.type !== 'member_joined') return false;
      return isNewMember(event.bot_id, event.user_id);

    case 'fallback':
      return true;

    case 'media':
      if (event.type !== 'media') return false;
      if (!handler.trigger_value) return true;
      return event.content.media_type === handler.trigger_value;

    case 'reaction':
      return event.type === 'reaction';

    case 'member_joined':
      return event.type === 'member_joined';

    case 'member_left':
      return event.type === 'member_left';

    case 'schedule':
      if (event.type !== 'schedule') return false;
      return matchesCron(handler.trigger_value ?? '');

    case 'ai':
      return true;

    default:
      return false;
  }
}

/**
 * Проверяет дополнительные условия обработчика
 */
async function checkConditions(handler: BotHandler, session: BotSession): Promise<boolean> {
  if (!handler.conditions || handler.conditions.length === 0) return true;

  const vars = session.variables ?? {};

  for (const condition of handler.conditions) {
    const { variable, operator, value } = condition;
    const actual = vars[variable];

    if (actual === undefined) return false;

    switch (operator) {
      case 'equals':
        if (actual !== value) return false;
        break;
      case 'not_equals':
        if (actual === value) return false;
        break;
      case 'contains':
        if (!actual.includes(value)) return false;
        break;
      case 'greater_than':
        if (Number(actual) <= Number(value)) return false;
        break;
      case 'less_than':
        if (Number(actual) >= Number(value)) return false;
        break;
      case 'exists':
        if (!actual) return false;
        break;
      case 'not_exists':
        if (actual) return false;
        break;
    }
  }

  return true;
}

/**
 * Формирует исходящее сообщение на основе response_content обработчика
 */
function buildResponse(response: Record<string, unknown>): BotOutboundMessage {
  const method = response.method as BotResponseMethod;
  const params: Record<string, unknown> = {};

  switch (method) {
    case 'sendMessage':
      params.text = interpolate(response.text as string ?? '', sessionVariables);
      if (response.parse_mode) params.parse_mode = response.parse_mode;
      if (response.reply_markup) params.reply_markup = response.reply_markup;
      break;

    case 'sendPhoto':
      params.photo = response.photo_url;
      params.caption = interpolate(response.caption as string ?? '', sessionVariables);
      break;

    case 'sendKeyboard':
      params.text = interpolate(response.text as string ?? '', sessionVariables);
      params.reply_markup = { inline_keyboard: response.buttons ?? [] };
      break;

    case 'sendPoll':
      params.question = interpolate(response.question as string ?? '', sessionVariables);
      params.options = response.options ?? [];
      params.is_anonymous = response.is_anonymous ?? true;
      break;

    case 'answerCallback':
      params.text = interpolate(response.text as string ?? '', sessionVariables);
      params.show_alert = response.show_alert ?? false;
      break;

    case 'answerInlineQuery':
      params.inline_query_id = response.inline_query_id;
      params.results = response.results ?? [];
      params.cache_time = response.cache_time ?? 300;
      params.is_personal = response.is_personal ?? false;
      break;

    case 'sendGuestMessage':
      params.guest_query_id = response.guest_query_id;
      params.text = interpolate(response.text as string ?? '', sessionVariables);
      if (response.media_url) params.media_url = response.media_url;
      if (response.media_type) params.media_type = response.media_type;
      break;

    case 'sendBotToBotMessage':
      params.to_bot_id = response.to_bot_id;
      params.content = interpolate(response.content as string ?? '', sessionVariables);
      params.type = response.type ?? 'direct';
      params.session_id = response.session_id;
      if (response.media_url) params.media_url = response.media_url;
      if (response.media_type) params.media_type = response.media_type;
      if (response.reply_to_message_id) params.reply_to_message_id = response.reply_to_message_id;
      break;

    default:
      params.text = interpolate(response.text as string ?? '', sessionVariables);
  }

  return { method, params, options: {} };
}

// Variable interpolation cache
let sessionVariables: Record<string, string> = {};

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}

async function isNewMember(botId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('id')
    .eq('bot_id', botId)
    .eq('user_id', userId)
    .is('expires_at', null);

  if (error) return true;
  return (data ?? []).length === 0;
}

function matchesCron(expression: string): boolean {
  const now = new Date();
  const parts = expression.split(' ');
  if (parts.length !== 5) return false;

  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (min !== '*' && Number(min) !== now.getMinutes()) return false;
  if (hour !== '*' && Number(hour) !== now.getHours()) return false;
  if (dayOfMonth !== '*' && Number(dayOfMonth) !== now.getDate()) return false;
  if (month !== '*' && Number(month) !== now.getMonth() + 1) return false;
  if (dayOfWeek !== '*' && Number(dayOfWeek) !== now.getDay()) return false;

  return true;
}

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

async function saveFailedEvent(botId: string, event: BotInboundEvent, error: string): Promise<void> {
  try {
    await supabase.from('bot_failed_events').insert({
      bot_id: botId,
      event_payload: event as unknown as Record<string, unknown>,
      error_message: error,
      retry_count: 0,
      max_retries: 3,
      next_retry_at: new Date(Date.now() + 60000).toISOString(),
      status: 'pending',
    });
  } catch (e: any) {
    console.error('[bot-engine] Failed to save dead letter event:', e.message);
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

async function checkRateLimit(botId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from('bot_runs')
    .select('*', { count: 'exact', headOnly: true })
    .eq('bot_id', botId)
    .gte('created_at', windowStart);

  if (error) return true;
  return (count || 0) < RATE_LIMIT_MAX_REQUESTS;
}

// ============================================================================
// DELIVER MESSAGE WITH RETRY
// ============================================================================

async function deliverMessageWithRetry(chatId: string, botId: string, response: BotOutboundMessage, event: BotInboundEvent, maxRetries: number = 3): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deliverMessage(chatId, botId, response, event);
      return;
    } catch (e: any) {
      lastError = e;
      console.error(`[bot-engine] deliverMessage attempt ${attempt}/${maxRetries} failed:`, e.message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  console.error('[bot-engine] All delivery retries exhausted, saving to DLQ');
  await saveFailedEvent(botId, event, lastError?.message || 'Unknown delivery error');
}

async function routeEvent(rawEvent: unknown): Promise<BotOutboundMessage | null> {
  if (!validateEvent(rawEvent)) {
    console.error('[bot-engine] Invalid event format');
    return null;
  }

  const event = rawEvent as BotInboundEvent;

  const bot = await getBotById(event.bot_id);
  if (!bot) {
    console.error(`[bot-engine] Bot not found or inactive: ${event.bot_id}`);
    return null;
  }

  const allowed = await checkRateLimit(event.bot_id);
  if (!allowed) {
    console.error(`[bot-engine] Rate limit exceeded for bot ${event.bot_id}`);
    await saveFailedEvent(event.bot_id, event, 'Rate limit exceeded');
    return null;
  }

// Clean up orphaned sessions once per hour
  const isCleanupHour = Date.now() % (60 * 60 * 1000) < 30000;
  if (isCleanupHour) {
    const { data: cleaned } = await supabase.rpc('cleanup_orphaned_sessions');
    console.log(`[bot-engine] Cleaned ${cleaned ?? 0} orphaned sessions`);
  }

  const session = await getOrCreateSession(event.bot_id, event.user_id, event.chat_id);
  const handlers = await loadHandlers(event.bot_id);
  if (handlers.length === 0) {
    console.log(`[bot-engine] No handlers configured for bot ${event.bot_id}`);
    return null;
  }

  let matchedHandler: BotHandler | null = null;
  for (const handler of handlers) {
    if (!matchesTrigger(handler, event)) continue;
    if (!(await checkConditions(handler, session))) continue;
    matchedHandler = handler;
    break;
  }

  if (!matchedHandler) {
    console.log(`[bot-engine] No handler matched for event type: ${event.type}`);
    return null;
  }

const newVars: Record<string, string> = {};
  if (event.content.text) newVars.last_message = event.content.text;
  newVars.last_event_type = event.type;
  newVars.last_handler = matchedHandler.name;
  newVars.session_state = matchedHandler.name;
  await updateSessionVariables(session.id, newVars);

  sessionVariables = session.variables ?? {};
  const response = buildResponse(matchedHandler.response_content);

  const startTime = Date.now();
  await supabase.from('bot_runs').insert({
    bot_id: event.bot_id,
    session_id: session.id,
    trigger_type: event.type,
    trigger_value: matchedHandler.trigger_value,
    input_payload: event.content,
    handler_id: matchedHandler.id,
    handler_name: matchedHandler.name,
    response_method: response.method,
    response_payload: response.params,
    status: 'completed',
    duration_ms: Date.now() - startTime,
  });

  const deliveryMethods = ['sendMessage', 'sendPhoto', 'sendVideo', 'sendDocument', 'sendSticker', 'sendPoll', 'sendLocation', 'sendAction'];
  if (deliveryMethods.includes(response.method)) {
    await deliverMessageWithRetry(event.chat_id, event.bot_id, response, event);
  }
  if (response.method === 'sendGuestMessage') {
    await deliverGuestMessageWithRetry(event.bot_id, response, event);
  }
  if (response.method === 'sendBotToBotMessage') {
    await deliverBotToBotMessage(event.bot_id, response, event);
  }

  return response;
}

/**
 * Реальная доставка сообщения бота в чат через таблицу messages.
 * Использует service role для обхода RLS (бот — системный участник).
 * Throws on failure so retry logic works.
 */
async function deliverMessage(chatId: string, botId: string, response: BotOutboundMessage, event: BotInboundEvent): Promise<void> {
  const { method, params, options } = response;

  let contentType = 'text';
  let content: Record<string, unknown> = {};

  switch (method) {
    case 'sendMessage':
      content = { text: params.text };
      contentType = 'text';
      break;
    case 'sendPhoto':
      content = { media_url: params.photo, caption: params.caption };
      contentType = 'media';
      break;
    case 'sendVideo':
      content = { media_url: params.video, caption: params.caption };
      contentType = 'video';
      break;
    case 'sendDocument':
      content = { media_url: params.document, caption: params.caption };
      contentType = 'document';
      break;
    case 'sendSticker':
      content = { sticker_id: params.sticker };
      contentType = 'sticker';
      break;
    case 'sendPoll':
      content = {
        question: params.question,
        options: params.options,
        is_anonymous: params.is_anonymous,
        type: params.type || 'regular',
      };
      contentType = 'poll';
      break;
    case 'sendLocation':
      content = { latitude: params.latitude, longitude: params.longitude };
      contentType = 'location';
      break;
    case 'sendAction':
      content = { action: params.action };
      contentType = 'action';
      break;
    case 'answerCallback':
      content = { text: params.text, show_alert: params.show_alert };
      contentType = 'callback_answer';
      break;
    default:
      content = { text: `[Unsupported method: ${method}]` };
  }

  const { data: bot, error: botError } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (botError) throw new Error(`Failed to get bot owner: ${botError.message}`);

  const botUserId = bot?.owner_id;
  if (!botUserId) throw new Error(`Bot ${botId} has no owner_id`);

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: chatId,
      sender_id: botUserId,
      sender_type: 'bot',
      bot_id: botId,
      content_type: contentType,
      content,
      metadata: {
        bot_method: method,
        bot_params: params,
        bot_options: options,
      },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Message insert failed: ${error.message}`);

  await supabase.from('bot_messages').insert({
    bot_id: botId,
    chat_id: chatId,
    message_id: message.id,
    direction: 'outgoing',
    raw_update: response,
  });

  await supabase.rpc('increment_bot_analytics', {
    p_bot_id: botId,
    p_date: new Date().toISOString().split('T')[0],
    p_messages_sent: 1,
  }).catch(() => {});
}

async function deliverGuestMessage(botId: string, response: BotOutboundMessage): Promise<void> {
  const params = response.params as Record<string, unknown>;
  const guestQueryId = typeof params.guest_query_id === 'string' ? params.guest_query_id : '';
  const text = typeof params.text === 'string' ? params.text : '';
  const mediaUrl = typeof params.media_url === 'string' ? params.media_url : undefined;
  const mediaType = typeof params.media_type === 'string' ? params.media_type : undefined;
  if (!guestQueryId) throw new Error('sendGuestMessage requires guest_query_id');

  const apiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bot-api/bots/${botId}/guest-queries/${guestQueryId}/answer`;
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'X-Service-Role-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    },
    body: JSON.stringify({ text, media_url: mediaUrl, media_type: mediaType }),
  });

  if (!resp.ok) {
    const payload = await resp.json().catch(() => null);
    throw new Error(payload?.error || 'Guest message delivery failed');
  }
}

async function deliverGuestMessageWithRetry(botId: string, response: BotOutboundMessage, event: BotInboundEvent, maxRetries: number = 3): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deliverGuestMessage(botId, response);
      return;
    } catch (e: any) {
      lastError = e;
      console.error(`[bot-engine] deliverGuestMessage attempt ${attempt}/${maxRetries} failed:`, e.message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  const guestQueryId = typeof response.params?.guest_query_id === 'string' ? response.params.guest_query_id : undefined;
  if (guestQueryId) {
    await supabase
      .from('bot_guest_queries')
      .update({ status: 'failed', response_payload: { error: lastError?.message || 'Guest message delivery failed' } })
      .eq('id', guestQueryId);
  }
  await saveFailedEvent(botId, event, lastError?.message || 'Unknown guest delivery error');
}

async function deliverBotToBotMessage(fromBotId: string, response: BotOutboundMessage, event: BotInboundEvent): Promise<void> {
  const params = response.params as Record<string, unknown>;
  const toBotId = typeof params.to_bot_id === 'string' ? params.to_bot_id : '';
  const content = typeof params.content === 'string' ? params.content : '';
  const sessionId = typeof params.session_id === 'string' ? params.session_id : event.chat_id;
  if (!toBotId || !content) throw new Error('sendBotToBotMessage requires to_bot_id and content');

  const targetBot = await getBotById(toBotId);
  if (!targetBot) throw new Error(`Target bot not found or inactive: ${toBotId}`);

  const botEvent: BotInboundEvent = {
    event_id: `bot2bot_${Date.now()}_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    bot_id: toBotId,
    user_id: fromBotId,
    chat_id: sessionId,
    type: 'message',
    content: {
      text: content,
      media_url: typeof params.media_url === 'string' ? params.media_url : undefined,
      media_type: typeof params.media_type === 'string' ? params.media_type : undefined,
      reply_to_message_id: typeof params.reply_to_message_id === 'string' ? params.reply_to_message_id : undefined,
      from_bot_id: fromBotId,
    } as BotEventContent,
    context: {
      platform_user_id: fromBotId,
      platform: 'bot',
      session_variables: {},
      session_state: 'idle',
      bot_language: targetBot.language_code ?? 'ru',
    },
  };

  await supabase.from('bot_messages').insert({
    bot_id: fromBotId,
    chat_id: sessionId,
    direction: 'outgoing',
    raw_update: { method: 'sendBotToBotMessage', params },
  });

  await routeEvent(botEvent);
}

/**
 * Execute — programmatic handler invocation.
 * Rate-limited to prevent abuse.
 */
async function handleExecute(rawEvent: unknown): Promise<Response> {
  const body = rawEvent as Record<string, unknown>;
  const { bot_id, handler_id, handler_name, event_type, content, user_id, chat_id } = body;

  if (!bot_id) return jsonErr('bot_id required', 400);
  if (!handler_id && !handler_name) return jsonErr('handler_id or handler_name required', 400);

  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count, error: rateErr } = await supabase
    .from('bot_runs')
    .select('*', { count: 'exact', headOnly: true })
    .eq('bot_id', bot_id)
    .gte('created_at', windowStart);

  if (!rateErr && (count || 0) >= 30) {
    return jsonErr('Rate limit exceeded — max 30 requests/minute', 429);
  }

  const bot = await getBotById(bot_id);
  if (!bot) return jsonErr('Bot not found or inactive', 404);

  const handlers = await loadHandlers(bot_id);
  const handler = handler_id
    ? handlers.find(h => h.id === handler_id)
    : handlers.find(h => h.name === handler_name);

  if (!handler) return jsonErr('Handler not found', 404);
  if (!handler.is_active) return jsonErr('Handler is disabled', 400);

  const syntheticEvent: BotInboundEvent = {
    event_id: `exec_${Date.now()}_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    bot_id,
    user_id: user_id || bot.owner_id,
    chat_id: chat_id || `exec_${bot_id}_${user_id || bot.owner_id}`,
    type: (event_type as BotEventType) || 'command',
    content: { text: content?.text || '', ...(content || {}) },
    context: {
      platform_user_id: user_id || bot.owner_id,
      first_name: '',
      platform: 'web',
      session_variables: {},
      session_state: 'idle',
      bot_language: bot.language_code ?? 'ru',
    },
  };

  const result = await processHandlerMatch(handler, syntheticEvent, bot);
  return new Response(JSON.stringify({ ok: true, response: result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return null;
  }

  return user.id;
}

// Extracted core processing for reuse by both webhook and execute
async function processHandlerMatch(handler: BotHandler, event: BotInboundEvent, bot: any): Promise<BotOutboundMessage | null> {
  const session = await getOrCreateSession(event.bot_id, event.user_id, event.chat_id);

  if (!(await checkConditions(handler, session))) {
    console.log('[bot-engine] Handler conditions not met');
    return null;
  }

  const newVars: Record<string, string> = {};
  if (event.content.text) newVars.last_message = event.content.text;
  newVars.last_event_type = event.type;
  newVars.last_handler = handler.name;
  newVars.session_state = handler.name;
  await updateSessionVariables(session.id, newVars);

  sessionVariables = session.variables ?? {};
  const response = buildResponse(handler.response_content);

  const startTime = Date.now();
  await supabase.from('bot_runs').insert({
    bot_id: event.bot_id,
    session_id: session.id,
    trigger_type: event.type,
    trigger_value: handler.trigger_value,
    input_payload: event.content,
    handler_id: handler.id,
    handler_name: handler.name,
    response_method: response.method,
    response_payload: response.params,
    status: 'completed',
    duration_ms: Date.now() - startTime,
  });

  const deliveryMethods = ['sendMessage', 'sendPhoto', 'sendVideo', 'sendDocument', 'sendSticker', 'sendPoll', 'sendLocation', 'sendAction'];
  if (deliveryMethods.includes(response.method)) {
    await deliverMessageWithRetry(event.chat_id, event.bot_id, response, event);
  }
  if (response.method === 'sendGuestMessage') {
    await deliverGuestMessageWithRetry(event.bot_id, response, event);
  }
  if (response.method === 'sendBotToBotMessage') {
    await deliverBotToBotMessage(event.bot_id, response, event);
  }

  return response;
}

function jsonErr(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// HTTP ROUTER
// ============================================================================

async function handleWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/bot-engine/, '');

  // Health check
  if (path === '/health' && req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Inbound event — webhook from platform
  if (path === '/events' && req.method === 'POST') {
    try {
      const raw = await req.json();
      const response = await routeEvent(raw);
      return new Response(JSON.stringify({
        ok: true,
        processed: true,
        response: response ?? null,
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
      console.error('[bot-engine] Error processing event:', error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Execute — programmatic handler invocation
  if (path === '/execute' && req.method === 'POST') {
    try {
      const authUserId = await getAuthenticatedUserId(req);
      if (!authUserId) {
        return jsonErr('Unauthorized', 401);
      }

      const raw = await req.json();
      const body = raw as Record<string, unknown>;
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      if (!botId) {
        return jsonErr('bot_id required', 400);
      }

      const bot = await getBotById(botId);
      if (!bot) {
        return jsonErr('Bot not found or inactive', 404);
      }

      if (bot.owner_id !== authUserId) {
        return jsonErr('Access denied', 403);
      }

      return await handleExecute(raw);
    } catch (error: any) {
      console.error('[bot-engine] Error in execute:', error);
      return jsonErr(error.message || 'Execute failed', 500);
    }
  }

  // Inline query — process inline requests
  if (path === '/inline-query' && req.method === 'POST') {
    try {
      const raw = await req.json();
      const token = req.headers.get('X-Bot-Token') || '';
      const { data: tokenData } = await supabase
        .from('bot_tokens')
        .select('bot_id')
        .eq('token', token)
        .single();

      if (!tokenData) return jsonErr('Invalid bot token', 401);
      return await handleInlineQuery(raw, tokenData.bot_id);
    } catch (error: any) {
      console.error('[bot-engine] Inline query error:', error);
      return jsonErr(error.message, 500);
    }
  }

  // Callback query — process callback button presses
  if (path === '/callback-query' && req.method === 'POST') {
    try {
      const raw = await req.json();
      const token = req.headers.get('X-Bot-Token') || '';
      const { data: tokenData } = await supabase
        .from('bot_tokens')
        .select('bot_id')
        .eq('token', token)
        .single();

      if (!tokenData) return jsonErr('Invalid bot token', 401);
      return await handleCallbackQuery(raw, tokenData.bot_id);
    } catch (error: any) {
      console.error('[bot-engine] Callback query error:', error);
      return jsonErr(error.message, 500);
    }
  }

  // Bot webhook receiver
  if (path === '/webhook' && req.method === 'POST') {
    try {
      const token = req.headers.get('X-Bot-Token') || '';
      const { data: tokenData, error: tokenErr } = await supabase
        .from('bot_tokens')
        .select('bot_id, bots(*)')
        .eq('token', token)
        .single();

      if (tokenErr || !tokenData) return jsonErr('Invalid bot token', 401);

      const raw = await req.json();
      const { data: msg } = await supabase.from('bot_messages').insert({
        bot_id: tokenData.bot_id,
        direction: 'incoming',
        raw_update: raw,
      }).select('id').single();

      return new Response(JSON.stringify({ ok: true, id: msg?.id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('[bot-engine] Bot webhook error:', error);
      return jsonErr(error.message, 500);
    }
  }

  // Unknown route
  return jsonErr('Not found', 404);
}

Deno.serve(handleWebhook);