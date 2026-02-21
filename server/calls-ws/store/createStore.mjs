import { createInMemoryStore } from "./inMemoryStore.mjs";
import { createRedisStore } from "./redisStore.mjs";

export async function createStoreFromEnv() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redisRequired = process.env.CALLS_REDIS_REQUIRED === "1";
  const allowInmem = process.env.CALLS_ALLOW_INMEM_FALLBACK === "1";

  try {
    const store = await createRedisStore({
      redisUrl,
      dedupTtlSec: Number(process.env.CALLS_DEDUP_TTL_SEC ?? "600"),
    });
    return { store, degraded: false };
  } catch (err) {
    if (redisRequired) {
      // eslint-disable-next-line no-console
      console.error("[calls-ws] Redis REQUIRED but unavailable:", err?.message ?? err);
      process.exit(1);
    }

    if (!allowInmem) {
      // eslint-disable-next-line no-console
      console.error("[calls-ws] Redis unavailable and CALLS_ALLOW_INMEM_FALLBACK is not set. Refusing to start.");
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.warn("[calls-ws] Starting in DEGRADED mode: in-memory store (no offline mailbox, no rekey commit)");
    const store = createInMemoryStore({ degraded: true });
    return { store, degraded: true };
  }
}
