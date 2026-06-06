export function createInMemoryStore({ degraded = true } = {}) {
  const membersByCall = new Map(); // callId -> Set(deviceId)
  const roomVersionByCall = new Map(); // callId -> number
  const usedJoinTokenJti = new Map(); // jti -> expMs
  const mailboxesByDevice = new Map(); // deviceId -> Array<{ streamId, msg }>
  const mailboxDedup = new Map(); // deviceId:msgId -> expMs
  const mailboxCursors = new Map(); // deviceId -> streamId
  const routesByMsgId = new Map(); // msgId -> fromDevice
  const rekeyNeedByEpoch = new Map(); // callId:epoch -> Set(deviceId)
  const rekeyAckByEpoch = new Map(); // callId:epoch -> Set(deviceId)
  const rekeyCommitted = new Set(); // callId:epoch
  const rekeyBeginIds = new Map(); // callId:epoch -> beginMsgId
  let streamSeq = 0;

  function pruneJoinTokenJti() {
    const now = Date.now();
    for (const [jti, expMs] of usedJoinTokenJti.entries()) {
      if (!expMs || expMs <= now) {
        usedJoinTokenJti.delete(jti);
      }
    }
  }

  function pruneMailboxDedup() {
    const now = Date.now();
    for (const [key, expMs] of mailboxDedup.entries()) {
      if (!expMs || expMs <= now) mailboxDedup.delete(key);
    }
  }

  function rekeyKey(callId, epoch) {
    return `${callId}:${epoch}`;
  }

  function compareStreamIds(a, b) {
    const [ams, aseq] = String(a || "0-0").split("-").map((v) => Number(v) || 0);
    const [bms, bseq] = String(b || "0-0").split("-").map((v) => Number(v) || 0);
    if (ams !== bms) return ams - bms;
    return aseq - bseq;
  }

  return {
    kind: "in-memory",
    degraded,
    features: {
      offlineMailbox: true,
      rekeyCommit: true,
    },

    async deliver(toDevice, msg) {
      if (!toDevice || !msg?.id) return { ok: false, dup: false };
      pruneMailboxDedup();
      const dedupKey = `${toDevice}:${msg.id}`;
      if (mailboxDedup.has(dedupKey)) return { ok: false, dup: true };
      mailboxDedup.set(dedupKey, Date.now() + 600_000);
      const streamId = `${Date.now()}-${++streamSeq}`;
      const items = mailboxesByDevice.get(toDevice) ?? [];
      items.push({ streamId, msg: { ...msg } });
      if (items.length > 5000) items.splice(0, items.length - 5000);
      mailboxesByDevice.set(toDevice, items);
      return { ok: true, dup: false, streamId };
    },

    async sync(deviceId, cursorFrom = "0-0", limit = 50) {
      const items = mailboxesByDevice.get(deviceId) ?? [];
      const selected = items
        .filter((entry) => compareStreamIds(entry.streamId, cursorFrom) > 0)
        .slice(0, Math.max(1, Number(limit) || 50));
      const cursorTo = selected.length > 0 ? selected[selected.length - 1].streamId : cursorFrom;
      return { cursorTo, items: selected.map((entry) => ({ streamId: entry.streamId, msg: { ...entry.msg } })) };
    },

    async ack(deviceId, cursorTo) {
      if (deviceId && cursorTo) mailboxCursors.set(deviceId, cursorTo);
    },

    async getSavedCursor(deviceId) {
      return mailboxCursors.get(deviceId) ?? null;
    },

    async setNeed(callId, epoch, devices) {
      rekeyNeedByEpoch.set(rekeyKey(callId, epoch), new Set(devices));
    },

    async markAck(callId, epoch, deviceId) {
      const key = rekeyKey(callId, epoch);
      const set = rekeyAckByEpoch.get(key) ?? new Set();
      set.add(deviceId);
      rekeyAckByEpoch.set(key, set);
    },

    async tryCommit(callId, epoch) {
      const key = rekeyKey(callId, epoch);
      if (rekeyCommitted.has(key)) return { ok: true, reason: "ALREADY" };
      const need = rekeyNeedByEpoch.get(key) ?? new Set();
      if (need.size === 0) return { ok: false, reason: "NO_NEED_SET" };
      const ack = rekeyAckByEpoch.get(key) ?? new Set();
      if (ack.size < need.size) return { ok: false, reason: "ACK_INCOMPLETE", ack: ack.size, need: need.size };
      rekeyCommitted.add(key);
      return { ok: true, reason: "OK", ack: ack.size, need: need.size };
    },

    async assertMember(callId, deviceId) {
      const set = membersByCall.get(callId);
      return set ? set.has(deviceId) : false;
    },

    async addMember(callId, deviceId) {
      let set = membersByCall.get(callId);
      if (!set) {
        set = new Set();
        membersByCall.set(callId, set);
      }
      set.add(deviceId);
    },

    async removeMember(callId, deviceId) {
      const set = membersByCall.get(callId);
      if (!set) return;
      set.delete(deviceId);
      if (set.size === 0) membersByCall.delete(callId);
    },

    async bumpRoomVersion(callId) {
      const next = (roomVersionByCall.get(callId) ?? 0) + 1;
      roomVersionByCall.set(callId, next);
      return next;
    },

    async getRoomVersion(callId) {
      return roomVersionByCall.get(callId) ?? 0;
    },

    async saveRoute(msgId, fromDevice) {
      if (msgId && fromDevice) routesByMsgId.set(msgId, fromDevice);
    },

    async getRoute(msgId) {
      return routesByMsgId.get(msgId) ?? null;
    },

    async setRekeyBeginId(callId, epoch, beginMsgId) {
      rekeyBeginIds.set(rekeyKey(callId, epoch), beginMsgId);
    },

    async getRekeyBeginId(callId, epoch) {
      return rekeyBeginIds.get(rekeyKey(callId, epoch)) ?? null;
    },

    async markJoinTokenUsed(jti, expMs, userId) {
      if (typeof jti !== "string" || jti.length < 8) return false;
      pruneJoinTokenJti();
      const key = userId ? `${jti}:${userId}` : jti;
      if (usedJoinTokenJti.has(key)) return false;
      usedJoinTokenJti.set(key, Number(expMs) || Date.now() + 60_000);
      return true;
    },
  };
}
