import net from "node:net";

const NODE_ENV = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
const ENV = String(process.env.ENV ?? "").trim().toLowerCase();

export const IS_PROD_LIKE = NODE_ENV === "production" || ENV === "prod" || ENV === "production";

function isValidSecret(value) {
  return typeof value === "string" && value.length >= 32;
}

function parsePort(rawValue, envName, errors) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    errors.push(`${envName} must be an integer between 1 and 65535`);
    return null;
  }
  return value;
}

export function readJoinTokenSecretConfig() {
  const explicit = process.env.CALLS_JOIN_TOKEN_SECRET;
  if (isValidSecret(explicit)) {
    return { secret: explicit, source: "CALLS_JOIN_TOKEN_SECRET" };
  }

  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (isValidSecret(supabaseJwtSecret)) {
    return { secret: supabaseJwtSecret, source: "SUPABASE_JWT_SECRET" };
  }

  return null;
}

export function validateSfuStartupEnv() {
  const errors = [];
  const callsDevInsecureAuth = process.env.CALLS_DEV_INSECURE_AUTH === "1";
  const joinTokenSkip = process.env.CALLS_JOIN_TOKEN_SKIP === "1";
  const requireMediasoup = process.env.SFU_REQUIRE_MEDIASOUP !== "0";
  const enableMediasoup = process.env.SFU_ENABLE_MEDIASOUP === "1";
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const supabaseAuthKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "";

  if (IS_PROD_LIKE && callsDevInsecureAuth) {
    errors.push("CALLS_DEV_INSECURE_AUTH is forbidden in production-like environments");
  }

  if (IS_PROD_LIKE && joinTokenSkip) {
    errors.push("CALLS_JOIN_TOKEN_SKIP is forbidden in production-like environments");
  }

  if (IS_PROD_LIKE && !callsDevInsecureAuth && (!supabaseUrl || !supabaseAuthKey)) {
    errors.push("hard auth requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY in production-like environments");
  }

  if (IS_PROD_LIKE && !joinTokenSkip && !readJoinTokenSecretConfig()) {
    errors.push("CALLS_JOIN_TOKEN_SECRET or SUPABASE_JWT_SECRET with length >= 32 is required in production-like environments");
  }

  if (IS_PROD_LIKE && requireMediasoup && !enableMediasoup) {
    errors.push("SFU_ENABLE_MEDIASOUP=1 is required when SFU_REQUIRE_MEDIASOUP is enabled in production-like environments");
  }

  if (errors.length > 0) {
    throw new Error(`[sfu] startup env validation failed: ${errors.join("; ")}`);
  }
}

export function validateMediasoupEnv() {
  const errors = [];
  const basePort = parsePort(process.env.SFU_RTC_MIN_PORT ?? "40000", "SFU_RTC_MIN_PORT", errors);
  const maxPort = parsePort(process.env.SFU_RTC_MAX_PORT ?? "49999", "SFU_RTC_MAX_PORT", errors);
  const announcedIp = String(process.env.SFU_ANNOUNCED_IP ?? "").trim();
  const workerRaw = String(process.env.MEDIASOUP_WORKERS ?? "").trim();

  if (basePort !== null && maxPort !== null) {
    if (maxPort < basePort) {
      errors.push("SFU_RTC_MAX_PORT must be greater than or equal to SFU_RTC_MIN_PORT");
    }
    if ((maxPort - basePort + 1) < 1000) {
      errors.push("SFU_RTC_MIN_PORT..SFU_RTC_MAX_PORT must provide at least 1000 ports for one mediasoup worker");
    }
  }

  if (workerRaw) {
    const workerCount = Number.parseInt(workerRaw, 10);
    if (!Number.isInteger(workerCount) || workerCount < 1) {
      errors.push("MEDIASOUP_WORKERS must be a positive integer when set");
    }
  }

  if (IS_PROD_LIKE) {
    if (!announcedIp) {
      errors.push("SFU_ANNOUNCED_IP is required when mediasoup is enabled in production-like environments");
    } else if (net.isIP(announcedIp) === 0) {
      errors.push("SFU_ANNOUNCED_IP must be a valid IPv4 or IPv6 address");
    }
  } else if (announcedIp && net.isIP(announcedIp) === 0) {
    errors.push("SFU_ANNOUNCED_IP must be a valid IPv4 or IPv6 address");
  }

  if (errors.length > 0) {
    throw new Error(`[sfu] mediasoup env validation failed: ${errors.join("; ")}`);
  }

  return {
    announcedIp: announcedIp || undefined,
    basePort,
    maxPort,
    requestedWorkers: workerRaw ? Number.parseInt(workerRaw, 10) : null,
  };
}
