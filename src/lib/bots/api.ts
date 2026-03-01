/**
 * Bot Platform API Client
 * 
 * Frontend client for interacting with the Bot Platform API.
 */

import { supabase } from '@/lib/supabase';
import type {
  Bot,
  BotWithOwner,
  BotToken,
  BotCommand,
  BotWebhook,
  BotChat,
  BotAnalytics,
  MiniApp,
  MiniAppWithOwner,
  CreateBotRequest,
  UpdateBotRequest,
  CreateBotTokenRequest,
  CreateBotCommandRequest,
  CreateBotWebhookRequest,
  CreateMiniAppRequest,
  UpdateMiniAppRequest,
} from './types';

const BOT_API_URL = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-api`
  : '/api/bot-api';

const MINI_APP_API_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mini-app-api`
  : '/api/mini-app-api';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Unknown error');
  }
  return data;
}

// ============================================================================
// BOT API
// ============================================================================

export const botApi = {
  /**
   * Create a new bot
   */
  async createBot(data: CreateBotRequest): Promise<{ bot: Bot; token: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(BOT_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ bot: Bot; token: string }>(response);
    return result;
  },

  /**
   * List all bots owned by the current user
   */
  async listBots(options?: { page?: number; pageSize?: number; status?: string }): Promise<{ bots: Bot[]; total: number }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pageSize) params.set('page_size', String(options.pageSize));
    if (options?.status) params.set('status', options.status);
    
    const url = `${BOT_API_URL}?${params.toString()}`;
    const response = await fetch(url, { headers });
    return handleResponse<{ bots: Bot[]; total: number }>(response);
  },

  /**
   * Get a bot by ID
   */
  async getBot(botId: string): Promise<BotWithOwner> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}`, { headers });
    return handleResponse<BotWithOwner>(response);
  },

  /**
   * Get bot by username (public)
   */
  async getBotByUsername(username: string): Promise<Bot> {
    const response = await fetch(`${BOT_API_URL}/bot/${username}`);
    return handleResponse<Bot>(response);
  },

  /**
   * Update a bot
   */
  async updateBot(botId: string, data: UpdateBotRequest): Promise<Bot> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Bot>(response);
  },

  /**
   * Delete a bot
   */
  async deleteBot(botId: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}`, {
      method: 'DELETE',
      headers,
    });
    await handleResponse<{ message: string }>(response);
  },

  // ===== BOT TOKENS =====

  /**
   * Create a new bot token
   */
  async createBotToken(botId: string, data?: CreateBotTokenRequest): Promise<{ token: string; id: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data || {}),
    });
    return handleResponse<{ token: string; id: string }>(response);
  },

  /**
   * List bot tokens
   */
  async listBotTokens(botId: string): Promise<{ tokens: (BotToken & { token?: never })[] }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/tokens`, { headers });
    return handleResponse<{ tokens: (BotToken & { token?: never })[] }>(response);
  },

  /**
   * Delete a bot token
   */
  async deleteBotToken(botId: string, tokenId: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/tokens/${tokenId}`, {
      method: 'DELETE',
      headers,
    });
    await handleResponse<{ message: string }>(response);
  },

  // ===== BOT COMMANDS =====

  /**
   * Get bot commands
   */
  async getBotCommands(botId: string): Promise<{ commands: BotCommand[] }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/commands`, { headers });
    return handleResponse<{ commands: BotCommand[] }>(response);
  },

  /**
   * Set bot commands
   */
  async setBotCommands(botId: string, commands: CreateBotCommandRequest[]): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/commands`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ commands }),
    });
    await handleResponse<{ message: string }>(response);
  },

  // ===== BOT WEBHOOKS =====

  /**
   * Set bot webhook
   */
  async setBotWebhook(botId: string, data: CreateBotWebhookRequest): Promise<{ webhook: BotWebhook; secret: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<{ webhook: BotWebhook; secret: string }>(response);
  },

  /**
   * Delete bot webhook
   */
  async deleteBotWebhook(botId: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${botId}/webhook`, {
      method: 'DELETE',
      headers,
    });
    await handleResponse<{ message: string }>(response);
  },
};

// ============================================================================
// MINI APP API
// ============================================================================

export const miniAppApi = {
  /**
   * Create a new mini app
   */
  async createMiniApp(data: CreateMiniAppRequest): Promise<{ mini_app: MiniApp }> {
    const headers = await getAuthHeaders();
    const response = await fetch(MINI_APP_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<{ mini_app: MiniApp }>(response);
  },

  /**
   * List all mini apps owned by the current user
   */
  async listMiniApps(options?: { page?: number; pageSize?: number }): Promise<{ mini_apps: MiniApp[]; total: number }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pageSize) params.set('page_size', String(options.pageSize));
    
    const url = `${MINI_APP_API_URL}?${params.toString()}`;
    const response = await fetch(url, { headers });
    return handleResponse<{ mini_apps: MiniApp[]; total: number }>(response);
  },

  /**
   * Get a mini app by ID
   */
  async getMiniApp(appId: string): Promise<MiniAppWithOwner> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${appId}`, { headers });
    return handleResponse<MiniAppWithOwner>(response);
  },

  /**
   * Get mini app by slug (public)
   */
  async getMiniAppBySlug(slug: string): Promise<MiniApp> {
    const response = await fetch(`${MINI_APP_API_URL}/app/${slug}`);
    return handleResponse<MiniApp>(response);
  },

  /**
   * Update a mini app
   */
  async updateMiniApp(appId: string, data: UpdateMiniAppRequest): Promise<MiniApp> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${appId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<MiniApp>(response);
  },

  /**
   * Delete a mini app
   */
  async deleteMiniApp(appId: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${appId}`, {
      method: 'DELETE',
      headers,
    });
    await handleResponse<{ message: string }>(response);
  },

  /**
   * Start a mini app session
   */
  async startSession(appId: string, platform?: string, deviceInfo?: Record<string, unknown>): Promise<{ session: { id: string } }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${appId}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ platform, device_info: deviceInfo }),
    });
    return handleResponse<{ session: { id: string } }>(response);
  },

  /**
   * End a mini app session
   */
  async endSession(appId: string, sessionId: string): Promise<{ duration_seconds: number }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${appId}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse<{ duration_seconds: number }>(response);
  },
};

// ============================================================================
// CONVENIENCE HOOK FACTORY
// ============================================================================

/**
 * Create a simple React hook for bot operations
 * This can be used in React components
 */
export function createBotHooks() {
  return {
    useBots: () => {
      return {
        bots: [] as Bot[],
        loading: false,
        error: null as Error | null,
        refetch: async () => {},
        createBot: async (data: CreateBotRequest) => {
          const result = await botApi.createBot(data);
          return result.bot;
        },
      };
    },
    useBot: (botId: string) => {
      return {
        bot: null as Bot | null,
        loading: false,
        error: null as Error | null,
        refetch: async () => {},
        updateBot: async (data: UpdateBotRequest) => {
          await botApi.updateBot(botId, data);
        },
        deleteBot: async () => {
          await botApi.deleteBot(botId);
        },
      };
    },
    useBotCommands: (botId: string) => {
      return {
        commands: [] as BotCommand[],
        loading: false,
        error: null as Error | null,
        refetch: async () => {},
        setCommands: async (commands: CreateBotCommandRequest[]) => {
          await botApi.setBotCommands(botId, commands);
        },
      };
    },
  };
}
