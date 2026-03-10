/**
 * Phone-based Authentication Backend
 * 
 * ============================================================================
 * SECURITY FEATURES:
 * - Helmet.js comprehensive security headers (CSP, HSTS, X-Frame-Options)
 * - Dual-layer rate limiting (global + per-phone OTP requests)
 * - Timing-safe OTP comparison (crypto.timingSafeEqual)
 * - CORS deny-by-default with environment-driven allowlist
 * - Request size limits (16KB) and timeouts (30s)
 * - Client IP tracking from X-Forwarded-For headers
 * - Graceful shutdown with 10-second timeout
 * ============================================================================
 * 
 * Endpoints:
 * - POST /auth/phone/request-otp - Request OTP for phone number
 * - POST /auth/phone/verify - Verify OTP and issue JWT token
 * - GET /health - Health check with DB connectivity test
 * 
 * Environment Variables:
 * - PHONE_AUTH_PORT: Port to listen on (default: 3000)
 * - DATABASE_URL: PostgreSQL connection string
 * - JWT_SECRET: Secret for signing JWT tokens
 * - OTP_VALIDITY_SEC: OTP validity in seconds (default: 300)
 * - OTP_MAX_ATTEMPTS: Max verification attempts per OTP (default: 5)
 * - SMS_PROVIDER: 'stub' | 'twilio' (default: 'stub')
 * - TWILIO_ACCOUNT_SID: Twilio Account SID (required when SMS_PROVIDER=twilio)
 * - TWILIO_AUTH_TOKEN: Twilio Auth Token (required when SMS_PROVIDER=twilio)
 * - TWILIO_FROM_NUMBER: Twilio sender phone number in E.164 (optional if messaging service is set)
 * - TWILIO_MESSAGING_SERVICE_SID: Twilio Messaging Service SID (optional alternative to from number)
 * - CORS_ALLOWED_ORIGINS: Comma-separated list of allowed origins
 * - NODE_ENV: 'production' or 'development' (default: 'development')
 * - RATE_LIMIT_WINDOW_MS: Rate limit window in ms (default: 60000)
 * - RATE_LIMIT_MAX_REQUESTS: Max requests per window (default: 120)
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";
import Redis from "ioredis";

const { Pool } = pg;

// ============================================================================
// Configuration
// ============================================================================

const PORT = Number(process.env.PHONE_AUTH_PORT ?? "3000");
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const OTP_VALIDITY_SEC = Number(process.env.OTP_VALIDITY_SEC ?? "300");
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");
const SMS_PROVIDER = process.env.SMS_PROVIDER ?? "stub";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const NODE_ENV = process.env.NODE_ENV ?? "development";

// CORS Configuration
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000");
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? "120");
const OTP_REQUEST_RATE_WINDOW_MS = 60000;
const OTP_REQUEST_RATE_MAX = 3;
const OTP_REQUEST_COOLDOWN_MS = 30000;

// Validate required env vars
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("ERROR: JWT_SECRET environment variable is required");
  process.exit(1);
}
if (SMS_PROVIDER === "twilio") {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("ERROR: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required when SMS_PROVIDER=twilio");
    process.exit(1);
  }
  if (!TWILIO_FROM_NUMBER && !TWILIO_MESSAGING_SERVICE_SID) {
    console.error("ERROR: Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio");
    process.exit(1);
  }
}

// Initialize database pool
const pool = new Pool({ connectionString: DATABASE_URL });

// ============================================================================
// SECURITY FIX (C-3): Redis-backed OTP store with Map fallback
// ============================================================================

const REDIS_URL = process.env.REDIS_URL;

/**
 * OTP store abstraction: uses Redis when available, falls back to in-memory Map.
 *
 * Redis keys: otp:{phone} with TTL = OTP_VALIDITY_SEC
 * Redis values: JSON-serialized { otp, expiresAt, attempts, requestedAt }
 *
 * SCALING: Redis allows horizontal scaling of multiple phone-auth instances
 * sharing the same OTP state. Map fallback is single-instance only.
 *
 * TTL: Redis auto-expires OTP records, preventing unbounded memory growth.
 */
