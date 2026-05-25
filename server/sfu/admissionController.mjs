import Redis from "ioredis";

const HEALTH_OK = 0;
const HEALTH_YELLOW = 1;
const HEALTH_RED = 2;

const TOKEN_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local tokensPerSec = tonumber(ARGV[2])
  local burst = tonumber(ARGV[3])
  local maxConcurrent = tonumber(ARGV[4])
  
  local bucket = redis.call("HMGET", key, "tokens", "lastUpdate", "count")
  local tokens = tonumber(bucket[1]) or burst
  local lastUpdate = tonumber(bucket[2]) or now
  local count = tonumber(bucket[3]) or 0
  
  -- Refill tokens based on elapsed time
  local elapsed = math.max(0, now - lastUpdate)
  tokens = math.min(burst, tokens + elapsed * tokensPerSec)
  
  -- Reject if at max concurrent
  if count >= maxConcurrent then
    return {0, "MAX_CONCURRENT", 0, count}
  end
  
  -- Take a token
  if tokens >= 1 then
    tokens = tokens - 1
    count = count + 1
    redis.call("HMSET", key, "tokens", tokens, "lastUpdate", now, "count", count)
    redis.call("PEXPIRE", key, math.ceil(burst / tokensPerSec) * 1000 * 2)
    return {1, "OK", 0, count}
  end
  
  -- Calculate retry after based on token refill rate
  local retryAfterMs = math.ceil((1 - tokens) / tokensPerSec * 1000)
  return {0, "RATE_LIMITED", retryAfterMs, count}
`;

const RELEASE_TOKEN_SCRIPT = `
  local key = KEYS[1]
  local current = redis.call("HGET", key, "count")
  local count = tonumber(current) or 0
  if count > 0 then
    count = count - 1
    redis.call("HSET", key, "count", count)
    return {1, count}
  end
  return {0, 0}
`;

export function createAdmissionController({ redisUrl, maxConcurrentRooms = 100, tokensPerSec = 10, burst = 20 }) {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
  });

  let connected = false;

  async function connect() {
    if (!connected) {
      await redis.connect();
      await redis.ping();
      connected = true;
    }
  }

  function bucketKey(roomId) {
    return `admission:bucket:${roomId}`;
  }

  return {
    async tryAdmit(roomId, nodeId) {
      await connect();

      const healthKey = `recovery:health:${roomId}`;
      const healthGen = await redis.get(healthKey);
      const health = healthGen ? Number(healthGen) : HEALTH_OK;

      if (health >= HEALTH_RED) {
        return { ok: false, reason: "HEALTH_RED", retryAfterMs: 5000 };
      }

      const now = Date.now();
      const res = await redis.eval(
        TOKEN_BUCKET_SCRIPT,
        1,
        bucketKey(roomId),
        String(now),
        String(tokensPerSec),
        String(burst),
        String(maxConcurrentRooms)
      );

      const ok = Array.isArray(res) && res[0] === 1;
      return {
        ok,
        reason: ok ? undefined : res[1],
        retryAfterMs: ok ? 0 : Number(res[2]),
      };
    },

    async releaseAdmission(roomId) {
      await connect();
      const res = await redis.eval(
        RELEASE_TOKEN_SCRIPT,
        1,
        bucketKey(roomId)
      );
      return { ok: Array.isArray(res) && res[0] === 1 };
    },

    async close() {
      try {
        redis.disconnect();
      } catch {}
    },
  };
}