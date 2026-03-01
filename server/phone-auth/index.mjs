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

// Initialize database pool
const pool = new Pool({ connectionString: DATABASE_URL });

// In-memory OTP store (production: use Redis or database)
const otpStore = new Map();
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

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateJWT(userId, phoneNumber) {
  const payload = {
    sub: userId,
    phone: phoneNumber.replace(/\D/g, ""),
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
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
      // TODO: Implement Twilio integration
      console.warn("[TWILIO] SMS provider not yet implemented");
      return { success: false, error: "Twilio provider not implemented" };
      
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
    
    // Check cooldown between requests
    const existingOTP = otpStore.get(normalizedPhone);
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
    
    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_VALIDITY_SEC * 1000;
    
    otpStore.set(normalizedPhone, {
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
    const storedOTP = otpStore.get(normalizedPhone);
    
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
      otpStore.delete(normalizedPhone);
      console.warn(
        `[OTP-Verify] OTP expired for phone: ***${normalizedPhone.slice(-4)}, IP: ${clientIp}`
      );
      return res.status(400).json({
        error: "OTP expired. Please request a new OTP.",
      });
    }
    
    // Check attempt limit
    if (storedOTP.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(normalizedPhone);
      console.warn(
        `[OTP-Verify] Max attempts exceeded for phone: ***${normalizedPhone.slice(-4)}, IP: ${clientIp}`
      );
      return res.status(429).json({
        error: "Maximum verification attempts exceeded. Please request a new OTP.",
      });
    }
    
    // Verify OTP (timing-safe comparison)
    storedOTP.attempts += 1;
    
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
      
      // Clean up OTP
      otpStore.delete(normalizedPhone);
      
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
    
    return res.status(200).json({
      status: "ok",
      service: "phone-auth",
      env: NODE_ENV,
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
      console.log("[Ready] Phone auth service started with Helmet security");
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("[Shutdown] SIGTERM received, closing gracefully...");
      server.close(() => {
        console.log("[Shutdown] Server closed");
      });
      
      // Force close after timeout
      const shutdownTimeout = setTimeout(() => {
        console.error("[Shutdown] Forced exit after timeout");
        process.exit(1);
      }, 10000);
      
      await pool.end();
      clearTimeout(shutdownTimeout);
      process.exit(0);
    });
    
    // Also handle SIGINT for manual shutdown
    process.on("SIGINT", async () => {
      console.log("[Shutdown] SIGINT received, closing gracefully...");
      server.close(() => {
        console.log("[Shutdown] Server closed");
      });
      await pool.end();
      process.exit(0);
    });
  } catch (error) {
    console.error("[Startup] Fatal error:", error);
    process.exit(1);
  }
}

// Start the service
start();