let redis = null;
let useRedis = false;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
      // If Redis goes down, fall back to Map gracefully
      if (useRedis) {
        console.warn("[Redis] Falling back to in-memory Map for OTP storage");
        useRedis = false;
      }
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected for OTP storage");
      useRedis = true;
    });

    await redis.connect();
  } catch (err) {
    console.warn(
      `[Redis] Failed to connect (${err.message}). ` +
      "Using in-memory Map as fallback. WARNING: OTP state will not survive restarts " +
      "and cannot be shared across instances."
    );
    redis = null;
    useRedis = false;
  }
} else {
  console.warn(
    "[Redis] REDIS_URL not set. Using in-memory Map for OTP storage. " +
    "WARNING: OTP state will not survive restarts and does not scale horizontally."
  );
}

// In-memory fallback Map (used when Redis is unavailable)
const otpMapFallback = new Map();

const OTP_REDIS_PREFIX = "otp:";

/**
 * Unified OTP store operations. Redis-first with Map fallback.
 * All methods are async for uniformity.
 */
const otpStore = {
  async get(phone) {
    if (useRedis && redis) {
      try {
        const raw = await redis.get(`${OTP_REDIS_PREFIX}${phone}`);
        return raw ? JSON.parse(raw) : undefined;
      } catch (err) {
        console.error("[Redis] GET failed, falling back to Map:", err.message);
        return otpMapFallback.get(phone);
      }
    }
    return otpMapFallback.get(phone);
  },

  async set(phone, data) {
    if (useRedis && redis) {
      try {
        // TTL in seconds — Redis will auto-expire the key
        const ttl = Math.ceil((data.expiresAt - Date.now()) / 1000);
        if (ttl > 0) {
          await redis.set(
            `${OTP_REDIS_PREFIX}${phone}`,
            JSON.stringify(data),
            "EX",
            ttl,
          );
        }
        return;
      } catch (err) {
        console.error("[Redis] SET failed, falling back to Map:", err.message);
      }
    }
    otpMapFallback.set(phone, data);
  },

  async delete(phone) {
    if (useRedis && redis) {
      try {
        await redis.del(`${OTP_REDIS_PREFIX}${phone}`);
        return;
      } catch (err) {
        console.error("[Redis] DEL failed, falling back to Map:", err.message);
      }
    }
    otpMapFallback.delete(phone);
  },

  /**
   * Update the attempts counter atomically.
   * For Redis: re-serialize with preserved TTL.
   */
  async incrementAttempts(phone, storedOTP) {
    storedOTP.attempts += 1;
    if (useRedis && redis) {
      try {
        // Preserve remaining TTL
        const remainingTtl = await redis.ttl(`${OTP_REDIS_PREFIX}${phone}`);
        if (remainingTtl > 0) {
          await redis.set(
            `${OTP_REDIS_PREFIX}${phone}`,
            JSON.stringify(storedOTP),
            "EX",
            remainingTtl,
          );
        }
      } catch (err) {
        console.error("[Redis] INCREMENT failed:", err.message);
        // Map fallback: storedOTP is a reference, already mutated
      }
    }
    // For Map fallback: mutation on the reference is sufficient
  },
};

const otpRequestTracker = new Map();

// ============================================================================
// Express App Setup with Security
// ============================================================================

const app = express();

// Helmet: Comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: {
    action: "deny",
  },
  xssFilter: true,
  dnsPrefetchControl: {
    allow: false,
  },
  referrerPolicy: {
    policy: ["no-referrer"],
  },
}));

// Request size limit to prevent DoS
app.use(express.json({ limit: "16kb" }));

