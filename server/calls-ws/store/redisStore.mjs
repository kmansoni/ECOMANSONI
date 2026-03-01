import Redis from "ioredis";

const DEFAULT_DEDUP_TTL_SEC = 600;

export async function createRedisStore({
  redisUrl,
  dedupTtlSec = DEFAULT_DEDUP_TTL_SEC,
} = {}) {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  await redis.ping();

  function mbKey(deviceId) {
    return `mb:${deviceId}`;
  }

  function cursorKey(deviceId) {
    return `mb:cursor:${deviceId}`;
  }

  function dedupKey(deviceId, msgId) {
    return `dedup:${deviceId}:${msgId}`;
  }

  function roomMembersKey(callId) {
    return `room:${callId}:members`;
  }

  function roomVersionKey(callId) {
    return `room:${callId}:v`;
  }

  function routeKey(msgId) {
    return `route:${msgId}`;
  }

  function rekeyNeedKey(callId, epoch) {
    return `rekey:need:${callId}:${epoch}`;
  }

  function rekeyAckKey(callId, epoch) {
    return `rekey:ack:${callId}:${epoch}`;
  }

  function rekeyCommittedKey(callId, epoch) {
    return `rekey:committed:${callId}:${epoch}`;
  }

  function rekeyBeginIdKey(callId, epoch) {
    return `rekey:beginId:${callId}:${epoch}`;
  }

  const deliverLua = `
    if redis.call("EXISTS", KEYS[1]) == 1 then
      return {0, "DUP"}
    end
    redis.call("SET", KEYS[1], "1", "EX", ARGV[1])
    local x = redis.call("XADD", KEYS[2], "*",
      "ver", ARGV[2],
      "id", ARGV[3],
      "type", ARGV[4],
      "ts", ARGV[5],
      "callId", ARGV[6],
      "fromDevice", ARGV[7],
      "epoch", ARGV[8],
      "payload", ARGV[9],
      "refId", ARGV[10],
      "sig", ARGV[11]
    )
    return {1, x}
  `;

  const tryCommitLua = `
    local committedKey = KEYS[1]
    local needKey = KEYS[2]
    local ackKey = KEYS[3]

    if redis.call("GET", committedKey) == "1" then
      return {1, "ALREADY"}
    end

    local need = redis.call("SCARD", needKey)
    if need == 0 then
      return {0, "NO_NEED_SET"}
    end

    local ack = redis.call("SCARD", ackKey)
    if ack < need then
      return {0, "ACK_INCOMPLETE", ack, need}
    end

    redis.call("SET", committedKey, "1", "EX", 3600)
    return {1, "OK", ack, need}
  `;

  return {
    kind: "redis",
    degraded: false,
    features: {
      offlineMailbox: true,
      rekeyCommit: true,
    },

    async deliver(toDevice, msg) {
      const res = await redis.eval(
        deliverLua,
        2,
        dedupKey(toDevice, msg.id),
        mbKey(toDevice),
        String(dedupTtlSec),
        String(msg.ver ?? 1),
        msg.id,
        msg.type,
        String(msg.ts),
        msg.callId,
        msg.fromDevice,
        String(msg.epoch ?? 0),
        msg.payload ?? "",
        msg.refId ?? "",
        msg.sig ?? ""
      );

      return {
        ok: Array.isArray(res) && res[0] === 1,
        dup: Array.isArray(res) && res[0] === 0,
        streamId: Array.isArray(res) ? res[1] : undefined,
      };
    },

    async sync(deviceId, cursorFrom, limit) {
      const res = await redis.xread("COUNT", limit, "STREAMS", mbKey(deviceId), cursorFrom);
      if (!res || res.length === 0) return { cursorTo: cursorFrom, items: [] };

      const [, entries] = res[0];
      if (!entries || entries.length === 0) return { cursorTo: cursorFrom, items: [] };

      const items = [];
      let cursorTo = cursorFrom;
      for (const [id, kv] of entries) {
        cursorTo = id;
        const obj = {};
        for (let i = 0; i < kv.length; i += 2) obj[kv[i]] = kv[i + 1];

        items.push({
          streamId: id,
          msg: {
            ver: Number(obj.ver ?? 1),
            id: obj.id,
            type: obj.type,
            ts: Number(obj.ts),
            callId: obj.callId,
            fromDevice: obj.fromDevice,
            epoch: Number(obj.epoch ?? 0),
            payload: obj.payload || undefined,
            refId: obj.refId || undefined,
            sig: obj.sig || undefined,
          },
        });
      }

      return { cursorTo, items };
    },

    async ack(deviceId, cursorTo) {
      await redis.set(cursorKey(deviceId), cursorTo, "EX", 7 * 24 * 3600);
      // Optional trimming strategy (dev can skip). Keep bounded.
      await redis.xtrim(mbKey(deviceId), "MAXLEN", "~", 5000);
    },

    async getSavedCursor(deviceId) {
      return await redis.get(cursorKey(deviceId));
    },

    async setNeed(callId, epoch, devices) {
      if (devices.length) await redis.sadd(rekeyNeedKey(callId, epoch), ...devices);
      await redis.expire(rekeyNeedKey(callId, epoch), 3600);
    },

    async markAck(callId, epoch, deviceId) {
      await redis.sadd(rekeyAckKey(callId, epoch), deviceId);
      await redis.expire(rekeyAckKey(callId, epoch), 3600);
    },

    async tryCommit(callId, epoch) {
      const res = await redis.eval(
        tryCommitLua,
        3,
        rekeyCommittedKey(callId, epoch),
        rekeyNeedKey(callId, epoch),
        rekeyAckKey(callId, epoch)
      );

      return {
        ok: Array.isArray(res) && res[0] === 1,
        reason: Array.isArray(res) ? res[1] : "INTERNAL",
        ack: Array.isArray(res) ? res[2] : undefined,
        need: Array.isArray(res) ? res[3] : undefined,
      };
    },

    async assertMember(callId, deviceId) {
      return (await redis.sismember(roomMembersKey(callId), deviceId)) === 1;
    },

    async addMember(callId, deviceId) {
      await redis.sadd(roomMembersKey(callId), deviceId);
      await redis.expire(roomMembersKey(callId), 3600);
    },

    async removeMember(callId, deviceId) {
      await redis.srem(roomMembersKey(callId), deviceId);
    },

    async bumpRoomVersion(callId) {
      return await redis.incr(roomVersionKey(callId));
    },

    async getRoomVersion(callId) {
      const v = await redis.get(roomVersionKey(callId));
      return v ? Number(v) : 0;
    },

    async saveRoute(msgId, fromDevice) {
      await redis.set(routeKey(msgId), fromDevice, "EX", 600);
    },

    async getRoute(msgId) {
      return await redis.get(routeKey(msgId));
    },

    async setRekeyBeginId(callId, epoch, beginMsgId) {
      await redis.set(rekeyBeginIdKey(callId, epoch), beginMsgId, "EX", 3600);
    },

    async getRekeyBeginId(callId, epoch) {
      return await redis.get(rekeyBeginIdKey(callId, epoch));
    },

    async close() {
      try {
        redis.disconnect();
      } catch {}
    },
  };
}
