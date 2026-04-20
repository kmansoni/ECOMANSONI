function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getPort(name, defaultPort) {
  const rawValue = process.env[name];

  if (rawValue == null || rawValue.trim() === '') {
    return defaultPort;
  }

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port in ${name}: ${rawValue}`);
  }

  return port;
}

export function loadConfig() {
  return {
    port: getPort('BOT_API_PORT', 3001),
    supabaseUrl: getRequiredEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
