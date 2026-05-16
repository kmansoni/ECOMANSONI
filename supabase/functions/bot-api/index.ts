/**
 * Bot Platform API
 * 
 * HTTP API for managing bots and mini-apps.
 * This is a Supabase Edge Function.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createErrorResponse, createSuccessResponse } from './utils.ts';
import { handleCors, getCorsHeaders } from '../_shared/utils.ts';

// ===================================================================
// HANDLERS
// ===================================================================

async function handleGetHandlers(req: Request, userId: string, botId: string) {
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const { data: handlers, error } = await supabase
    .from('bot_handlers')
    .select('*')
    .eq('bot_id', botId)
    .order('priority', { ascending: true });

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ handlers: handlers || [] });
}

async function handleCreateHandler(req: Request, userId: string, botId: string) {
  const body = await req.json();
  const { name, trigger_type, trigger_value, response_type, response_content,
          priority, is_active, conditions, ai_model, ai_prompt, ai_temperature, ai_max_tokens } = body;

  if (!name || !trigger_type || !response_type) {
    return createErrorResponse('name, trigger_type and response_type are required', 400);
  }

  // Validate trigger_type
  const validTriggers = ['keyword','command','callback','regex','ai','schedule','welcome','fallback','media','reaction','member_joined','member_left'];
  if (!validTriggers.includes(trigger_type)) {
    return createErrorResponse(`Invalid trigger_type. Must be one of: ${validTriggers.join(', ')}`, 400);
  }

  // 'welcome' and 'fallback' can only have one per bot
  if (['welcome','fallback'].includes(trigger_type)) {
    const { data: existing } = await supabase
      .from('bot_handlers')
      .select('id')
      .eq('bot_id', botId)
      .eq('trigger_type', trigger_type)
      .single();
    if (existing) return createErrorResponse(`A '${trigger_type}' handler already exists for this bot`, 409);
  }

  const { data: handler, error } = await supabase
    .from('bot_handlers')
    .insert({
      bot_id: botId,
      name,
      trigger_type,
      trigger_value: trigger_value ?? null,
      response_type,
      response_content: response_content ?? {},
      priority: priority ?? 50,
      is_active: is_active ?? true,
      conditions: conditions ?? [],
      ai_model: ai_model ?? null,
      ai_prompt: ai_prompt ?? null,
      ai_temperature: ai_temperature ?? 0.7,
      ai_max_tokens: ai_max_tokens ?? 500,
    })
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ handler });
}

async function handleUpdateHandler(req: Request, userId: string, botId: string, handlerId: string) {
  const body = await req.json();
  const allowedFields = ['name','trigger_type','trigger_value','response_type','response_content',
                          'priority','is_active','conditions','ai_model','ai_prompt','ai_temperature','ai_max_tokens'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  updates.updated_at = new Date().toISOString();

  const { data: handler, error } = await supabase
    .from('bot_handlers')
    .update(updates)
    .eq('id', handlerId)
    .eq('bot_id', botId)
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ handler });
}

async function handleDeleteHandler(req: Request, userId: string, botId: string, handlerId: string) {
  const { error } = await supabase
    .from('bot_handlers')
    .delete()
    .eq('id', handlerId)
    .eq('bot_id', botId);

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ message: 'Handler deleted' });
}

// ===================================================================
// KEYBOARDS
// ===================================================================

async function handleGetKeyboards(req: Request, userId: string, botId: string) {
  const { data: keyboards, error } = await supabase
    .from('bot_keyboards')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ keyboards: keyboards || [] });
}

async function handleCreateKeyboard(req: Request, userId: string, botId: string) {
  const body = await req.json();
  const { name, description, keyboard_type, buttons, is_persistent } = body;

  if (!name || !keyboard_type || !buttons) {
    return createErrorResponse('name, keyboard_type and buttons are required', 400);
  }

  const { data: keyboard, error } = await supabase
    .from('bot_keyboards')
    .insert({
      bot_id: botId,
      name,
      description: description ?? null,
      keyboard_type,
      buttons,
      is_persistent: is_persistent ?? false,
      is_active: true,
    })
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ keyboard });
}

async function handleUpdateKeyboard(req: Request, userId: string, botId: string, keyboardId: string) {
  const body = await req.json();
  const { data: keyboard, error } = await supabase
    .from('bot_keyboards')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', keyboardId)
    .eq('bot_id', botId)
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ keyboard });
}

async function handleDeleteKeyboard(req: Request, userId: string, botId: string, keyboardId: string) {
  const { error } = await supabase
    .from('bot_keyboards')
    .delete()
    .eq('id', keyboardId)
    .eq('bot_id', botId);

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ message: 'Keyboard deleted' });
}

// ===================================================================
// CONVERSATION STATES (FSM)
// ===================================================================

async function handleGetStates(req: Request, userId: string, botId: string) {
  const { data: states, error } = await supabase
    .from('bot_conversation_states')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ states: states || [] });
}

async function handleCreateState(req: Request, userId: string, botId: string) {
  const body = await req.json();
  const { name, description, flow, initial_state } = body;

  if (!name || !flow || !initial_state) {
    return createErrorResponse('name, flow and initial_state are required', 400);
  }

  const { data: state, error } = await supabase
    .from('bot_conversation_states')
    .insert({
      bot_id: botId,
      name,
      description: description ?? null,
      flow,
      initial_state,
      is_active: true,
    })
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ state });
}

async function handleUpdateState(req: Request, userId: string, botId: string, stateId: string) {
  const body = await req.json();
  const { data: state, error } = await supabase
    .from('bot_conversation_states')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', stateId)
    .eq('bot_id', botId)
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ state });
}

async function handleDeleteState(req: Request, userId: string, botId: string, stateId: string) {
  const { error } = await supabase
    .from('bot_conversation_states')
    .delete()
    .eq('id', stateId)
    .eq('bot_id', botId);

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ message: 'State deleted' });
}

// ===================================================================
// SESSIONS
// ===================================================================

async function handleGetSessions(req: Request, userId: string, botId: string) {
   const url = new URL(req.url);
   const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
   const cursor = url.searchParams.get('cursor'); // ISO timestamp или ID

   let query = supabase
     .from('bot_sessions')
     .select('*, profiles(id, display_name, avatar_url)')
     .eq('bot_id', botId)
     .order('updated_at', { ascending: false })
     .limit(limit);

   // Cursor-based pagination: "cursor" is the updated_at of the last item from previous page
   // For ties, use id as tiebreaker
   if (cursor) {
     const parts = cursor.split('|');
     if (parts.length === 2) {
       const [cursorUpdatedAt, cursorId] = parts;
       query = query.or(`updated_at.lt.${cursorUpdatedAt},updated_at.eq.${cursorUpdatedAt}&id.lt.${cursorId}`);
     }
   }

   const { data: sessions, error } = await query;
   if (error) return createErrorResponse(error.message, 500);

   // Build next cursor
   let nextCursor = null;
   if (sessions && sessions.length === limit) {
     const last = sessions[sessions.length - 1];
     nextCursor = `${last.updated_at}|${last.id}`;
   }

   return createSuccessResponse({ sessions: sessions || [], next_cursor: nextCursor });
 }

async function handleEndSession(req: Request, userId: string, botId: string, sessionId: string) {
  const expiresAt = new Date(Date.now() + 60000).toISOString(); // expire in 1 min
  const { data, error } = await supabase
    .from('bot_sessions')
    .update({ expires_at: expiresAt, state: 'ended' })
    .eq('id', sessionId)
    .eq('bot_id', botId)
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ session: data });
}

async function handleClearSessionVars(req: Request, userId: string, botId: string, sessionId: string) {
  const { data, error } = await supabase
    .from('bot_sessions')
    .update({ variables: '{}', state: 'idle' })
    .eq('id', sessionId)
    .eq('bot_id', botId)
    .select()
    .single();

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ session: data });
}

// ===================================================================
// RUNS (Execution Logs)
// ===================================================================

async function handleGetRuns(req: Request, userId: string, botId: string) {
   const url = new URL(req.url);
   const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
   const cursor = url.searchParams.get('cursor'); // ISO timestamp|id

   let query = supabase
     .from('bot_runs')
     .select('*', { count: 'exact' })
     .eq('bot_id', botId)
     .order('created_at', { ascending: false })
     .limit(limit);

   // Cursor-based pagination
   if (cursor) {
     const parts = cursor.split('|');
     if (parts.length === 2) {
       const [cursorCreatedAt, cursorId] = parts;
       query = query.or(`created_at.lt.${cursorCreatedAt},created_at.eq.${cursorCreatedAt}&id.lt.${cursorId}`);
     }
   }

   const { data: runs, count, error } = await query;
   if (error) return createErrorResponse(error.message, 500);

   let nextCursor = null;
   if (runs && runs.length === limit) {
     const last = runs[runs.length - 1];
     nextCursor = `${last.created_at}|${last.id}`;
   }

   return createSuccessResponse({ runs: runs || [], total: count || 0, next_cursor: nextCursor });
 }

// ===================================================================
// ANALYTICS
// ===================================================================

async function handleGetAnalytics(req: Request, userId: string, botId: string) {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '30');

  const { data: analytics, error } = await supabase
    .from('bot_analytics')
    .select('*')
    .eq('bot_id', botId)
    .order('date', { ascending: false })
    .limit(days);

  if (error) return createErrorResponse(error.message, 500);
  return createSuccessResponse({ analytics: analytics || [] });
}

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function getAuthenticatedUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }
  
  return user.id;
}

// ============================================================================
// BOT MANAGEMENT
// ============================================================================

async function handleCreateBot(req: Request, userId: string) {
  const body = await req.json();
  const { 
    username, 
    display_name, 
    description, 
    about, 
    avatar_url, 
    bot_chat_type = 'private',
    is_private = false,
    language_code = 'ru'
  } = body;

  // Validate required fields
  if (!username || !display_name) {
    return createErrorResponse('username and display_name are required', 400);
  }

  // Validate username format
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) {
    return createErrorResponse('Invalid username format. Must be 5-32 chars, starts with letter', 400);
  }

  // Check if username is taken
  const { data: existingBot } = await supabase
    .from('bots')
    .select('id')
    .eq('username', username.toLowerCase())
    .single();

  if (existingBot) {
    return createErrorResponse('Username is already taken', 409);
  }

  // Create bot
  const { data: bot, error } = await supabase
    .from('bots')
    .insert({
      owner_id: userId,
      username: username.toLowerCase(),
      display_name,
      description,
      about,
      avatar_url,
      bot_chat_type,
      is_private,
      language_code,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  // Generate bot token automatically
  const token = generateBotToken();
  await supabase.from('bot_tokens').insert({
    bot_id: bot.id,
    token,
    name: 'Main Token'
  });

  return createSuccessResponse({ 
    bot,
    token,
    message: 'Bot created successfully. Use /start command to interact with it.' 
  });
}

async function handleListBots(req: Request, userId: string) {
   const url = new URL(req.url);
   const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
   const cursor = url.searchParams.get('cursor'); // ISO timestamp|id
   const status = url.searchParams.get('status');

   let query = supabase
     .from('bots')
     .select('*', { count: 'exact' })
     .eq('owner_id', userId)
     .order('created_at', { ascending: false })
     .limit(limit);

   if (status) {
     query = query.eq('status', status);
   }

   // Cursor-based pagination
   if (cursor) {
     const parts = cursor.split('|');
     if (parts.length === 2) {
       const [cursorCreatedAt, cursorId] = parts;
       query = query.or(`created_at.lt.${cursorCreatedAt},created_at.eq.${cursorCreatedAt}&id.lt.${cursorId}`);
     }
   }

   const { data: bots, count, error } = await query;

   if (error) {
     return createErrorResponse(error.message, 500);
   }

   let nextCursor = null;
   if (bots && bots.length === limit) {
     const last = bots[bots.length - 1];
     nextCursor = `${last.created_at}|${last.id}`;
   }

   return createSuccessResponse({
     bots,
     total: count || 0,
     next_cursor: nextCursor
   });
 }

async function handleGetBot(req: Request, userId: string, botId: string) {
  const { data: bot, error } = await supabase
    .from('bots')
    .select('*, owner:profiles!bots_owner_id_fkey(id, display_name, avatar_url)')
    .eq('id', botId)
    .single();

  if (error || !bot) {
    return createErrorResponse('Bot not found', 404);
  }

  // Check ownership
  if (bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  return createSuccessResponse(bot);
}

async function handleUpdateBot(req: Request, userId: string, botId: string) {
  // Check ownership first
  const { data: existingBot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!existingBot || existingBot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { 
    display_name, 
    description, 
    about, 
    avatar_url,
    can_join_groups,
    can_read_all_group_messages,
    is_private,
    language_code,
    status
  } = body;

  const { data: bot, error } = await supabase
    .from('bots')
    .update({
      display_name,
      description,
      about,
      avatar_url,
      can_join_groups,
      can_read_all_group_messages,
      is_private,
      language_code,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', botId)
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse(bot);
}

async function handleDeleteBot(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: existingBot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!existingBot || existingBot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  // Delete in order due to foreign keys
  await supabase.from('bot_analytics').delete().eq('bot_id', botId);
  await supabase.from('bot_messages').delete().eq('bot_id', botId);
  await supabase.from('bot_chats').delete().eq('bot_id', botId);
  await supabase.from('bot_webhooks').delete().eq('bot_id', botId);
  await supabase.from('bot_commands').delete().eq('bot_id', botId);
  await supabase.from('bot_tokens').delete().eq('bot_id', botId);
  
  const { error } = await supabase.from('bots').delete().eq('id', botId);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ message: 'Bot deleted successfully' });
}

// ============================================================================
// BOT TOKENS
// ============================================================================

async function handleCreateBotToken(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { name, expires_at } = body;

  const token = generateBotToken();
  
  const { data: botToken, error } = await supabase
    .from('bot_tokens')
    .insert({
      bot_id: botId,
      token,
      name,
      expires_at
    })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  // Return full token only once
  return createSuccessResponse({ 
    token: botToken.token,
    id: botToken.id,
    name: botToken.name,
    expires_at: botToken.expires_at
  });
}

async function handleListBotTokens(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const { data: tokens, error } = await supabase
    .from('bot_tokens')
    .select('id, name, last_used_at, expires_at, created_at')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ tokens: tokens || [] });
}

async function handleDeleteBotToken(req: Request, userId: string, botId: string, tokenId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const { error } = await supabase
    .from('bot_tokens')
    .delete()
    .eq('id', tokenId)
    .eq('bot_id', botId);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ message: 'Token deleted' });
}

// ============================================================================
// BOT COMMANDS
// ============================================================================

async function handleGetBotCommands(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const { data: commands, error } = await supabase
    .from('bot_commands')
    .select('*')
    .eq('bot_id', botId)
    .order('command');

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ commands: commands || [] });
}

async function handleSetBotCommands(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { commands } = body;

  if (!Array.isArray(commands)) {
    return createErrorResponse('commands must be an array', 400);
  }

  // Delete existing commands
  await supabase.from('bot_commands').delete().eq('bot_id', botId);

  // Insert new commands
  if (commands.length > 0) {
    const commandsToInsert = commands.map((cmd: { command: string; description?: string; language_code?: string }) => ({
      bot_id: botId,
      command: cmd.command.toLowerCase().replace(/^\//, ''),
      description: cmd.description,
      language_code: cmd.language_code || 'en'
    }));

    const { error } = await supabase.from('bot_commands').insert(commandsToInsert);

    if (error) {
      return createErrorResponse(error.message, 500);
    }
  }

  return createSuccessResponse({ message: 'Commands updated' });
}

// ============================================================================
// BOT WEBHOOKS
// ============================================================================

async function handleSetBotWebhook(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { url, secret_token } = body;

  if (!url) {
    return createErrorResponse('url is required', 400);
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return createErrorResponse('Invalid URL', 400);
  }

  const secret = secret_token || generateSecretToken();
  
  const { data: webhook, error } = await supabase
    .from('bot_webhooks')
    .upsert({
      bot_id: botId,
      url,
      secret_token: secret,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'bot_id' })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ 
    webhook,
    secret 
  });
}

async function handleDeleteBotWebhook(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const { error } = await supabase
    .from('bot_webhooks')
    .delete()
    .eq('bot_id', botId);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ message: 'Webhook deleted' });
}

// ============================================================================
// PUBLIC BOT INFO
// ============================================================================

async function handleGetBotByUsername(req: Request, username: string) {
  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, username, display_name, description, about, avatar_url, bot_chat_type, language_code, supports_guest_queries')
    .eq('username', username.toLowerCase())
    .eq('status', 'active')
    .single();

  if (error || !bot) {
    return createErrorResponse('Bot not found', 404);
  }

  return createSuccessResponse(bot);
}

// ============================================================================
// GUEST MODE (Bot API 10.0)
// ============================================================================

async function handleSetGuestMode(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { supports_guest_queries } = body;

  const { data: updatedBot, error } = await supabase
    .from('bots')
    .update({ supports_guest_queries })
    .eq('id', botId)
    .select('supports_guest_queries')
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ supports_guest_queries: updatedBot.supports_guest_queries });
}

async function handleAnswerGuestQuery(req: Request) {
  const body = await req.json();
  const { guest_query_id, ok, error: errorMsg, result } = body;

  if (!guest_query_id) {
    return createErrorResponse('guest_query_id is required', 400);
  }

  // This endpoint would be called by bots to answer guest queries
  // Implementation would send response back to Telegram
  // For now, just acknowledge
  return createSuccessResponse({ 
    ok, 
    result,
    message: 'Guest query response sent' 
  });
}

// ============================================================================
// POLL ENHANCEMENTS (Bot API 10.0)
// ============================================================================

async function handleSendPoll(req: Request, userId: string, botId: string) {
  // Check ownership
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { 
    chat_id, 
    question, 
    options, 
    is_anonymous = true,
    type = 'regular',
    allows_multiple_answers = false,
    correct_option_id,
    explanation,
    explanation_parse_mode,
    open_period,
    close_date,
    is_closed,
    // Bot API 10.0 additions
    members_only,
    country_codes,
    allows_revoting,
    shuffle_ones,
    allow_adding_options,
    hide_results_until_closed,
    description,
    description_parse_mode,
  } = body;

  if (!chat_id || !question || !options || !Array.isArray(options)) {
    return createErrorResponse('chat_id, question, and options array are required', 400);
  }

  // Allow single option (was minimum 2)
  if (options.length < 1) {
    return createErrorResponse('At least 1 option is required', 400);
  }

  // Store poll in database
  const { data: poll, error } = await supabase
    .from('polls')
    .insert({
      bot_id: botId,
      chat_id,
      question,
      options,
      is_anonymous,
      type,
      allows_multiple_answers,
      correct_option_id,
      explanation,
      open_period,
      close_date,
      is_closed,
      // Bot API 10.0 fields
      members_only: members_only || false,
      country_codes: country_codes || [],
      allows_revoting: allows_revoting || false,
      shuffle_ones: shuffle_ones || false,
      allow_adding_options: allow_adding_options || false,
      hide_results_until_closed: hide_results_until_closed || false,
      description,
    })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  // Send to Telegram Bot API would happen here
  return createSuccessResponse({ poll_id: poll.id, message: 'Poll created' });
}

// Live Photos (Bot API 10.0)
async function handleSendLivePhoto(req: Request, userId: string, botId: string) {
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { chat_id, live_photo, caption, reply_markup } = body;

  if (!chat_id || !live_photo) {
    return createErrorResponse('chat_id and live_photo are required', 400);
  }

  return createSuccessResponse({ 
    message: 'Live photo sent',
    chat_id,
    caption
  });
}

// Message Drafts (Bot API 10.0)
async function handleSendMessageDraft(req: Request, userId: string, botId: string) {
  const { data: bot } = await supabase
    .from('bots')
    .select('owner_id')
    .eq('id', botId)
    .single();

  if (!bot || bot.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { chat_id, text } = body;

  if (!chat_id || !text) {
    return createErrorResponse('chat_id and text are required', 400);
  }

  return createSuccessResponse({ 
    message: 'Draft sent',
    chat_id,
    text
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateBotToken(): string {
  // Format: {app_id}:{random_string}
  const appId = Math.floor(Math.random() * 100000);
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${appId}:${randomPart}`;
}

function generateSecretToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// ROUTER
// ============================================================================

Deno.serve(async (req) => {
  console.log('bot-api called:', req.method, req.url);

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  function withCors(res: Response): Response {
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(corsHeaders)) out.headers.set(k, v);
    return out;
  }

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/bot-api(?=\/|$)/, '')
    .replace(/^\/bot-api(?=\/|$)/, '');
  const segments = path.split('/').filter(Boolean);
  console.log('path:', path, 'segments:', segments);
  
  const userId = await getAuthenticatedUser(req);
  
  // Public endpoints
  if (segments[0] === 'bot' && segments[1]) {
    // GET /bot-api/bot/:username - public bot info
    if (req.method === 'GET') {
      return withCors(await handleGetBotByUsername(req, segments[1]));
    }
  }

  // Protected endpoints require auth
  if (!userId) {
    return withCors(createErrorResponse('Unauthorized', 401));
  }

  // Root endpoint — POST /bot-api (create bot) or GET /bot-api (list bots)
  if (segments.length === 0) {
    if (req.method === 'POST') {
      return withCors(await handleCreateBot(req, userId));
    }
    if (req.method === 'GET') {
      return withCors(await handleListBots(req, userId));
    }
  }

  // Bot management
  if (segments[0] === 'bots') {
    // POST /bot-api/bots - create bot
    if (req.method === 'POST') {
      return withCors(await handleCreateBot(req, userId));
    }
    
    // GET /bot-api/bots - list user's bots
    if (req.method === 'GET') {
      return withCors(await handleListBots(req, userId));
    }
    
    // Bot-specific operations
    if (segments[1]) {
      const botId = segments[1];
      
      // GET /bot-api/bots/:id
      if (req.method === 'GET') {
        return withCors(await handleGetBot(req, userId, botId));
      }
      
      // PATCH /bot-api/bots/:id
      if (req.method === 'PATCH') {
        return withCors(await handleUpdateBot(req, userId, botId));
      }
      
      // DELETE /bot-api/bots/:id
      if (req.method === 'DELETE') {
        return withCors(await handleDeleteBot(req, userId, botId));
      }
      
      // Token management
      if (segments[2] === 'tokens') {
        // POST /bot-api/bots/:id/tokens
        if (req.method === 'POST') {
          return withCors(await handleCreateBotToken(req, userId, botId));
        }
        
        // GET /bot-api/bots/:id/tokens
        if (req.method === 'GET') {
          return withCors(await handleListBotTokens(req, userId, botId));
        }
        
        // DELETE /bot-api/bots/:id/tokens/:tokenId
        if (segments[3] && req.method === 'DELETE') {
          return withCors(await handleDeleteBotToken(req, userId, botId, segments[3]));
        }
      }
      
      // Commands management
      if (segments[2] === 'commands') {
        // GET /bot-api/bots/:id/commands
        if (req.method === 'GET') {
          return withCors(await handleGetBotCommands(req, userId, botId));
        }
        
        // PUT /bot-api/bots/:id/commands
        if (req.method === 'PUT') {
          return withCors(await handleSetBotCommands(req, userId, botId));
        }
      }
      
      // Webhook management
      if (segments[2] === 'webhook') {
        // POST /bot-api/bots/:id/webhook
        if (req.method === 'POST') {
          return withCors(await handleSetBotWebhook(req, userId, botId));
        }
        
        // DELETE /bot-api/bots/:id/webhook
        if (req.method === 'DELETE') {
          return withCors(await handleDeleteBotWebhook(req, userId, botId));
        }
      }
      
      // Guest Mode (Bot API 10.0)
      if (segments[2] === 'guest-mode') {
        // POST /bot-api/bots/:id/guest-mode
        if (req.method === 'POST') {
          return withCors(await handleSetGuestMode(req, userId, botId));
        }
      }
      
// Polls (Bot API 10.0)
      if (segments[2] === 'polls') {
        // POST /bot-api/bots/:id/polls
        if (req.method === 'POST') {
          return withCors(await handleSendPoll(req, userId, botId));
        }
      }
      
      // Live Photos (Bot API 10.0)
      if (segments[2] === 'live-photos') {
        // POST /bot-api/bots/:id/live-photos
        if (req.method === 'POST') {
          return withCors(await handleSendLivePhoto(req, userId, botId));
        }
      }
      
      // Message Drafts (Bot API 10.0)
      if (segments[2] === 'drafts') {
        // POST /bot-api/bots/:id/drafts
        if (req.method === 'POST') {
          return withCors(await handleSendMessageDraft(req, userId, botId));
        }
      }
}
   }

   // Guest query endpoint (public)
  if (segments[0] === 'guest-query') {
    // POST /bot-api/guest-query - answer guest query
    if (req.method === 'POST') {
      return withCors(await handleAnswerGuestQuery(req));
    }
  }

  return withCors(createErrorResponse('Not found', 404));
});
