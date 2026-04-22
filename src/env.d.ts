/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MUSIC_MODULE_URL?: string;
  readonly VITE_GODMODE_URL?: string;
  // Добавьте другие VITE_ переменные
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
