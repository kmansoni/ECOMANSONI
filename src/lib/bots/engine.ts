/**
 * Bot Engine — Frontend API Client
 *
 * Клиент для управления обработчиками, сессиями, клавиатурами ботов.
 * Реальные запросы к API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { botApi } from './api';
import type { BotHandler, BotSession, BotKeyboard, BotConversationState, BotRun } from './types';

// ============================================================================
// Handler Hooks
// ============================================================================

export function createBotEngineHooks(botId: string) {
  const queryClient = useQueryClient();

  /** Список обработчиков бота */
  const useHandlers = () =>
    useQuery({
      queryKey: ['bot-handlers', botId],
      queryFn: () => botApi.getBotHandlers(botId),
      enabled: !!botId,
    });

  /** Создание обработчика */
  const useCreateHandler = () =>
    useMutation({
      mutationFn: (data: Omit<BotHandler, 'id' | 'created_at' | 'updated_at'>) =>
        botApi.createBotHandler(botId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
    });

  /** Обновление обработчика */
  const useUpdateHandler = () =>
    useMutation({
      mutationFn: ({ handlerId, data }: { handlerId: string; data: Partial<BotHandler> }) =>
        botApi.updateBotHandler(botId, handlerId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
    });

  /** Удаление обработчика */
  const useDeleteHandler = () =>
    useMutation({
      mutationFn: (handlerId: string) => botApi.deleteBotHandler(botId, handlerId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-handlers', botId] }),
    });

  return { useHandlers, useCreateHandler, useUpdateHandler, useDeleteHandler };
}

// ============================================================================
// Session Hooks
// ============================================================================

export function useBotSessions(botId: string) {
  const queryClient = useQueryClient();

  const useSessions = () =>
    useQuery({
      queryKey: ['bot-sessions', botId],
      queryFn: () => BotSessionApi.listSessions(botId),
      enabled: !!botId,
    });

  const useSession = (sessionId: string) =>
    useQuery({
      queryKey: ['bot-session', sessionId],
      queryFn: () => BotSessionApi.getSession(botId, sessionId),
      enabled: !!sessionId,
    });

  const useEndSession = () =>
    useMutation({
      mutationFn: (sessionId: string) => BotSessionApi.endSession(botId, sessionId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-sessions', botId] }),
    });

  return { useSessions, useSession, useEndSession };
}

// ============================================================================
// Keyboard Hooks
// ============================================================================

export function useBotKeyboards(botId: string) {
  const queryClient = useQueryClient();

  const useKeyboards = () =>
    useQuery({
      queryKey: ['bot-keyboards', botId],
      queryFn: () => BotKeyboardApi.listKeyboards(botId),
      enabled: !!botId,
    });

  const useCreateKeyboard = () =>
    useMutation({
      mutationFn: (data: Omit<BotKeyboard, 'id' | 'created_at' | 'updated_at'>) =>
        BotKeyboardApi.createKeyboard(botId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-keyboards', botId] }),
    });

  const useDeleteKeyboard = () =>
    useMutation({
      mutationFn: (keyboardId: string) => BotKeyboardApi.deleteKeyboard(botId, keyboardId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-keyboards', botId] }),
    });

  const useUpdateKeyboard = () =>
    useMutation({
      mutationFn: ({ keyboardId, data }: { keyboardId: string; data: Partial<BotKeyboard> }) =>
        BotKeyboardApi.updateKeyboard(botId, keyboardId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-keyboards', botId] }),
    });

  return { useKeyboards, useCreateKeyboard, useDeleteKeyboard, useUpdateKeyboard };
}

// ============================================================================
// Conversation State Hooks
// ============================================================================

export function useBotStates(botId: string) {
  const queryClient = useQueryClient();

  const useStates = () =>
    useQuery({
      queryKey: ['bot-states', botId],
      queryFn: () => BotStateApi.listStates(botId),
      enabled: !!botId,
    });

  const useCreateState = () =>
    useMutation({
      mutationFn: (data: Omit<BotConversationState, 'id' | 'created_at' | 'updated_at'>) =>
        BotStateApi.createState(botId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-states', botId] }),
    });

  const useUpdateState = () =>
    useMutation({
      mutationFn: ({ stateId, data }: { stateId: string; data: Partial<BotConversationState> }) =>
        BotStateApi.updateState(botId, stateId, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-states', botId] }),
    });

  const useDeleteState = () =>
    useMutation({
      mutationFn: (stateId: string) => BotStateApi.deleteState(botId, stateId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-states', botId] }),
    });

  return { useStates, useCreateState, useUpdateState, useDeleteState };
}

// ============================================================================
// Runs (Execution Logs) — read-only
// ============================================================================

export function useBotRuns(botId: string, options: { limit?: number; cursor?: string } = {}) {
   return useQuery({
     queryKey: ['bot-runs', botId, options],
     queryFn: () => BotRunApi.listRuns(botId, options),
     enabled: !!botId,
     getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
   });
 }

// ============================================================================
// Direct API wrapper (without React hooks — for imperative calls)
// ============================================================================

export const BotEngineApi = {
  handlers: {
    list: (botId: string) => botApi.getBotHandlers(botId),
    create: (botId: string, data: Omit<BotHandler, 'id' | 'created_at' | 'updated_at'>) =>
      botApi.createBotHandler(botId, data),
    update: (botId: string, handlerId: string, data: Partial<BotHandler>) =>
      botApi.updateBotHandler(botId, handlerId, data),
    delete: (botId: string, handlerId: string) => botApi.deleteBotHandler(botId, handlerId),
    execute: (botId: string, event: unknown) => botApi.executeHandler(botId, event),
  },
  sessions: {
    list: (botId: string) => BotSessionApi.listSessions(botId),
    get: (botId: string, sessionId: string) => BotSessionApi.getSession(botId, sessionId),
    end: (botId: string, sessionId: string) => BotSessionApi.endSession(botId, sessionId),
    clearVariables: (botId: string, sessionId: string) =>
      BotSessionApi.clearVariables(botId, sessionId),
  },
  keyboards: {
    list: (botId: string) => BotKeyboardApi.listKeyboards(botId),
    create: (botId: string, data: Omit<BotKeyboard, 'id' | 'created_at' | 'updated_at'>) =>
      BotKeyboardApi.createKeyboard(botId, data),
    update: (botId: string, keyboardId: string, data: Partial<BotKeyboard>) =>
      BotKeyboardApi.updateKeyboard(botId, keyboardId, data),
    delete: (botId: string, keyboardId: string) =>
      BotKeyboardApi.deleteKeyboard(botId, keyboardId),
  },
  states: {
    list: (botId: string) => BotStateApi.listStates(botId),
    create: (botId: string, data: Omit<BotConversationState, 'id' | 'created_at' | 'updated_at'>) =>
      BotStateApi.createState(botId, data),
    update: (botId: string, stateId: string, data: Partial<BotConversationState>) =>
      BotStateApi.updateState(botId, stateId, data),
    delete: (botId: string, stateId: string) => BotStateApi.deleteState(botId, stateId),
  },
runs: {
     list: (botId: string, opts?: { limit?: number; cursor?: string }) =>
       BotRunApi.listRuns(botId, opts),
   },
 };

// ============================================================================
// Internal API modules
// ============================================================================

const BOT_ENGINE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-engine`;

async function fetchEngine(endpoint: string, options?: RequestInit) {
  const { data: { session } } = await import('@/integrations/supabase/client').then(m => m.supabase.auth.getSession());
  const resp = await fetch(`${BOT_ENGINE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      ...options?.headers,
    },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || 'Engine request failed');
  }

  return resp.json();
}

const BotSessionApi = {
   listSessions: (botId: string, opts?: { limit?: number; cursor?: string }) => {
     const params = new URLSearchParams();
     if (opts?.limit) params.set('limit', String(opts.limit));
     if (opts?.cursor) params.set('cursor', opts.cursor);
     return fetchEngine(`/sessions?bot_id=${botId}&${params}`);
   },
   getSession: (botId: string, sessionId: string) =>
     fetchEngine(`/sessions/${sessionId}?bot_id=${botId}`),
   endSession: (botId: string, sessionId: string) =>
     fetchEngine(`/sessions/${sessionId}/end`, { method: 'POST' }),
   clearVariables: (botId: string, sessionId: string) =>
     fetchEngine(`/sessions/${sessionId}/clear-vars`, { method: 'POST' }),
};

const BotKeyboardApi = {
  listKeyboards: (botId: string) => fetchEngine(`/keyboards?bot_id=${botId}`),
  createKeyboard: (botId: string, data: any) =>
    fetchEngine(`/keyboards`, { method: 'POST', body: JSON.stringify({ bot_id: botId, ...data }) }),
  updateKeyboard: (botId: string, keyboardId: string, data: any) =>
    fetchEngine(`/keyboards/${keyboardId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteKeyboard: (botId: string, keyboardId: string) =>
    fetchEngine(`/keyboards/${keyboardId}`, { method: 'DELETE' }),
};

const BotStateApi = {
  listStates: (botId: string) => fetchEngine(`/states?bot_id=${botId}`),
  createState: (botId: string, data: any) =>
    fetchEngine(`/states`, { method: 'POST', body: JSON.stringify({ bot_id: botId, ...data }) }),
  updateState: (botId: string, stateId: string, data: any) =>
    fetchEngine(`/states/${stateId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteState: (botId: string, stateId: string) =>
    fetchEngine(`/states/${stateId}`, { method: 'DELETE' }),
};

const BotRunApi = {
   listRuns: (botId: string, opts?: { limit?: number; cursor?: string }) => {
     const params = new URLSearchParams();
     if (opts?.limit) params.set('limit', String(opts.limit));
     if (opts?.cursor) params.set('cursor', opts.cursor);
     return fetchEngine(`/runs?bot_id=${botId}&${params}`);
   },
 };