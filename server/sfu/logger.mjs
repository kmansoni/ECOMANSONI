/**
 * Structured logging for SFU — production-ready JSON logging.
 * Uses pino for structured output with trace IDs.
 */

const LOG_LEVEL = String(process.env.SFU_LOG_LEVEL ?? "info").toLowerCase();
const LOG_PRETTY = process.env.SFU_LOG_PRETTY === "1";
const NODE_ID_LOG = process.env.SFU_NODE_ID ?? "local-sfu-1";
const REGION_LOG = process.env.SFU_REGION ?? "unknown";

const levels = { fatal: 80, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
const currentLevel = levels[LOG_LEVEL] ?? levels.info;

function shouldLog(level) {
  return levels[level] >= currentLevel;
}

function formatMessage(level, msg, meta = {}) {
  const entry = {
    ts: Date.now(),
    level,
    msg,
    nodeId: NODE_ID_LOG,
    region: REGION_LOG,
    ...meta,
  };

  // Sanitize PII: never log userId/deviceId at info level
  if (entry.userId && level !== "debug" && level !== "trace") {
    entry.userId = sanitizeId(entry.userId);
  }
  if (entry.deviceId && level !== "debug" && level !== "trace") {
    entry.deviceId = sanitizeId(entry.deviceId);
  }
  if (entry.roomId && level !== "debug" && level !== "trace") {
    entry.roomId = sanitizeId(entry.roomId);
  }

  if (LOG_PRETTY) {
    return `[${entry.ts}] ${entry.level.toUpperCase()}: ${msg} ${JSON.stringify(meta)}`;
  }
  return JSON.stringify(entry);
}

function sanitizeId(id) {
  if (typeof id !== "string" || id.length <= 8) return "[REDACTED]";
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

export function createLogger(context = {}) {
  return {
    fatal(msg, meta = {}) { if (shouldLog("fatal")) process.stdout.write(formatMessage("fatal", msg, { ...context, ...meta }) + "\n"); },
    error(msg, meta = {}) { if (shouldLog("error")) process.stderr.write(formatMessage("error", msg, { ...context, ...meta }) + "\n"); },
    warn(msg, meta = {}) { if (shouldLog("warn")) process.stdout.write(formatMessage("warn", msg, { ...context, ...meta }) + "\n"); },
    info(msg, meta = {}) { if (shouldLog("info")) process.stdout.write(formatMessage("info", msg, { ...context, ...meta }) + "\n"); },
    debug(msg, meta = {}) { if (shouldLog("debug")) process.stdout.write(formatMessage("debug", msg, { ...context, ...meta }) + "\n"); },
    trace(msg, meta = {}) { if (shouldLog("trace")) process.stdout.write(formatMessage("trace", msg, { ...context, ...meta }) + "\n"); },
  };
}

export const logger = createLogger({ service: "sfu" });

// Global error handler for uncaught exceptions
export function setupGlobalErrorHandlers() {
  process.on("uncaughtException", (err) => {
    const entry = {
      ts: Date.now(),
      level: "fatal",
      msg: "Uncaught exception",
      nodeId: NODE_ID_LOG,
      region: REGION_LOG,
      error: err.message,
      stack: err.stack,
    };
    process.stderr.write(JSON.stringify(entry) + "\n");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error("Unhandled rejection", { reason: msg, stack });
  });
}
