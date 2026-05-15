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
  BotHandler,
  BotSession,
  BotKeyboard,
  BotConversationState,
  BotRun,
} from './types';
import type { BotOutboundMessage } from './protocol';

const BOT_API_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-api`
  : '/api/bot-api';

const BOT_ENGINE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-engine`
  : '/api/bot-engine';

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
    * List all bots owned by the current user (cursor-based pagination)
    */
   async listBots(options?: { limit?: number; cursor?: string; status?: string }): Promise<{ bots: Bot[]; total: number; nextCursor?: string }> {
     const headers = await getAuthHeaders();
     const params = new URLSearchParams();
     if (options?.limit) params.set('limit', String(options.limit));
     if (options?.cursor) params.set('cursor', options.cursor);
     if (options?.status) params.set('status', options.status);

     const url = `${BOT_API_URL}?${params.toString()}`;
     const response = await fetch(url, { headers });
     return handleResponse<{ bots: Bot[]; total: number; next_cursor?: string }>(response);
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

   // ===== BOT SESSIONS =====

/**
     * List bot sessions (cursor-based pagination)
     */
    async getBotSessions(botId: string, options?: { limit?: number; cursor?: string }): Promise<{ sessions: BotSession[]; total: number; nextCursor?: string }> {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.cursor) params.set('cursor', options.cursor);

      const response = await fetch(`${BOT_API_URL}/bots/${botId}/sessions?${params.toString()}`, { headers });
      return handleResponse<{ sessions: BotSession[]; total: number; next_cursor?: string }>(response);
    },

   /**
    * End a bot session
    */
   async endBotSession(botId: string, sessionId: string): Promise<{ message: string }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/sessions/${sessionId}/end`, {
       method: 'POST',
       headers,
     });
     return handleResponse<{ message: string }>(response);
   },

   // ===== BOT KEYBOARDS =====

   /**
    * Get bot keyboards
    */
   async getBotKeyboards(botId: string): Promise<{ keyboards: BotKeyboard[] }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/keyboards`, { headers });
     return handleResponse<{ keyboards: BotKeyboard[] }>(response);
   },

   /**
    * Create a bot keyboard
    */
   async createBotKeyboard(botId: string, data: Omit<BotKeyboard, 'id' | 'created_at' | 'updated_at'>): Promise<{ keyboard: BotKeyboard }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/keyboards`, {
       method: 'POST',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ keyboard: BotKeyboard }>(response);
   },

   /**
    * Update a bot keyboard
    */
   async updateBotKeyboard(botId: string, keyboardId: string, data: Partial<BotKeyboard>): Promise<{ keyboard: BotKeyboard }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/keyboards/${keyboardId}`, {
       method: 'PATCH',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ keyboard: BotKeyboard }>(response);
   },

   /**
    * Delete a bot keyboard
    */
   async deleteBotKeyboard(botId: string, keyboardId: string): Promise<{ message: string }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/keyboards/${keyboardId}`, {
       method: 'DELETE',
       headers,
     });
     return handleResponse<{ message: string }>(response);
   },

   // ===== BOT CONVERSATION STATES =====

   /**
    * Get bot conversation states
    */
   async getBotStates(botId: string): Promise<{ states: BotConversationState[] }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/states`, { headers });
     return handleResponse<{ states: BotConversationState[] }>(response);
   },

   /**
    * Create a bot conversation state (FSM)
    */
   async createBotState(botId: string, data: Omit<BotConversationState, 'id' | 'created_at' | 'updated_at'>): Promise<{ state: BotConversationState }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/states`, {
       method: 'POST',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ state: BotConversationState }>(response);
   },

   /**
    * Update a bot conversation state
    */
   async updateBotState(botId: string, stateId: string, data: Partial<BotConversationState>): Promise<{ state: BotConversationState }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/states/${stateId}`, {
       method: 'PATCH',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ state: BotConversationState }>(response);
   },

   /**
    * Delete a bot conversation state
    */
   async deleteBotState(botId: string, stateId: string): Promise<{ message: string }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${botId}/states/${stateId}`, {
       method: 'DELETE',
       headers,
     });
     return handleResponse<{ message: string }>(response);
   },

   // ===== BOT RUNS (Execution Logs) =====

/**
     * Get bot execution runs (cursor-based pagination)
     */
    async getBotRuns(botId: string, options?: { limit?: number; cursor?: string }): Promise<{ runs: BotRun[]; total: number; nextCursor?: string }> {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.cursor) params.set('cursor', options.cursor);

      const response = await fetch(`${BOT_API_URL}/bots/${botId}/runs?${params.toString()}`, { headers });
      return handleResponse<{ runs: BotRun[]; total: number; next_cursor?: string }>(response);
    },

   // ============================================================================
   // MINI APP API
   // ============================================================================

   /**
    * Get bot analytics
    */
   async getBotAnalytics(botId: string, options?: { days?: number }): Promise<{ analytics: BotAnalytics[] }> {
     const headers = await getAuthHeaders();
     const params = new URLSearchParams();
     if (options?.days) params.set('days', String(options.days));

     const response = await fetch(`${BOT_API_URL}/bots/${botId}/analytics?${params.toString()}`, { headers });
     return handleResponse<{ analytics: BotAnalytics[] }>(response);
   },

   // ============================================================================
   // EXECUTE
   // ============================================================================

   /**
    * Execute a handler programmatically
    */
   async executeHandler(botId: string, event: unknown): Promise<{ response: BotOutboundMessage | null }> {
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_ENGINE_URL}/execute`, {
       method: 'POST',
       headers,
       body: JSON.stringify(event),
     });
     return handleResponse<{ response: BotOutboundMessage | null }>(response);
   },

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
// CONVENIENCE HOOKS — Full implementation (replaces createBotHooks stubs)
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * useBots — список всех ботов пользователя (cursor-based)
 */
