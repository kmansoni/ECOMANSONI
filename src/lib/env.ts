/**
 * Environment variable types and helpers
 * Provides type-safe access to frontend environment variables
 */

interface ImportMetaEnv {
  // Phone Auth
  readonly VITE_PHONE_AUTH_API_URL: string;
  
  // Supabase (Fallback)
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  
  // App Configuration
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly MODE: 'development' | 'production';
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Runtime environment configuration
 * (Safe to expose to client - non-secret values only)
 */
export const ENV = {
  // Auth Configuration
  phoneAuthApiUrl: import.meta.env.VITE_PHONE_AUTH_API_URL || 'http://localhost:3001',
  phoneAuthFunctionUrl: (import.meta as any).env?.VITE_PHONE_AUTH_FUNCTION_URL || '',
  requireSupabaseEnv: ((import.meta as any).env?.VITE_REQUIRE_SUPABASE_ENV || 'false') === 'true',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  
  // App Configuration
  appName: import.meta.env.VITE_APP_NAME || 'ECOMANSONI',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  mode: import.meta.env.MODE,
  
  // Logging
  enableDebugLogging: import.meta.env.DEV,
} as const;

/**
 * Validate environment configuration
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const hasAnyPhoneAuthEndpoint = !!ENV.phoneAuthApiUrl || !!ENV.phoneAuthFunctionUrl;

  if (!ENV.phoneAuthApiUrl) {
    if (ENV.isProduction) {
      errors.push('VITE_PHONE_AUTH_API_URL is required in production');
    }
  }

  if (ENV.requireSupabaseEnv && !ENV.supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is required when VITE_REQUIRE_SUPABASE_ENV=true');
  }

  if (ENV.requireSupabaseEnv && !ENV.supabaseAnonKey) {
    errors.push('VITE_SUPABASE_ANON_KEY is required when VITE_REQUIRE_SUPABASE_ENV=true');
  }

  if (!hasAnyPhoneAuthEndpoint && ENV.isProduction) {
    errors.push('No phone auth endpoint configured (VITE_PHONE_AUTH_API_URL or VITE_PHONE_AUTH_FUNCTION_URL)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log environment configuration (development only)
 */
export function logEnvironment(): void {
  if (!ENV.enableDebugLogging) return;

  console.group('🔧 Environment Configuration');
  console.log('Phone Auth API:', ENV.phoneAuthApiUrl);
  console.log('Phone Auth Function:', ENV.phoneAuthFunctionUrl || '(derived)');
  console.log('Supabase URL:', ENV.supabaseUrl);
  console.log('Environment:', ENV.mode);
  console.log('Development:', ENV.isDevelopment);
  console.groupEnd();
}

// Validate on module load
const validation = validateEnvironment();
if (!validation.valid) {
  console.error('❌ Environment validation failed:');
  validation.errors.forEach(err => console.error(`  - ${err}`));
  if (ENV.isProduction) {
    throw new Error('Missing required environment variables');
  }
}
