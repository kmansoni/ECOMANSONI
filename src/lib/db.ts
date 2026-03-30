/**
 * Database Adapter - единая точка доступа к Supabase
 * 
 * Все запросы направляются в Supabase.
 */

import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { dbLoose } from '@/lib/supabase';
import { logger } from '@/lib/logger';
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
  return supabaseClient;
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
   * RPC - через Supabase
   */
  rpc: (fn: string, params?: Record<string, unknown>) => {
    return dbLoose.rpc(fn, params);
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
  },

  /**
   * Информация о текущей конфигурации
   */
  config: {
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
  logger.info("[DB Adapter] Configuration", {
    mode: 'SUPABASE_ONLY',
    supabaseOnlyTables: SUPABASE_ONLY_TABLES,
  });
}