export function useBots(options?: { limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['bots', options],
    queryFn: () => botApi.listBots(options),
  });
}

/**
 * useBotRuns — логи выполнения обработчиков (cursor-based)
 */
export function useBotRuns(botId: string, options?: { limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: ['bot-runs', botId, options],
    queryFn: () => botApi.getBotRuns(botId, options),
    enabled: !!botId,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * useBot — данные одного бота
 */
export function useBot(botId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['bot', botId],
    queryFn: () => botApi.getBot(botId),
    enabled: !!botId,
  });
}

/**
 * useBotHandlers — список обработчиков бота
 */
export function useBotHandlers(botId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['bot-handlers', botId],
    queryFn: () => botApi.getBotHandlers(botId),
    enabled: !!botId,
  });
}

/**
 * useCreateBotHandler — создание обработчика
 */
export function useCreateBotHandler(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<import('@/lib/bots/types').BotHandler, 'id' | 'created_at' | 'updated_at'>) =>
      botApi.createBotHandler(botId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
  });
}

/**
 * useUpdateBotHandler — обновление обработчика
 */
export function useUpdateBotHandler(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ handlerId, data }: { handlerId: string; data: Partial<import('@/lib/bots/types').BotHandler> }) =>
      botApi.updateBotHandler(botId, handlerId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
  });
}

/**
 * useDeleteBotHandler — удаление обработчика
 */
export function useDeleteBotHandler(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (handlerId: string) => botApi.deleteBotHandler(botId, handlerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
  });
}

/**
 * useBotKeyboards — список клавиатур бота
 */
export function useBotKeyboards(botId: string) {
  return useQuery({
    queryKey: ['bot-keyboards', botId],
    queryFn: () => botApi.getBotKeyboards(botId),
    enabled: !!botId,
  });
}

/**
 * useBotConversationStates — FSM-состояния бота
 */
export function useBotConversationStates(botId: string) {
  return useQuery({
    queryKey: ['bot-states', botId],
    queryFn: () => botApi.getBotStates(botId),
    enabled: !!botId,
  });
}

/**
 * useBotRuns — логи выполнения обработчиков
 */
export function useBotRuns(botId: string, options?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['bot-runs', botId, options],
    queryFn: () => botApi.getBotRuns(botId, options),
    enabled: !!botId,
  });
}

/**
 * useBotAnalytics — аналитика бота
 */
export function useBotAnalytics(botId: string, days = 30) {
  return useQuery({
    queryKey: ['bot-analytics', botId, days],
    queryFn: () => botApi.getBotAnalytics(botId, { days }),
    enabled: !!botId,
  });
}

/**
 * useCreateWebhook — создание webhook
 */
export function useCreateWebhook(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: import('@/lib/bots/types').CreateBotWebhookRequest) =>
      botApi.setBotWebhook(botId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot', botId] }),
  });
}

/**
 * useDeleteWebhook — удаление webhook
 */
export function useDeleteWebhook(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => botApi.deleteBotWebhook(botId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot', botId] }),
  });
}

/**
 * useBotCommands — команды бота
 */
export function useBotCommands(botId: string) {
  return useQuery({
    queryKey: ['bot-commands', botId],
    queryFn: () => botApi.getBotCommands(botId),
    enabled: !!botId,
  });
}

/**
 * useSetBotCommands — установка команд бота
 */
export function useSetBotCommands(botId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commands: import('@/lib/bots/types').CreateBotCommandRequest[]) =>
      botApi.setBotCommands(botId, commands),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-commands', botId] });
    },
  });
}

// ============================================================================
// INDIVIDUAL HOOKS — Full implementations (replaces deprecated createBotHooks)
// ============================================================================
