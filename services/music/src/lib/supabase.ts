import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

let cachedClient: SupabaseClient | null = null;
let cachedToken: string | null = null;

// Получаем Mansoni JWT из глобальной переменной или localStorage
// MusicPage устанавливает window.__MANSONI_TOKEN__ при загрузке модуля
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return (
      (window as any).__MANSONI_TOKEN__ ||
      localStorage.getItem('mansoni_token') ||
      localStorage.getItem('supabase.auth.token')
    );
  }
  return null;
}

export function setMansoniToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  (window as any).__MANSONI_TOKEN__ = token;
  localStorage.setItem('mansoni_token', token);
}

export function getSupabaseClient(): SupabaseClient {
  const authToken = getAuthToken();

  if (cachedClient && cachedToken === authToken) {
    return cachedClient;
  }

  cachedToken = authToken;
  cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

  return cachedClient;
}

export const supabase: SupabaseClient = getSupabaseClient();

// Realtime subscription helper
export function supabaseRealtime() {
  return getSupabaseClient().channel('music');
}

export default supabase;
