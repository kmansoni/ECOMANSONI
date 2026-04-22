export interface TrustEnforcementEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  redisUrl?: string;
  enableMonitoring: boolean;
}

let cachedEnv: TrustEnforcementEnv | null = null;

function readRequiredEnv(name: 'VITE_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[trust-enforcement] Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptionalEnv(name: 'REDIS_URL'): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readBooleanEnv(name: 'TRUST_SERVICE_MONITORING', defaultValue: boolean): boolean {
  const value = process.env[name]?.trim();
  if (!value) {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(
    `[trust-enforcement] Invalid environment variable ${name}: expected "true" or "false"`
  );
}

export function getTrustEnforcementEnv(): TrustEnforcementEnv {
  if (!cachedEnv) {
    cachedEnv = Object.freeze({
      supabaseUrl: readRequiredEnv('VITE_SUPABASE_URL'),
      supabaseServiceRoleKey: readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      redisUrl: readOptionalEnv('REDIS_URL'),
      enableMonitoring: readBooleanEnv('TRUST_SERVICE_MONITORING', false),
    });
  }

  return cachedEnv;
}

export function validateTrustEnforcementEnv(): void {
  getTrustEnforcementEnv();
}
