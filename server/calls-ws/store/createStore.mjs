import { createInMemoryStore } from "./inMemoryStore.mjs";
import { createRedisStore } from "./redisStore.mjs";
import { IS_PROD_LIKE, readOptionalStringEnv, readPositiveIntEnv } from "../env.mjs";
import { logger as baseLogger } from "../logger.mjs";

const logger = baseLogger.child({ context: "store.createStore" });

export async function createStoreFromEnv() {
  const configuredRedisUrl = readOptionalStringEnv("REDIS_URL");
  const redisRequired = process.env.CALLS_REDIS_REQUIRED === "1";
  const allowInmem = process.env.CALLS_ALLOW_INMEM_FALLBACK === "1";
  const redisUrl = configuredRedisUrl || (!IS_PROD_LIKE ? "redis://127.0.0.1:6379" : "");

  if (!redisUrl && redisRequired) {
    logger.error(
      { event: "startup.redis_url_missing", redisRequired },
      "[calls-ws] REDIS_URL is required when CALLS_REDIS_REQUIRED=1"
    );
    process.exit(1);
  }

  if (!redisUrl && !allowInmem) {
    logger.error(
      { event: "startup.redis_fallback_disabled", allowInmem },
      "[calls-ws] Missing REDIS_URL in production-like mode and CALLS_ALLOW_INMEM_FALLBACK is not set. Refusing to start."
    );
    process.exit(1);
  }

  try {
    const store = await createRedisStore({
      redisUrl,
      dedupTtlSec: readPositiveIntEnv("CALLS_DEDUP_TTL_SEC", 600, { min: 30 }),
    });
    return { store, degraded: false };
  } catch (err) {
    if (redisRequired) {
      logger.error(
        { event: "startup.redis_required_unavailable", error: err },
        "[calls-ws] Redis REQUIRED but unavailable:"
      );
      process.exit(1);
    }

    if (!allowInmem) {
      logger.error(
        { event: "startup.redis_unavailable_no_fallback", error: err, allowInmem },
        "[calls-ws] Redis unavailable and CALLS_ALLOW_INMEM_FALLBACK is not set. Refusing to start."
      );
      process.exit(1);
    }

    logger.warn(
      { event: "startup.degraded_mode", error: err, degraded: true },
      "[calls-ws] Starting in DEGRADED mode: in-memory store (no offline mailbox, no rekey commit)"
    );
    const store = createInMemoryStore({ degraded: true });
    return { store, degraded: true };
  }
}
