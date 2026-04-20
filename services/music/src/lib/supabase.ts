import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Получаем Mansoni JWT из глобальной переменной или localStorage
// MusicPage устанавливает window.__MANSONI_TOKEN__ при загрузке модуля
function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return (
      (window as any).__MANSONI_TOKEN__ ||
      localStorage.getItem('mansoni_token') ||
      localStorage.getItem('supabase.auth.token')
    );
  }
  return null;
}

const authToken = getAuthToken();

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  },
});

// Realtime subscription helper
export const supabaseRealtime = supabase.channel('music');

export default supabase;
