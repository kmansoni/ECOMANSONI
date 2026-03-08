/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_TURN_CREDENTIALS_URL: string;
  readonly VITE_TURN_CREDENTIALS_API_KEY: string;
  readonly VITE_AI_API_KEY: string;
  readonly VITE_AI_API_URL: string;
  readonly VITE_AI_MODEL: string;
  readonly VITE_MEDIA_SERVER_URL: string;
  // Livestream Gateway
  readonly VITE_LIVESTREAM_GATEWAY_URL: string;
  readonly VITE_LIVEKIT_PUBLIC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
