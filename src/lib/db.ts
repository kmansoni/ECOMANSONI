/**
 * Database Adapter - умный роутер между Supabase и Timeweb
 * 
 * Автоматически направляет запросы:
 * - Auth, TURN, Storage → Supabase (критично для звонков!)
 * - Все остальное (данные) → Timeweb (если настроен)
 */

import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { timewebClient, isTimewebEnabled } from '@/integrations/timeweb/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Таблицы, которые ВСЕГДА идут через Supabase (критично для WebRTC)
const SUPABASE_ONLY_TABLES = [
  'turn_credentials',
  'user_sessions',
  'device_accounts',
];

type TableName = keyof Database['public']['Tables'];

/**
 * Определяет, какой клиент использовать для операции
 */
function getClientForTable(tableName: string): SupabaseClient<Database> {
  // Если Timeweb не настроен, всегда используем Supabase
  if (!isTimewebEnabled) {
    return supabaseClient;
  }

  // Таблицы для WebRTC и Auth остаются на Supabase
  if (SUPABASE_ONLY_TABLES.includes(tableName)) {
    return supabaseClient;
  }

  // Остальное идет в Timeweb
  return timewebClient!;
}

/**
 * Умный клиент БД с автоматической маршрутизацией
 */
export const db = {
  /**
   * Доступ к таблице с автоматическим выбором БД
   */
  from: <T extends TableName>(tableName: T) => {
    const client = getClientForTable(tableName);
    return client.from(tableName);
  },

  /**
   * RPC - всегда через Timeweb (если настроен)
   */
  rpc: (fn: string, params?: any) => {
    const client = isTimewebEnabled ? timewebClient! : supabaseClient;
    return (client as any).rpc(fn, params);
  },

  /**
   * Auth - ВСЕГДА через Supabase (критично!)
   */
  auth: supabaseClient.auth,

  /**
   * Storage - ВСЕГДА через Supabase
   */
  storage: supabaseClient.storage,

  /**
   * Functions - ВСЕГДА через Supabase (включая TURN)
   */
  functions: supabaseClient.functions,

  /**
   * Прямой доступ к клиентам для специальных случаев
   */
  clients: {
    supabase: supabaseClient,
    timeweb: timewebClient,
  },

  /**
   * Информация о текущей конфигурации
   */
  config: {
    isTimewebEnabled,
    getClientForTable,
  },
};

/**
 * Для обратной совместимости - основной клиент Supabase
 * Используй `db` для новых запросов!
 */
export const supabase = supabaseClient;

// Логирование в dev режиме
if (import.meta.env.DEV) {
  console.info("[DB Adapter] Configuration", {
    timewebEnabled: isTimewebEnabled,
    mode: isTimewebEnabled ? 'DUAL (Timeweb + Supabase)' : 'SUPABASE_ONLY',
    supabaseOnlyTables: SUPABASE_ONLY_TABLES,
  });
}
