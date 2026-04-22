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
  readonly VITE_NAV_SERVER_ENABLED?: string;
  readonly VITE_NAV_SERVER_URL?: string;
  readonly VITE_NAV_SERVER_TIMEOUT_MS?: string;
  readonly VITE_NAV_SERVER_RETRIES?: string;
  readonly VITE_NAV_SERVER_RETRY_DELAY_MS?: string;
  readonly VITE_NAV_SERVER_CB_FAILURE_THRESHOLD?: string;
  readonly VITE_NAV_SERVER_CB_COOLDOWN_MS?: string;
  readonly VITE_NAV_DIAGNOSTICS?: string;
  // Livestream Gateway
  readonly VITE_LIVESTREAM_GATEWAY_URL: string;
  readonly VITE_LIVEKIT_PUBLIC_URL: string;
  readonly VITE_E2EE_REQUIRE_WEBAUTHN?: string;
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
