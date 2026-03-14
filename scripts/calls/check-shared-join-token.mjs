import WebSocket from "ws";
import crypto from "node:crypto";

function now() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

class ProtoClient {
  constructor(name, token, deviceId, url) {
    this.name = name;
    this.token = token;
    this.deviceId = deviceId;
    this.url = url;
    this.ws = null;
    this.frames = [];
    this.waiters = [];
    this.acks = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 3000);

      ws.on("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      ws.on("message", (buffer) => {
        const frame = JSON.parse(buffer.toString());
        this.frames.push(frame);

        for (const waiter of [...this.waiters]) {
          if (waiter.type === frame.type && (!waiter.predicate || waiter.predicate(frame))) {
            waiter.resolve(frame);
            this.waiters.splice(this.waiters.indexOf(waiter), 1);
          }
        }

        if (frame.type === "ACK" && frame.ack?.ackOfMsgId) {
          const pending = this.acks.get(frame.ack.ackOfMsgId);
          if (!pending) return;
          if (frame.ack.ok === false) {
            pending.reject(new Error(JSON.stringify(frame.ack.error ?? {})));
          } else {
            pending.resolve(frame);
          }
          this.acks.delete(frame.ack.ackOfMsgId);
        }
      });
    });
  }

  waitFor(type, predicate, timeoutMs = 3000) {
    const recent = this.frames.find((frame) => frame.type === type && (!predicate || predicate(frame)));
    if (recent) return Promise.resolve(recent);

    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve, reject };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`${this.name}: waitFor timeout ${type}`));
      }, timeoutMs);
    });
  }

  sendAndAck(type, payload) {
    const msgId = uuid();
    const frame = { v: 1, type, msgId, ts: now(), payload };

    return new Promise((resolve, reject) => {
      this.acks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify(frame));
      setTimeout(() => {
        if (!this.acks.has(msgId)) return;
        this.acks.delete(msgId);
        reject(new Error(`${this.name}: ack timeout ${type}`));
      }, 3000);
    });
  }

  async helloAuth() {
    await this.sendAndAck("HELLO", {
      client: {
        platform: "test",
        appVersion: "shared-join-token-check",
        deviceId: this.deviceId,
      },
    });
    await this.waitFor("WELCOME", null, 3000);
    await this.sendAndAck("AUTH", { accessToken: this.token });
    await this.waitFor("AUTH_OK", null, 3000);
  }

  close() {
    this.ws?.close();
  }
}

async function main() {
  const wsUrl = process.env.CALLS_WS_URL || "ws://127.0.0.1:8787";
  const callerUserId = "dev_caller-t";
  const calleeUserId = "dev_callee-t";
  const callerToken = "caller-token-1234567890";
  const calleeToken = "callee-token-1234567890";

  const caller = new ProtoClient("caller", callerToken, "dev-caller", wsUrl);
  await caller.connect();
  await caller.helloAuth();

  await caller.sendAndAck("ROOM_CREATE", {
    callId: `call-${Date.now()}`,
    preferredRegion: "tr",
    allowedUserIds: [callerUserId, calleeUserId],
  });

  const created = await caller.waitFor("ROOM_CREATED", (frame) => typeof frame.payload?.roomId === "string");
  const roomId = created.payload.roomId;
  const secret = await caller.waitFor("ROOM_JOIN_SECRET", (frame) => frame.payload?.roomId === roomId);
  const joinToken = secret.payload.joinToken;

  await caller.sendAndAck("ROOM_JOIN", {
    roomId,
    joinToken,
    deviceId: "dev-caller",
    preferredRegion: "tr",
  });
  await caller.waitFor("ROOM_JOIN_OK", (frame) => frame.payload?.roomId === roomId);

  const callee = new ProtoClient("callee", calleeToken, "dev-callee", wsUrl);
  await callee.connect();
  await callee.helloAuth();
  await callee.sendAndAck("ROOM_JOIN", {
    roomId,
    joinToken,
    deviceId: "dev-callee",
    preferredRegion: "tr",
  });
  const calleeJoined = await callee.waitFor("ROOM_JOIN_OK", (frame) => frame.payload?.roomId === roomId);

  console.log(JSON.stringify({
    ok: true,
    roomId,
    callerUserId,
    calleeUserId,
    calleeJoinType: calleeJoined.type,
  }, null, 2));

  caller.close();
  callee.close();
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});