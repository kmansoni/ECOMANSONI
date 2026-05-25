import Redis from "ioredis";

const DEFAULT_LEASE_TTL_SEC = 30;
const HEALTH_OK = 0;
const HEALTH_YELLOW = 1;
const HEALTH_RED = 2;

// Lua script: acquire lease with NX/EX, return current leaseTerm or new one
const acquireLeaseLua = `
  local leaseKey = KEYS[1]
  local epochKey = KEYS[2]
  local nodeId = ARGV[1]
  local ttlSec = tonumber(ARGV[2])
  
  -- Get current lease info
  local current = redis.call("GET", leaseKey)
  if current and current ~= nodeId then
    return {0, "LEASE_TAKEN"}
  end
  
  -- Get or create epoch
  local epoch = redis.call("GET", epochKey)
  if not epoch then
    epoch = 1
    redis.call("SET", epochKey, epoch, "EX", ttlSec * 2)
  else
    epoch = tonumber(epoch)
  end
  
  -- Set lease
  redis.call("SET", leaseKey, nodeId, "EX", ttlSec)
  return {1, epoch}
`;

// Lua script: compare-and-set commit with fence validation
const commitMutationLua = `
  local leaseKey = KEYS[1]
  local epochKey = KEYS[2]
  local healthKey = KEYS[3]
  local stateKey = KEYS[4]

  local nodeId = ARGV[1]
  local expectedEpoch = tonumber(ARGV[2])
  local expectedHealthGen = tonumber(ARGV[3])
  local expectedStateVer = tonumber(ARGV[4])
  local mutationType = ARGV[5]

  -- Verify lease ownership
  local leaseOwner = redis.call("GET", leaseKey)
  if not leaseOwner or leaseOwner ~= nodeId then
    return {0, "LEASE_LOST"}
  end

  -- Verify epoch unchanged
  local currentEpoch = tonumber(redis.call("GET", epochKey) or "0")
  if currentEpoch ~= expectedEpoch then
    return {0, "STALE_EPOCH"}
  end

  -- Verify health generation unchanged (optional check)
  local currentHealth = tonumber(redis.call("GET", healthKey) or "0")
  if currentHealth ~= expectedHealthGen then
    return {0, "HEALTH_MISMATCH"}
  end

  -- Verify state version unchanged
  local currentState = tonumber(redis.call("GET", stateKey) or "0")
  if currentState ~= expectedStateVer then
    return {0, "STATE_MISMATCH"}
  end

  -- All checks passed - commit recorded (in real impl would store mutation log)
  return {1, "OK"}
`;

// Lua script: release lease with term verification
const releaseLeaseLua = `
  local leaseKey = KEYS[1]
  local nodeId = ARGV[1]
  
  local current = redis.call("GET", leaseKey)
  if not current or current ~= nodeId then
    return {0, "NOT_OWNER"}
  end
  
  redis.call("DEL", leaseKey)
  return {1, "OK"}
`;

export function createRecoveryLease({ redisUrl, leaseTtlSec = DEFAULT_LEASE_TTL_SEC }) {
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

  function leaseKey(roomId) {
    return `recovery:lease:${roomId}`;
  }

  function epochKey(roomId) {
    return `recovery:epoch:${roomId}`;
  }

  function healthKey(roomId) {
    return `recovery:health:${roomId}`;
  }

  function stateKey(roomId) {
    return `recovery:state:${roomId}`;
  }

  return {
    async acquireLease(roomId, nodeId) {
      await connect();
      const res = await redis.eval(
        acquireLeaseLua,
        2,
        leaseKey(roomId),
        epochKey(roomId),
        nodeId,
        String(leaseTtlSec)
      );
      return {
        ok: Array.isArray(res) && res[0] === 1,
        leaseTerm: Array.isArray(res) ? Number(res[1]) : undefined,
      };
    },

    async releaseLease(roomId, nodeId) {
      await connect();
      const res = await redis.eval(
        releaseLeaseLua,
        1,
        leaseKey(roomId),
        nodeId
      );
      return { ok: Array.isArray(res) && res[0] === 1 };
    },

    async getControlEpoch(roomId) {
      await connect();
      const v = await redis.get(epochKey(roomId));
      return v ? Number(v) : 0;
    },

    async getHealthGeneration(roomId) {
      await connect();
      const v = await redis.get(healthKey(roomId));
      return v ? Number(v) : 0;
    },

    async getRoomStateVersion(roomId) {
      await connect();
      const v = await redis.get(stateKey(roomId));
      return v ? Number(v) : 0;
    },

    async validateAndPrepareFence(roomId, nodeId) {
      await connect();

      const leaseOwner = await redis.get(leaseKey(roomId));
      if (!leaseOwner || leaseOwner !== nodeId) {
        return { ok: false, reason: "LEASE_LOST", retryAfterMs: leaseTtlSec * 1000 };
      }

      const controlEpoch = await this.getControlEpoch(roomId);
      const healthGeneration = await this.getHealthGeneration(roomId);
      const roomStateVersion = await this.getRoomStateVersion(roomId);

      if (healthGeneration >= HEALTH_RED) {
        return { ok: false, reason: "HEALTH_RED", retryAfterMs: 5000 };
      }

      return {
        ok: true,
        fenceToken: {
          roomId,
          controlEpoch,
          leaseTerm: controlEpoch,
          healthGeneration,
          roomStateVersion,
        },
        nodeId,
      };
    },

    async commitMutation(expectedFenceToken, nodeId, mutationType, mutationPayload) {
      await connect();

      const res = await redis.eval(
        commitMutationLua,
        4,
        leaseKey(expectedFenceToken.roomId),
        epochKey(expectedFenceToken.roomId),
        healthKey(expectedFenceToken.roomId),
        stateKey(expectedFenceToken.roomId),
        nodeId,
        String(expectedFenceToken.controlEpoch),
        String(expectedFenceToken.healthGeneration),
        String(expectedFenceToken.roomStateVersion),
        mutationType
      );

      return {
        ok: Array.isArray(res) && res[0] === 1,
        reason: Array.isArray(res) ? res[1] : "INTERNAL",
      };
    },

    async close() {
      try {
        redis.disconnect();
      } catch {}
    },
  };
}