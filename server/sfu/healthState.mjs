import Redis from "ioredis";

export const HEALTH_GREEN = 0;
export const HEALTH_YELLOW = 1;
export const HEALTH_RED = 2;

/**
 * @typedef {Object} FenceToken
 * @property {string} roomId
 * @property {number} controlEpoch
 * @property {number} leaseTerm
 * @property {number} healthGeneration
 * @property {number} roomStateVersion
 */

/**
 * @typedef {Object} GateResult
 * @property {true} ok
 * @property {FenceToken} fenceToken
 * @property {false} ok
 * @property {string} reason - "STALE_EPOCH" | "LEASE_LOST" | "HEALTH_RED" | "NOT_STABLE"
 * @property {number} [retryAfterMs]
 */

/**
 * @typedef {Object} CommitResult
 * @property {true} ok
 * @property {false} ok
 * @property {string} reason - "FENCE_MISMATCH" | "LEASE_EXPIRED" | "NOT_AUTHORIZED"
 */

/**
 * @typedef {Object} HealthStateModule
 * @property {(roomId: string) => Promise<number>} getHealthGeneration
 * @property {(roomId: string, state: number) => Promise<boolean>} setHealthState
 * @property {(roomId: string) => Promise<number>} bumpRoomStateVersion
 * @property {(roomId: string, nodeId: string, leaseTerm: number, fenceToken?: FenceToken) => Promise<GateResult>} checkStability
 */

const DEFAULT_REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const healthKey = (roomId) => `recovery:health:${roomId}`;
const stateKey = (roomId) => `recovery:state:${roomId}`;
const leaseKey = (roomId) => `recovery:lease:${roomId}`;
const epochKey = (roomId) => `recovery:epoch:${roomId}`;

const getHealthLua = `
  local current = redis.call("GET", KEYS[1])
  return current and tonumber(current) or 0
`;

const setHealthLua = `
  redis.call("SET", KEYS[1], ARGV[1])
  return 1
`;

const bumpStateVersionLua = `
  local current = redis.call("GET", KEYS[1])
  local next = current and (tonumber(current) + 1) or 1
  redis.call("SET", KEYS[1], next)
  return next
`;

export function createHealthState({ redisUrl = DEFAULT_REDIS_URL, leaseTtlSec = 30 }) {
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

  return {
    async getHealthGeneration(roomId) {
      await connect();
      const res = await redis.eval(getHealthLua, 1, healthKey(roomId));
      return Number(res) || 0;
    },

    async setHealthState(roomId, state) {
      await connect();
      await redis.eval(setHealthLua, 1, healthKey(roomId), String(state));
      return true;
    },

    async bumpRoomStateVersion(roomId) {
      await connect();
      const res = await redis.eval(bumpStateVersionLua, 1, stateKey(roomId));
      return Number(res) || 1;
    },

    async checkStability(roomId, nodeId, leaseTerm, fenceToken) {
      await connect();

      const leaseOwner = await redis.get(leaseKey(roomId));
      if (!leaseOwner || leaseOwner !== nodeId) {
        return { ok: false, reason: "LEASE_LOST", retryAfterMs: leaseTtlSec * 1000 };
      }

      const controlEpoch = await redis.get(epochKey(roomId));
      if (!controlEpoch) {
        return { ok: false, reason: "NOT_STABLE" };
      }

      const healthGeneration = await this.getHealthGeneration(roomId);
      if (healthGeneration >= HEALTH_RED) {
        return { ok: false, reason: "HEALTH_RED", retryAfterMs: 5000 };
      }

      const roomStateVersion = await this.bumpRoomStateVersion(roomId);

      if (fenceToken) {
        if (
          controlEpoch !== String(fenceToken.controlEpoch) ||
          healthGeneration !== fenceToken.healthGeneration ||
          roomStateVersion - 1 !== fenceToken.roomStateVersion
        ) {
          return { ok: false, reason: "STALE_EPOCH" };
        }
      }

      return {
        ok: true,
        fenceToken: {
          roomId,
          controlEpoch: Number(controlEpoch),
          leaseTerm,
          healthGeneration,
          roomStateVersion,
        },
      };
    },

    async close() {
      try {
        redis.disconnect();
      } catch {}
    },
  };
}