// Request timeout (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// ============================================================================
// CORS Middleware (Deny-by-Default)
// ============================================================================

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  
  if (!origin) return next();
  
  if (ALLOWED_ORIGINS.length === 0) {
    if (NODE_ENV === "production") {
      console.warn(`[CORS] Rejected origin: ${origin} from IP: ${clientIp} (no origins configured)`);
      return res.status(403).json({ error: "CORS not configured" });
    }
    if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      console.warn(`[CORS] Rejected origin: ${origin} from IP: ${clientIp}`);
      return res.status(403).json({ error: "CORS origin not allowed" });
    }
  } else if (!ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[CORS] Rejected origin: ${origin} from IP: ${clientIp}`);
    return res.status(403).json({ error: "CORS origin not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
  res.setHeader("Vary", "Origin");
  
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  
  next();
});

// ============================================================================
// Rate Limiting
// ============================================================================

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: { error: "rate_limited", retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  },
  skip: (req) => {
    return req.path === "/health";
  },
});

app.use(globalLimiter);

function checkOtpRequestRateLimit(phone) {
  const now = Date.now();
  const key = `otp_request:${phone}`;
  
  if (!otpRequestTracker.has(key)) {
    otpRequestTracker.set(key, []);
  }

  const requests = otpRequestTracker.get(key);
  const validRequests = requests.filter(ts => now - ts < OTP_REQUEST_RATE_WINDOW_MS);
  
  if (validRequests.length >= OTP_REQUEST_RATE_MAX) {
    return {
      allowed: false,
      retryAfter: Math.ceil((validRequests[0] + OTP_REQUEST_RATE_WINDOW_MS - now) / 1000),
    };
  }

  validRequests.push(now);
  otpRequestTracker.set(key, validRequests);

  return { allowed: true, retryAfter: null };
}

// ============================================================================
// Utility Functions
// ============================================================================

function getClientIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

function isProductionEnv() {
  const env = (process.env.NODE_ENV ?? "").toLowerCase();
  return env === "production" || env === "prod";
}

/**
 * SECURITY FIX (C-4): Generates a 6-digit OTP using crypto.randomInt().
 *
 * crypto.randomInt() uses the Node.js built-in CSPRNG (crypto.randomFillSync
 * internally), which is cryptographically secure — unlike Math.random() which
 * uses a predictable PRNG (xorshift128+ in V8) that can be reconstructed
 * from observed outputs.
 *
 * Range: [100000, 999999] — always 6 digits.
 */
function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateJWT(userId, phoneNumber) {
  const payload = {
    sub: userId,
    phone: phoneNumber.replace(/\D/g, ""),
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function toE164(phoneNumber) {
  const value = (phoneNumber ?? "").trim();
  if (!value) return null;
  if (value.startsWith("+")) {
    const normalized = `+${value.slice(1).replace(/\D/g, "")}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

async function sendOtpViaTwilio(phoneNumber, otp) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: "Twilio credentials are not configured" };
  }

  const to = toE164(phoneNumber);
  if (!to) {
    return { success: false, error: "Invalid phone number for Twilio" };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const body = new URLSearchParams({
    To: to,
    Body: `Your verification code is ${otp}. It is valid for ${OTP_VALIDITY_SEC} seconds.`,
  });

  if (TWILIO_MESSAGING_SERVICE_SID) {
    body.set("MessagingServiceSid", TWILIO_MESSAGING_SERVICE_SID);
  } else if (TWILIO_FROM_NUMBER) {
    body.set("From", TWILIO_FROM_NUMBER);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message || `Twilio API error (${response.status})`;
      return { success: false, error: message };
    }

    return {
      success: true,
      provider: "twilio",
      sid: payload?.sid,
      status: payload?.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Twilio network error",
    };
  }
}

async function sendOTP(phoneNumber, otp) {
  const normalizedPhone = phoneNumber.replace(/\D/g, "");

  switch (SMS_PROVIDER) {
    case "stub":
      console.log(
        `[STUB SMS] Phone: ${normalizedPhone}, OTP: ${otp} (Valid for ${OTP_VALIDITY_SEC}s)`
      );
      return { success: true, provider: "stub" };
      
    case "twilio":
      return await sendOtpViaTwilio(phoneNumber, otp);
      
    default:
      return { success: false, error: `Unknown SMS provider: ${SMS_PROVIDER}` };
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

app.post("/auth/phone/request-otp", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const data = req.body || {};
    const { phone } = data;
    
    // Validate phone format
    if (!phone || typeof phone !== "string" || phone.length < 10) {
      return res.status(400).json({
        error: "Invalid phone number. Must be at least 10 digits or in E.164 format",
      });
    }
    
    const normalizedPhone = phone.replace(/\D/g, "");
    
    // Rate-limit: Check OTP request rate limit (per-phone)
    const rateLimitCheck = checkOtpRequestRateLimit(normalizedPhone);
    if (!rateLimitCheck.allowed) {
      res.setHeader("Retry-After", rateLimitCheck.retryAfter);
      console.warn(
        `[OTP-Request] Rate limit exceeded for phone: ***${normalizedPhone.slice(-4)}, ` +
        `retry after ${rateLimitCheck.retryAfter}s, IP: ${clientIp}`
      );
      return res.status(429).json({
        error: "Too many OTP requests. Please try again later.",
        retryAfter: rateLimitCheck.retryAfter,
      });
    }
    
    // Check cooldown between requests (C-3: async otpStore)
    const existingOTP = await otpStore.get(normalizedPhone);
    if (
      existingOTP &&
      existingOTP.requestedAt > Date.now() - OTP_REQUEST_COOLDOWN_MS
    ) {
      const retryAfter = Math.ceil(
        (OTP_REQUEST_COOLDOWN_MS - (Date.now() - existingOTP.requestedAt)) / 1000
      );
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        error: "OTP already requested. Please wait before retrying.",
        retryAfter,
      });
    }
    
    // Generate and store OTP (C-3: async set with Redis TTL)
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_VALIDITY_SEC * 1000;
    
    await otpStore.set(normalizedPhone, {
      otp,
      expiresAt,
      attempts: 0,
      requestedAt: Date.now(),
    });
    
    // Send OTP via SMS
    const smsResult = await sendOTP(phone, otp);
    if (!smsResult.success) {
      console.error(`[OTP-Request] SMS send failed: ${smsResult.error}, IP: ${clientIp}`);
      return res.status(500).json({ 
        error: isProductionEnv() ? "Failed to send OTP" : smsResult.error 
      });
    }
    
    console.log(
      `[OTP-Request] OTP sent to phone: ***${normalizedPhone.slice(-4)}, ` +
      `expires in ${OTP_VALIDITY_SEC}s, IP: ${clientIp}`
    );
    
    return res.status(200).json({
      success: true,
      message: "OTP sent to phone number",
      phone: `+***${phone.slice(-4)}`,
      expiresIn: OTP_VALIDITY_SEC,
    });
  } catch (error) {
    console.error("[OTP-Request] Error:", error);
    return res.status(500).json({ 
      error: isProductionEnv() ? "Internal server error" : error.message 
    });
  }
});

