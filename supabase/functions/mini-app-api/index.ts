/**
 * Mini Apps API
 * 
 * HTTP API for managing mini-apps.
 * This is a Supabase Edge Function.
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

function createSuccessResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...data as object }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createErrorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// MINI APP MANAGEMENT
// ============================================================================

async function handleCreateMiniApp(req: Request, userId: string) {
  const body = await req.json();
  const { 
    title, 
    slug, 
    description, 
    icon_url, 
    url, 
    version,
    bot_id 
  } = body;

  // Validate required fields
  if (!title || !slug || !url) {
    return createErrorResponse('title, slug, and url are required', 400);
  }

  // Validate slug format
  if (!/^[a-zA-Z0-9-]{3,50}$/.test(slug)) {
    return createErrorResponse('Invalid slug format. Use 3-50 alphanumeric characters and hyphens', 400);
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return createErrorResponse('Invalid URL', 400);
  }

  // Check if slug is taken
  const { data: existing } = await supabase
    .from('mini_apps')
    .select('id')
    .eq('slug', slug.toLowerCase())
    .single();

  if (existing) {
    return createErrorResponse('Slug is already taken', 409);
  }

  // Verify bot ownership if bot_id provided
  if (bot_id) {
    const { data: bot } = await supabase
      .from('bots')
      .select('owner_id')
      .eq('id', bot_id)
      .single();

    if (!bot || bot.owner_id !== userId) {
      return createErrorResponse('Invalid bot_id or access denied', 403);
    }
  }

  // Create mini app
  const { data: miniApp, error } = await supabase
    .from('mini_apps')
    .insert({
      owner_id: userId,
      title,
      slug: slug.toLowerCase(),
      description,
      icon_url,
      url,
      version,
      bot_id,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ mini_app: miniApp });
}

async function handleListMiniApps(req: Request, userId: string) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const page_size = parseInt(url.searchParams.get('page_size') || '20');

  const { data: miniApps, count, error } = await supabase
    .from('mini_apps')
    .select('*', { count: 'exact' })
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .range((page - 1) * page_size, page * page_size - 1);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({
    mini_apps: miniApps || [],
    total: count || 0,
    page,
    page_size
  });
}

async function handleGetMiniApp(req: Request, userId: string, appId: string) {
  const { data: miniApp, error } = await supabase
    .from('mini_apps')
    .select('*, owner:profiles!mini_apps_owner_id_fkey(id, display_name, avatar_url)')
    .eq('id', appId)
    .single();

  if (error || !miniApp) {
    return createErrorResponse('Mini app not found', 404);
  }

  // Check ownership
  if (miniApp.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  return createSuccessResponse(miniApp);
}

async function handleUpdateMiniApp(req: Request, userId: string, appId: string) {
  // Check ownership first
  const { data: existing } = await supabase
    .from('mini_apps')
    .select('owner_id')
    .eq('id', appId)
    .single();

  if (!existing || existing.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  const body = await req.json();
  const { 
    title, 
    description, 
    icon_url, 
    url, 
    version,
    bot_id,
    is_active 
  } = body;

  // Validate URL if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      return createErrorResponse('Invalid URL', 400);
    }
  }

  // Verify bot ownership if bot_id provided
  if (bot_id) {
    const { data: bot } = await supabase
      .from('bots')
      .select('owner_id')
      .eq('id', bot_id)
      .single();

    if (!bot || bot.owner_id !== userId) {
      return createErrorResponse('Invalid bot_id or access denied', 403);
    }
  }

  const { data: miniApp, error } = await supabase
    .from('mini_apps')
    .update({
      title,
      description,
      icon_url,
      url,
      version,
      bot_id,
      is_active,
      updated_at: new Date().toISOString()
    })
    .eq('id', appId)
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse(miniApp);
}

async function handleDeleteMiniApp(req: Request, userId: string, appId: string) {
  // Check ownership
  const { data: existing } = await supabase
    .from('mini_apps')
    .select('owner_id')
    .eq('id', appId)
    .single();

  if (!existing || existing.owner_id !== userId) {
    return createErrorResponse('Access denied', 403);
  }

  // Delete sessions first
  await supabase.from('mini_app_sessions').delete().eq('mini_app_id', appId);

  const { error } = await supabase.from('mini_apps').delete().eq('id', appId);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ message: 'Mini app deleted successfully' });
}

// ============================================================================
// PUBLIC MINI APP INFO
// ============================================================================

async function handleGetMiniAppBySlug(req: Request, slug: string) {
  const { data: miniApp, error } = await supabase
    .from('mini_apps')
    .select('id, title, slug, description, icon_url, url, version, bot_id, is_active')
    .eq('slug', slug.toLowerCase())
    .eq('is_active', true)
    .single();

  if (error || !miniApp) {
    return createErrorResponse('Mini app not found', 404);
  }

  return createSuccessResponse(miniApp);
}

// ============================================================================
// MINI APP SESSIONS
// ============================================================================

async function handleStartMiniAppSession(req: Request, userId: string, appId: string) {
  // Verify app exists and is active
  const { data: miniApp } = await supabase
    .from('mini_apps')
    .select('id, is_active')
    .eq('id', appId)
    .single();

  if (!miniApp || !miniApp.is_active) {
    return createErrorResponse('Mini app not found or inactive', 404);
  }

  const body = await req.json();
  const { platform, device_info } = body;

  const { data: session, error } = await supabase
    .from('mini_app_sessions')
    .insert({
      mini_app_id: appId,
      user_id: userId,
      platform,
      device_info
    })
    .select()
    .single();

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ session });
}

async function handleEndMiniAppSession(req: Request, userId: string, sessionId: string) {
  // Get session
  const { data: session } = await supabase
    .from('mini_app_sessions')
    .select('user_id, mini_app_id, started_at')
    .eq('id', sessionId)
    .single();

  if (!session || session.user_id !== userId) {
    return createErrorResponse('Session not found', 404);
  }

  const endedAt = new Date().toISOString();
  const startedAt = new Date(session.started_at);
  const durationSeconds = Math.floor((new Date(endedAt).getTime() - startedAt.getTime()) / 1000);

  const { error } = await supabase
    .from('mini_app_sessions')
    .update({
      ended_at: endedAt,
      duration_seconds: durationSeconds
    })
    .eq('id', sessionId);

  if (error) {
    return createErrorResponse(error.message, 500);
  }

  return createSuccessResponse({ message: 'Session ended', duration_seconds: durationSeconds });
}

// ============================================================================
// ROUTER
// ============================================================================

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/mini-app-api/, '');
  const segments = path.split('/').filter(Boolean);
  
  const userId = await getAuthenticatedUser(req);
  
  // Public endpoints
  if (segments[0] === 'app' && segments[1]) {
    // GET /mini-app-api/app/:slug - public mini app info
    if (req.method === 'GET') {
      return handleGetMiniAppBySlug(req, segments[1]);
    }
  }

  // Protected endpoints require auth
  if (!userId) {
    return createErrorResponse('Unauthorized', 401);
  }

  // Mini app management
  if (segments[0] === 'mini-apps') {
    // POST /mini-app-api/mini-apps - create mini app
    if (req.method === 'POST') {
      return handleCreateMiniApp(req, userId);
    }
    
    // GET /mini-app-api/mini-apps - list user's mini apps
    if (req.method === 'GET') {
      return handleListMiniApps(req, userId);
    }
    
    // Mini app-specific operations
    if (segments[1]) {
      const appId = segments[1];
      
      // GET /mini-app-api/mini-apps/:id
      if (req.method === 'GET') {
        return handleGetMiniApp(req, userId, appId);
      }
      
      // PATCH /mini-app-api/mini-apps/:id
      if (req.method === 'PATCH') {
        return handleUpdateMiniApp(req, userId, appId);
      }
      
      // DELETE /mini-app-api/mini-apps/:id
      if (req.method === 'DELETE') {
        return handleDeleteMiniApp(req, userId, appId);
      }
      
      // Session management
      if (segments[2] === 'sessions') {
        // POST /mini-app-api/mini-apps/:id/sessions - start session
        if (req.method === 'POST') {
          return handleStartMiniAppSession(req, userId, appId);
        }
        
        // Session-specific operations
        if (segments[3]) {
          const sessionId = segments[3];
          
          // DELETE /mini-app-api/mini-apps/:id/sessions/:sessionId - end session
          if (req.method === 'DELETE') {
            return handleEndMiniAppSession(req, userId, sessionId);
          }
        }
      }
    }
  }

  return createErrorResponse('Not found', 404);
});
