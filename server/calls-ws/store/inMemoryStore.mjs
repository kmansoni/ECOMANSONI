export function createInMemoryStore({ degraded = true } = {}) {
  const membersByCall = new Map(); // callId -> Set(deviceId)
  const roomVersionByCall = new Map(); // callId -> number

  return {
    kind: "in-memory",
    degraded,
    features: {
      offlineMailbox: false,
      rekeyCommit: false,
    },

    async deliver() {
      // No offline mailbox in degraded mode.
      return { ok: true, dup: false };
    },

    async sync() {
      // No offline mailbox in degraded mode.
      return { cursorTo: "0-0", items: [] };
    },

    async ack() {
      // no-op
    },

    async setNeed() {
      // no-op
    },

    async markAck() {
      // no-op
    },

    async tryCommit() {
      return { ok: false, reason: "DEGRADED_NO_COMMIT" };
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

    async saveRoute() {
      // no-op
    },

    async getRoute() {
      return null;
    },

    async setRekeyBeginId() {
      // no-op
    },

    async getRekeyBeginId() {
      return null;
    },
  };
}