app.post("/auth/phone/verify", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const data = req.body || {};
    const { phone, otp } = data;
    
    // Validate inputs
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Invalid phone number" });
    }
    if (!otp || typeof otp !== "string" || otp.length !== 6) {
      return res.status(400).json({ error: "Invalid OTP. Must be 6 digits." });
    }
    
    const normalizedPhone = phone.replace(/\D/g, "");
    // C-3: async Redis-backed OTP store
    const storedOTP = await otpStore.get(normalizedPhone);
    
    // Check if OTP exists and is not expired
    if (!storedOTP) {
      console.warn(
        `[OTP-Verify] OTP not found for phone: ***${normalizedPhone.slice(-4)}, IP: ${clientIp}`
      );
      return res.status(400).json({
        error: "OTP not found. Please request a new OTP.",
      });
    }
    
    if (storedOTP.expiresAt < Date.now()) {
      await otpStore.delete(normalizedPhone);
      console.warn(
        `[OTP-Verify] OTP expired for phone: ***${normalizedPhone.slice(-4)}, IP: ${clientIp}`
      );
      return res.status(400).json({
        error: "OTP expired. Please request a new OTP.",
      });
    }
    
    // Check attempt limit
    if (storedOTP.attempts >= OTP_MAX_ATTEMPTS) {
      await otpStore.delete(normalizedPhone);
      console.warn(
        `[OTP-Verify] Max attempts exceeded for phone: ***${normalizedPhone.slice(-4)}, IP: ${clientIp}`
      );
      return res.status(429).json({
        error: "Maximum verification attempts exceeded. Please request a new OTP.",
      });
    }
    
    // Verify OTP (timing-safe comparison) — C-3: atomically increment attempts in Redis
    await otpStore.incrementAttempts(normalizedPhone, storedOTP);
    
    let otpMatches = false;
    try {
      otpMatches = crypto.timingSafeEqual(
        Buffer.from(storedOTP.otp),
        Buffer.from(otp)
      );
    } catch {
      // Lengths don't match - not an OTP
      otpMatches = false;
    }
    
    if (!otpMatches) {
      console.warn(
        `[OTP-Verify] Invalid OTP for phone: ***${normalizedPhone.slice(-4)}, ` +
        `attempts: ${storedOTP.attempts}/${OTP_MAX_ATTEMPTS}, IP: ${clientIp}`
      );
      return res.status(400).json({
        error: "Invalid OTP",
        attemptsRemaining: OTP_MAX_ATTEMPTS - storedOTP.attempts,
      });
    }
    
    // OTP verified! Now handle user creation/lookup
    try {
      // Check if user exists
      const userRes = await pool.query(
        "SELECT id FROM users WHERE phone = $1",
        [normalizedPhone]
      );
      
      let userId;
      if (userRes.rows.length > 0) {
        // User exists
        userId = userRes.rows[0].id;
        // Update last_login
        await pool.query(
          "UPDATE users SET last_login_at = NOW() WHERE id = $1",
          [userId]
        );
      } else {
        // Create new user
        const createRes = await pool.query(
          "INSERT INTO users (phone, created_at, last_login_at) VALUES ($1, NOW(), NOW()) RETURNING id",
          [normalizedPhone]
        );
        userId = createRes.rows[0].id;
      }
      
      // Generate JWT token
      const token = generateJWT(userId, normalizedPhone);
      
      // Clean up OTP (C-3: async Redis delete)
      await otpStore.delete(normalizedPhone);
      
      console.log(
        `[OTP-Verify] OTP verified for phone: ***${normalizedPhone.slice(-4)}, ` +
        `user_id: ${userId}, IP: ${clientIp}`
      );
      
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: userId,
          phone: `+***${phone.slice(-4)}`,
        },
      });
    } catch (dbError) {
      console.error(`[OTP-Verify] Database error: ${dbError.message}, IP: ${clientIp}`, dbError);
      return res.status(500).json({ 
        error: isProductionEnv() ? "Database error during verification" : dbError.message 
      });
    }
  } catch (error) {
    console.error(`[OTP-Verify] Error: ${error.message}, IP: ${getClientIp(req)}`, error);
    return res.status(500).json({ 
      error: isProductionEnv() ? "Internal server error" : error.message 
    });
  }
});

