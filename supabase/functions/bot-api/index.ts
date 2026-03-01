/**
 * Bot Platform API
 * 
 * HTTP API for managing bots and mini-apps.
 * This is a Supabase Edge Function.
 */

import { createClient } from '@supabase/supabase-js';
import { createErrorResponse, createSuccessResponse } from './utils.ts';

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
  const page = parseInt(url.searchParams.get('page') || '1');
  const page_size = parseInt(url.searchParams.get('page_size') || '20');
  const status = url.searchParams.get('status');

  let query = supabase
    .from('bots')
    .select('*', { count: 'exact' })
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .range((page - 1) * page_size, page * page_size - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: bots, count, error } = await query;

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({
    bots,
    total: count || 0,
    page,
    page_size
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
    .select('id, username, display_name, description, about, avatar_url, bot_chat_type, language_code')
    .eq('username', username.toLowerCase())
    .eq('status', 'active')
    .single();

  if (error || !bot) {
    return createErrorResponse('Bot not found', 404);
  }

  return createSuccessResponse(bot);
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
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/bot-api/, '');
  const segments = path.split('/').filter(Boolean);
  
  const userId = await getAuthenticatedUser(req);
  
  // Public endpoints
  if (segments[0] === 'bot' && segments[1]) {
    // GET /bot-api/bot/:username - public bot info
    if (req.method === 'GET') {
      return handleGetBotByUsername(req, segments[1]);
    }
  }

  // Protected endpoints require auth
  if (!userId) {
    return createErrorResponse('Unauthorized', 401);
  }

  // Bot management
  if (segments[0] === 'bots') {
    // POST /bot-api/bots - create bot
    if (req.method === 'POST') {
      return handleCreateBot(req, userId);
    }
    
    // GET /bot-api/bots - list user's bots
    if (req.method === 'GET') {
      return handleListBots(req, userId);
    }
    
    // Bot-specific operations
    if (segments[1]) {
      const botId = segments[1];
      
      // GET /bot-api/bots/:id
      if (req.method === 'GET') {
        return handleGetBot(req, userId, botId);
      }
      
      // PATCH /bot-api/bots/:id
      if (req.method === 'PATCH') {
        return handleUpdateBot(req, userId, botId);
      }
      
      // DELETE /bot-api/bots/:id
      if (req.method === 'DELETE') {
        return handleDeleteBot(req, userId, botId);
      }
      
      // Token management
      if (segments[2] === 'tokens') {
        // POST /bot-api/bots/:id/tokens
        if (req.method === 'POST') {
          return handleCreateBotToken(req, userId, botId);
        }
        
        // GET /bot-api/bots/:id/tokens
        if (req.method === 'GET') {
          return handleListBotTokens(req, userId, botId);
        }
        
        // DELETE /bot-api/bots/:id/tokens/:tokenId
        if (segments[3] && req.method === 'DELETE') {
          return handleDeleteBotToken(req, userId, botId, segments[3]);
        }
      }
      
      // Commands management
      if (segments[2] === 'commands') {
        // GET /bot-api/bots/:id/commands
        if (req.method === 'GET') {
          return handleGetBotCommands(req, userId, botId);
        }
        
        // PUT /bot-api/bots/:id/commands
        if (req.method === 'PUT') {
          return handleSetBotCommands(req, userId, botId);
        }
      }
      
      // Webhook management
      if (segments[2] === 'webhook') {
        // POST /bot-api/bots/:id/webhook
        if (req.method === 'POST') {
          return handleSetBotWebhook(req, userId, botId);
        }
        
        // DELETE /bot-api/bots/:id/webhook
        if (req.method === 'DELETE') {
          return handleDeleteBotWebhook(req, userId, botId);
        }
      }
    }
  }

  return createErrorResponse('Not found', 404);
});
