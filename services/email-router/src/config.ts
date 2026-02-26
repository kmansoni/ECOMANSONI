import { z } from "zod";
import type { ProviderKind } from "./types.js";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  EMAIL_ROUTER_POSTGREST_URL: z.string().url().optional(),
  EMAIL_ROUTER_PORT: z.coerce.number().int().positive().default(8090),
  EMAIL_ROUTER_PROVIDER: z.enum(["stub", "smtp", "sendmail"]).default("stub"),
  EMAIL_ROUTER_POLL_MS: z.coerce.number().int().positive().default(2000),
  EMAIL_ROUTER_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(25),
  EMAIL_ROUTER_LOCK_SECONDS: z.coerce.number().int().positive().default(90),
  EMAIL_ROUTER_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
  EMAIL_ROUTER_DEFAULT_FROM: z.string().email().default("noreply@example.com"),
  EMAIL_ROUTER_INGEST_KEY: z.string().min(1).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SENDMAIL_PATH: z.string().optional(),
});

export type AppConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  postgrestUrl?: string;
  port: number;
  provider: ProviderKind;
  pollMs: number;
  batchSize: number;
  lockSeconds: number;
  defaultMaxAttempts: number;
  defaultFrom: string;
  ingestKey?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };
  sendmail?: {
    path?: string;
    from?: string;
  };
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);

  if (parsed.EMAIL_ROUTER_PROVIDER === "smtp" && !parsed.SMTP_HOST) {
    throw new Error("SMTP_HOST is required when EMAIL_ROUTER_PROVIDER=smtp");
  }

  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    postgrestUrl: parsed.EMAIL_ROUTER_POSTGREST_URL,
    port: parsed.EMAIL_ROUTER_PORT,
    provider: parsed.EMAIL_ROUTER_PROVIDER,
    pollMs: parsed.EMAIL_ROUTER_POLL_MS,
    batchSize: parsed.EMAIL_ROUTER_BATCH_SIZE,
    lockSeconds: parsed.EMAIL_ROUTER_LOCK_SECONDS,
    defaultMaxAttempts: parsed.EMAIL_ROUTER_DEFAULT_MAX_ATTEMPTS,
    defaultFrom: parsed.EMAIL_ROUTER_DEFAULT_FROM,
    ingestKey: parsed.EMAIL_ROUTER_INGEST_KEY,
    smtp: parsed.SMTP_HOST
      ? {
          host: parsed.SMTP_HOST,
          port: parsed.SMTP_PORT,
          secure: Boolean(parsed.SMTP_SECURE),
          user: parsed.SMTP_USER,
          pass: parsed.SMTP_PASS,
          from: parsed.SMTP_FROM,
        }
      : undefined,
    sendmail: {
      path: parsed.SENDMAIL_PATH,
      from: parsed.SMTP_FROM,
    },
  };
}
