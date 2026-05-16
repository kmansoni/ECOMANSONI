/**
 * Bot Platform API Client
 *
 * Frontend client for interacting with the Bot Platform API.
 */

import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;

  const errorValue = payload.error;
  if (typeof errorValue === 'string' && errorValue.trim()) {
    return errorValue;
  }

  const messageValue = payload.message;
  if (typeof messageValue === 'string' && messageValue.trim()) {
    return messageValue;
  }

  return fallback;
}

function requireNonEmptyString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireObjectPayload(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function requireObjectArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((item) => isRecord(item))) {
    throw new Error(`${fieldName} must be an array of objects`);
  }
  return value;
}

async function handleResponse<T>(response: Response): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    throw new Error('Invalid JSON response');
  }

  if (!response.ok) {
    throw new Error(pickErrorMessage(payload, `HTTP ${response.status}`));
  }

  if (!isRecord(payload)) {
    throw new Error('Invalid API response shape');
  }

  if ('ok' in payload && payload.ok !== true) {
    throw new Error(pickErrorMessage(payload, 'Unknown error'));
  }

  return payload as T;
}

// ============================================================================
// BOT API
// ============================================================================

export const botApi = {
  /**
   * Create a new bot
   */
  async createBot(data: CreateBotRequest): Promise<{ bot: Bot; token: string }> {
    requireObjectPayload(data, 'data');
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
     const result = await handleResponse<{ bots: Bot[]; total: number; next_cursor?: string }>(response);
     return {
       bots: result.bots,
       total: result.total,
       nextCursor: result.next_cursor,
     };
   },

  /**
   * Get a bot by ID
   */
  async getBot(botId: string): Promise<BotWithOwner> {
    const safeBotId = requireNonEmptyString(botId, 'botId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}`, { headers });
    return handleResponse<BotWithOwner>(response);
  },

  /**
   * Get bot by username (public)
   */
  async getBotByUsername(username: string): Promise<Bot> {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      throw new Error('username is required');
    }

    const response = await fetch(`${BOT_API_URL}/bot/${encodeURIComponent(normalizedUsername)}`);
    return handleResponse<Bot>(response);
  },

  /**
   * Update a bot
   */
  async updateBot(botId: string, data: UpdateBotRequest): Promise<Bot> {
    const safeBotId = requireNonEmptyString(botId, 'botId');
    requireObjectPayload(data, 'data');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}`, {
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
    const safeBotId = requireNonEmptyString(botId, 'botId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}`, {
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
    const safeBotId = requireNonEmptyString(botId, 'botId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/tokens`, {
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
    const safeBotId = requireNonEmptyString(botId, 'botId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/tokens`, { headers });
    return handleResponse<{ tokens: (BotToken & { token?: never })[] }>(response);
  },

  /**
   * Delete a bot token
   */
  async deleteBotToken(botId: string, tokenId: string): Promise<void> {
    const safeBotId = requireNonEmptyString(botId, 'botId');
    const safeTokenId = requireNonEmptyString(tokenId, 'tokenId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/tokens/${safeTokenId}`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/commands`, { headers });
     return handleResponse<{ commands: BotCommand[] }>(response);
   },

   /**
    * Set bot commands
    */
   async setBotCommands(botId: string, commands: CreateBotCommandRequest[]): Promise<void> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     requireObjectArray(commands, 'commands');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/commands`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/webhook`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/webhook`, {
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
      const safeBotId = requireNonEmptyString(botId, 'botId');
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.cursor) params.set('cursor', options.cursor);

      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/sessions?${params.toString()}`, { headers });
      const result = await handleResponse<{ sessions: BotSession[]; total: number; next_cursor?: string }>(response);
      return {
        sessions: result.sessions,
        total: result.total,
        nextCursor: result.next_cursor,
      };
    },

   /**
    * End a bot session
    */
   async endBotSession(botId: string, sessionId: string): Promise<{ message: string }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeSessionId = requireNonEmptyString(sessionId, 'sessionId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/sessions/${safeSessionId}/end`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/keyboards`, { headers });
     return handleResponse<{ keyboards: BotKeyboard[] }>(response);
   },

   /**
    * Create a bot keyboard
    */
   async createBotKeyboard(botId: string, data: Omit<BotKeyboard, 'id' | 'created_at' | 'updated_at'>): Promise<{ keyboard: BotKeyboard }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/keyboards`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeKeyboardId = requireNonEmptyString(keyboardId, 'keyboardId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/keyboards/${safeKeyboardId}`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeKeyboardId = requireNonEmptyString(keyboardId, 'keyboardId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/keyboards/${safeKeyboardId}`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/states`, { headers });
     return handleResponse<{ states: BotConversationState[] }>(response);
   },

   /**
    * Create a bot conversation state (FSM)
    */
   async createBotState(botId: string, data: Omit<BotConversationState, 'id' | 'created_at' | 'updated_at'>): Promise<{ state: BotConversationState }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/states`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeStateId = requireNonEmptyString(stateId, 'stateId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/states/${safeStateId}`, {
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
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeStateId = requireNonEmptyString(stateId, 'stateId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/states/${safeStateId}`, {
       method: 'DELETE',
       headers,
     });
     return handleResponse<{ message: string }>(response);
   },

   // ===== BOT HANDLERS =====

   /**
    * Get bot handlers
    */
   async getBotHandlers(botId: string): Promise<{ handlers: BotHandler[] }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/handlers`, { headers });
     return handleResponse<{ handlers: BotHandler[] }>(response);
   },

   /**
    * Create a bot handler
    */
   async createBotHandler(botId: string, data: Omit<BotHandler, 'id' | 'created_at' | 'updated_at'>): Promise<{ handler: BotHandler }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/handlers`, {
       method: 'POST',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ handler: BotHandler }>(response);
   },

   /**
    * Update a bot handler
    */
   async updateBotHandler(botId: string, handlerId: string, data: Partial<BotHandler>): Promise<{ handler: BotHandler }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeHandlerId = requireNonEmptyString(handlerId, 'handlerId');
     requireObjectPayload(data, 'data');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/handlers/${safeHandlerId}`, {
       method: 'PATCH',
       headers,
       body: JSON.stringify(data),
     });
     return handleResponse<{ handler: BotHandler }>(response);
   },

   /**
    * Delete a bot handler
    */
   async deleteBotHandler(botId: string, handlerId: string): Promise<{ message: string }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const safeHandlerId = requireNonEmptyString(handlerId, 'handlerId');
     const headers = await getAuthHeaders();
     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/handlers/${safeHandlerId}`, {
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
      const safeBotId = requireNonEmptyString(botId, 'botId');
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.cursor) params.set('cursor', options.cursor);

      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/runs?${params.toString()}`, { headers });
      const result = await handleResponse<{ runs: BotRun[]; total: number; next_cursor?: string }>(response);
      return {
        runs: result.runs,
        total: result.total,
        nextCursor: result.next_cursor,
      };
    },

   // ============================================================================
   // MINI APP API
   // ============================================================================

   /**
    * Get bot analytics
    */
   async getBotAnalytics(botId: string, options?: { days?: number }): Promise<{ analytics: BotAnalytics[] }> {
     const safeBotId = requireNonEmptyString(botId, 'botId');
     const headers = await getAuthHeaders();
     const params = new URLSearchParams();
     if (options?.days) params.set('days', String(options.days));

     const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/analytics?${params.toString()}`, { headers });
     return handleResponse<{ analytics: BotAnalytics[] }>(response);
   },

   // ============================================================================
   // EXECUTE
   // ============================================================================

    /**
     * Execute a handler programmatically
     */
    async executeHandler(botId: string, event: unknown): Promise<{ response: BotOutboundMessage | null }> {
        const safeBotId = requireNonEmptyString(botId, 'botId');
       const eventRecord = isRecord(event) ? event : {};
       if (!('bot_id' in eventRecord)) {
         (eventRecord as Record<string, unknown>).bot_id = safeBotId;
       }

      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_ENGINE_URL}/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      });
      return handleResponse<{ response: BotOutboundMessage | null }>(response);
    },

    // ===== GUEST BOTS =====

    /**
     * Register bot as guest-mode enabled
     */
    async registerGuestBot(botId: string, data: { supports_guest_queries: boolean }): Promise<{ ok: boolean }> {
      const safeBotId = requireNonEmptyString(botId, 'botId');
      if (typeof data.supports_guest_queries !== 'boolean') {
        throw new Error('supports_guest_queries must be a boolean');
      }
      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/guest-mode`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return handleResponse<{ ok: boolean }>(response);
    },

    /**
     * Send response to a guest query
     */
    async answerGuestQuery(botId: string, guestQueryId: string, data: { text: string; media_url?: string; media_type?: string }): Promise<{ ok: boolean; message_id?: string }> {
      const safeBotId = requireNonEmptyString(botId, 'botId');
      const safeGuestQueryId = requireNonEmptyString(guestQueryId, 'guestQueryId');
      const safeText = requireNonEmptyString(data.text, 'text');

      if (data.media_url !== undefined && typeof data.media_url !== 'string') {
        throw new Error('media_url must be a string');
      }
      if (data.media_type !== undefined && typeof data.media_type !== 'string') {
        throw new Error('media_type must be a string');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/guest-queries/${safeGuestQueryId}/answer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...data,
          text: safeText,
        }),
      });
      return handleResponse<{ ok: boolean; message_id?: string }>(response);
    },

    // ===== BOT-TO-BOT =====

    /**
     * Send a message from one bot to another bot
     */
    async sendBotToBotMessage(fromBotId: string, toBotId: string, data: { content: string; type: string; session_id: string; media_url?: string; media_type?: string; reply_to_message_id?: string }): Promise<{ ok: boolean; message_id?: string }> {
      const safeFromBotId = requireNonEmptyString(fromBotId, 'fromBotId');
      const safeToBotId = requireNonEmptyString(toBotId, 'toBotId');
      const safeContent = requireNonEmptyString(data.content, 'content');
      const safeType = requireNonEmptyString(data.type, 'type');
      const safeSessionId = requireNonEmptyString(data.session_id, 'session_id');

      if (data.media_url !== undefined && typeof data.media_url !== 'string') {
        throw new Error('media_url must be a string');
      }
      if (data.media_type !== undefined && typeof data.media_type !== 'string') {
        throw new Error('media_type must be a string');
      }
      if (data.reply_to_message_id !== undefined && typeof data.reply_to_message_id !== 'string') {
        throw new Error('reply_to_message_id must be a string');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/bots/${safeFromBotId}/send-to-bot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to_bot_id: safeToBotId,
          ...data,
          content: safeContent,
          type: safeType,
          session_id: safeSessionId,
        }),
      });
      return handleResponse<{ ok: boolean; message_id?: string }>(response);
    },

    // ===== CHAT AUTOMATION =====

    /**
     * Register chat automation rule for a bot
     */
    async registerChatAutomation(botId: string, data: { user_id: string; chat_ids: string[]; triggers: unknown[]; allowed_message_types: string[] }): Promise<{ rule_id: string }> {
      const safeBotId = requireNonEmptyString(botId, 'botId');
      const safeUserId = requireNonEmptyString(data.user_id, 'user_id');

      if (!isStringArray(data.chat_ids) || data.chat_ids.length === 0) {
        throw new Error('chat_ids must be a non-empty string array');
      }
      if (!Array.isArray(data.triggers)) {
        throw new Error('triggers must be an array');
      }
      if (!isStringArray(data.allowed_message_types) || data.allowed_message_types.length === 0) {
        throw new Error('allowed_message_types must be a non-empty string array');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/automation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...data,
          user_id: safeUserId,
          chat_ids: data.chat_ids.map((id) => requireNonEmptyString(id, 'chat_ids item')),
          allowed_message_types: data.allowed_message_types.map((item) => requireNonEmptyString(item, 'allowed_message_types item')),
        }),
      });
      return handleResponse<{ rule_id: string }>(response);
    },

    /**
     * Get automation rules for a bot
     */
    async getAutomationRules(botId: string): Promise<{ rules: unknown[] }> {
      const safeBotId = requireNonEmptyString(botId, 'botId');
      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/bots/${safeBotId}/automation`, { headers });
      return handleResponse<{ rules: unknown[] }>(response);
    },

    // ===== CUSTOM AI STYLES =====

    /**
     * Create custom AI style
     */
    async createAIStyle(data: { name: string; description?: string; system_prompt: string; user_id: string }): Promise<{ style: { style_id: string } }> {
      requireObjectPayload(data, 'data');
      const safeName = requireNonEmptyString(data.name, 'name');
      const safeSystemPrompt = requireNonEmptyString(data.system_prompt, 'system_prompt');
      const safeUserId = requireNonEmptyString(data.user_id, 'user_id');
      const safeDescription = data.description?.trim();

      if (data.description !== undefined && typeof data.description !== 'string') {
        throw new Error('description must be a string');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/ai-styles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...data,
          name: safeName,
          system_prompt: safeSystemPrompt,
          user_id: safeUserId,
          description: safeDescription,
        }),
      });
      return handleResponse<{ style: { style_id: string } }>(response);
    },

    /**
     * List user's AI styles
     */
    async listAIStyles(userId: string): Promise<{ styles: unknown[] }> {
      const safeUserId = requireNonEmptyString(userId, 'userId');
      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/ai-styles?user_id=${encodeURIComponent(safeUserId)}`, { headers });
      return handleResponse<{ styles: unknown[] }>(response);
    },

    /**
     * Apply AI style to text
     */
    async applyAIStyle(styleId: string, text: string, language: string): Promise<{ result_text: string }> {
      const safeStyleId = requireNonEmptyString(styleId, 'styleId');
      const safeText = requireNonEmptyString(text, 'text');
      const safeLanguage = requireNonEmptyString(language, 'language');
      const headers = await getAuthHeaders();
      const response = await fetch(`${BOT_API_URL}/ai-styles/${safeStyleId}/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: safeText, language: safeLanguage }),
      });
      return handleResponse<{ result_text: string }>(response);
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
    requireObjectPayload(data, 'data');
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
    const safeAppId = requireNonEmptyString(appId, 'appId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${safeAppId}`, { headers });
    return handleResponse<MiniAppWithOwner>(response);
  },

  /**
   * Get mini app by slug (public)
   */
  async getMiniAppBySlug(slug: string): Promise<MiniApp> {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) {
      throw new Error('slug is required');
    }

    const response = await fetch(`${MINI_APP_API_URL}/app/${encodeURIComponent(normalizedSlug)}`);
    return handleResponse<MiniApp>(response);
  },

  /**
   * Update a mini app
   */
  async updateMiniApp(appId: string, data: UpdateMiniAppRequest): Promise<MiniApp> {
    const safeAppId = requireNonEmptyString(appId, 'appId');
    requireObjectPayload(data, 'data');
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${safeAppId}`, {
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
    const safeAppId = requireNonEmptyString(appId, 'appId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${safeAppId}`, {
      method: 'DELETE',
      headers,
    });
    await handleResponse<{ message: string }>(response);
  },

  /**
   * Start a mini app session
   */
  async startSession(appId: string, platform?: string, deviceInfo?: Record<string, unknown>): Promise<{ session: { id: string } }> {
    const safeAppId = requireNonEmptyString(appId, 'appId');
    if (platform !== undefined && typeof platform !== 'string') {
      throw new Error('platform must be a string');
    }
    if (deviceInfo !== undefined) {
      requireObjectPayload(deviceInfo, 'deviceInfo');
    }
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${safeAppId}/sessions`, {
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
    const safeAppId = requireNonEmptyString(appId, 'appId');
    const safeSessionId = requireNonEmptyString(sessionId, 'sessionId');
    const headers = await getAuthHeaders();
    const response = await fetch(`${MINI_APP_API_URL}/mini-apps/${safeAppId}/sessions/${safeSessionId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse<{ duration_seconds: number }>(response);
  },
};

// ============================================================================
// CONVENIENCE HOOKS — Full implementation (replaces createBotHooks stubs)
// ============================================================================

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
    enabled: Boolean(botId.trim()),
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
    enabled: Boolean(botId.trim()),
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
    enabled: Boolean(botId.trim()),
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
    enabled: Boolean(botId.trim()),
  });
}

/**
 * useBotConversationStates — FSM-состояния бота
 */
export function useBotConversationStates(botId: string) {
  return useQuery({
    queryKey: ['bot-states', botId],
    queryFn: () => botApi.getBotStates(botId),
    enabled: Boolean(botId.trim()),
  });
}

/**
 * useBotAnalytics — аналитика бота
 */
export function useBotAnalytics(botId: string, days = 30) {
  return useQuery({
    queryKey: ['bot-analytics', botId, days],
    queryFn: () => botApi.getBotAnalytics(botId, { days }),
    enabled: Boolean(botId.trim()),
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
    enabled: Boolean(botId.trim()),
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