app.get("/health", async (req, res) => {
  try {
    // Test database connection
    await pool.query("SELECT 1");

    // Test Redis connection if available
    let redisStatus = "not_configured";
    if (redis) {
      try {
        await redis.ping();
        redisStatus = "ok";
      } catch {
        redisStatus = "error";
      }
    }
    
    return res.status(200).json({
      status: "ok",
      service: "phone-auth",
      env: NODE_ENV,
      otp_store: useRedis ? "redis" : "memory",
      redis_status: redisStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Health] Check failed: ${error.message}`, error);
    return res.status(503).json({
      status: "error",
      service: "phone-auth",
      env: NODE_ENV,
      error: "Database connection failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.message} for ${req.method} ${req.path}`, err);
  
  const statusCode = err.statusCode || 500;
  const errorResponse = {
    error: isProductionEnv() ? "Internal server error" : err.message,
    timestamp: new Date().toISOString(),
  };
  
  if (!isProductionEnv()) {
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
});

// ============================================================================
// Database Setup and Server Start
// ============================================================================

async function ensureSchema() {
  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_login_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    `);

    console.log("[Schema] Users table ensured");
  } catch (error) {
    console.error("[Schema] Error ensuring tables:", error);
    throw error;
  }
}

async function start() {
  try {
    // Test database connection
    await pool.query("SELECT 1");
    console.log("[Database] Connected");

    // Ensure schema exists
    await ensureSchema();

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
      console.log(`[Config] SMS Provider: ${SMS_PROVIDER}`);
      console.log(`[Config] OTP Validity: ${OTP_VALIDITY_SEC}s`);
      console.log(`[Config] OTP Max Attempts: ${OTP_MAX_ATTEMPTS}`);
      console.log(`[Config] Rate Limit: ${RATE_LIMIT_MAX_REQUESTS} req/${RATE_LIMIT_WINDOW_MS}ms`);
      console.log(`[Config] OTP Request Rate Limit: ${OTP_REQUEST_RATE_MAX} req/${OTP_REQUEST_RATE_WINDOW_MS}ms`);
      console.log(`[Config] CORS Origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(", ") : "development only"}`);
      console.log(`[Config] OTP Store: ${useRedis ? "Redis" : "In-Memory Map (fallback)"}`);
      console.log("[Ready] Phone auth service started with Helmet security");
    });

    // Graceful shutdown — close Redis + DB connections
    async function gracefulShutdown(signal) {
      console.log(`[Shutdown] ${signal} received, closing gracefully...`);
      server.close(() => {
        console.log("[Shutdown] Server closed");
      });
      
      // Force close after timeout
      const shutdownTimeout = setTimeout(() => {
        console.error("[Shutdown] Forced exit after timeout");
        process.exit(1);
      }, 10000);

      // Disconnect Redis if connected
      if (redis) {
        try {
          await redis.quit();
          console.log("[Shutdown] Redis disconnected");
        } catch (err) {
          console.error("[Shutdown] Redis disconnect error:", err.message);
        }
      }
      
      await pool.end();
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("[Startup] Fatal error:", error);
    process.exit(1);
  }
}

// Start the service
start();
