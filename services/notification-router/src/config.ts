export interface RouterConfig {
  nodeEnv: string;
  redisUrl: string;
  queuePrefix: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pollIntervalMs: number;
  claimBatchSize: number;
  apnsTopic: string;
  apnsVoipTopic?: string;
  apnsUseSandbox: boolean;
  apnsKeyId: string;
  apnsTeamId: string;
  apnsPrivateKey: string;
  fcmProjectId: string;
  fcmClientEmail: string;
  fcmPrivateKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[notification-router] Missing env: ${name}`);
  }
  return value;
}

export function readConfig(): RouterConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    queuePrefix: process.env.NOTIF_QUEUE_PREFIX ?? "mansoni:notif",
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    pollIntervalMs: Number(process.env.NOTIF_POLL_INTERVAL_MS ?? "1200"),
    claimBatchSize: Number(process.env.NOTIF_CLAIM_BATCH_SIZE ?? "100"),
    apnsTopic: requireEnv("APNS_TOPIC"),
    apnsVoipTopic: process.env.APNS_VOIP_TOPIC,
    apnsUseSandbox: process.env.APNS_USE_SANDBOX === "1",
    apnsKeyId: requireEnv("APNS_KEY_ID"),
    apnsTeamId: requireEnv("APNS_TEAM_ID"),
    apnsPrivateKey: requireEnv("APNS_PRIVATE_KEY"),
    fcmProjectId: requireEnv("FCM_PROJECT_ID"),
    fcmClientEmail: requireEnv("FCM_CLIENT_EMAIL"),
    fcmPrivateKey: requireEnv("FCM_PRIVATE_KEY"),
  };
}
