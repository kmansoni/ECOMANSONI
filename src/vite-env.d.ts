/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_CALLS_V2_ENABLED: string;
  readonly VITE_CALLS_V2_WS_URL: string;
  readonly VITE_CALLS_V2_WS_URLS: string;
  readonly VITE_CALLS_V2_REKEY_INTERVAL_MS: string;
  readonly VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME: string;
  readonly VITE_TURN_CREDENTIALS_URL: string;
  readonly VITE_TURN_CREDENTIALS_API_KEY: string;
  readonly VITE_AI_API_KEY: string;
  readonly VITE_AI_API_URL: string;
  readonly VITE_AI_MODEL: string;
  readonly VITE_MEDIA_SERVER_URL: string;
  // Livestream Gateway
  readonly VITE_LIVESTREAM_GATEWAY_URL: string;
  readonly VITE_LIVEKIT_PUBLIC_URL: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_COMMIT_SHA?: string;
  readonly VITE_APP_BUILD_TIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __APP_BUILD__?: {
    name: string;
    version: string;
    commit: string;
    buildTime: string;
    mode: string;
  };
}
