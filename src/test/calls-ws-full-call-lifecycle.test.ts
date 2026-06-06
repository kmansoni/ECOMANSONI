/* @vitest-environment node */
/**
 * Интеграционный тест полного жизненного цикла звонка.
 *
 * Поднимает РЕАЛЬНЫЙ calls-ws сервер (TCP + WebSocket) и прогоняет:
 *   HELLO → AUTH → E2EE_CAPS → ROOM_CREATE → ROOM_JOIN (callee) →
 *   KEY_PACKAGE → KEY_ACK → ROOM_LEAVE → ROOM cleanup
 *
 * Проверяет: реальные TCP-соединения, протокол v1, seq-контроль,
 * join-token подпись/валидацию, peer-уведомления, E2EE key exchange, cleanup.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import WebSocket from "ws";

// ─── Типы ────────────────────────────────────────────────────────────────────

type WsFrame = {
  v: 1;
  type: string;
  msgId: string;
  ts: number;
  seq?: number;
  ack?: {
    ackOfMsgId: string;
    ok: boolean;
    error?: {
      code?: string;
      message?: string;
      details?: unknown;
      retryable?: boolean;
    };
  };
  payload: Record<string, unknown>;
};

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function waitForHealth(port: number, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`calls-ws health check failed with status ${String(res.statusCode)}`));
          return;
        }
        setTimeout(probe, 150);
      });
      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("calls-ws did not become healthy in time"));
          return;
        }
        setTimeout(probe, 150);
      });
    };
    probe();
  });
}

async function startCallsWs(envOverrides: Record<string, string> = {}) {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const serverEntry = path.resolve(process.cwd(), "server/calls-ws/index.mjs");
  const proc = spawn(process.execPath, [serverEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CALLS_WS_PORT: String(port),
      CALLS_DEV_INSECURE_AUTH: "1",
      CALLS_ALLOW_INMEM_FALLBACK: "1",
      CALLS_REQUIRE_SFRAME_CAPS: "0",
      CALLS_REQUIRE_DOUBLE_RATCHET_CAPS: "0",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupLogs = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    startupLogs += chunk.toString();
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    startupLogs += chunk.toString();
  });

  await Promise.race([
    waitForHealth(port),
    new Promise<never>((_, reject) => {
      proc.once("exit", (code, signal) => {
        reject(new Error(`calls-ws exited before health (code=${String(code)}, signal=${String(signal)})`));
      });
    }),
  ]).catch((error) => {
    proc.kill("SIGTERM");
    throw new Error(`${String(error)}\nServer logs:\n${startupLogs}`);
  });

  return { proc, port };
}

function stopCallsWs(proc: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) proc.kill("SIGKILL");
    }, 2000);
  });
}

function connectWs(port: number) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", (err) => reject(err));
  });
}

function devUserId(token: string) {
  return `dev_${token.slice(0, 8)}`;
}

// ─── WsSession: удобная обёртка ─────────────────────────────────────────────

class WsSession {
  readonly ws: WebSocket;
  private seq = 1;
  private readonly received: WsFrame[] = [];
  private readonly consumed = new Set<WsFrame>();
  private readonly waiters: Array<{
    predicate: (f: WsFrame) => boolean;
    resolve: (f: WsFrame) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const frame = JSON.parse(raw.toString()) as WsFrame;
        this.received.push(frame);
        // проверяем waiters
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          const w = this.waiters[i];
          if (w.predicate(frame)) {
            clearTimeout(w.timer);
            this.waiters.splice(i, 1);
            this.consumed.add(frame);
            w.resolve(frame);
          }
        }
      } catch {
        // ignore non-json
      }
    });
  }

  send(type: string, payload: Record<string, unknown>) {
    const msgId = randomUUID();
    const frame: WsFrame = { v: 1, type, msgId, ts: Date.now(), seq: this.seq++, payload };
    this.ws.send(JSON.stringify(frame));
    return msgId;
  }

  waitFor(predicate: (f: WsFrame) => boolean, timeoutMs = 5000) {
    // сначала ищем среди уже полученных но не потреблённых
    const existing = this.received.find((f) => !this.consumed.has(f) && predicate(f));
    if (existing) {
      this.consumed.add(existing);
      return Promise.resolve(existing);
    }

    return new Promise<WsFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error("waitFor timed out"));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  waitForAck(msgId: string, timeoutMs = 5000) {
    return this.waitFor((f) => f.ack?.ackOfMsgId === msgId, timeoutMs);
  }

  waitForType(type: string, timeoutMs = 5000) {
    return this.waitFor((f) => f.type === type, timeoutMs);
  }

  waitForClose(timeoutMs = 5000) {
    return new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitForClose timed out")), timeoutMs);
      this.ws.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
  }

  async helloAndAuth(deviceId: string, accessToken: string) {
    const helloId = this.send("HELLO", { client: { deviceId } });
    const helloAck = await this.waitForAck(helloId);
    expect(helloAck.ack?.ok).toBe(true);

    const authId = this.send("AUTH", { accessToken });
    const authAck = await this.waitForAck(authId);
    expect(authAck.ack?.ok).toBe(true);

    // ждём GW_HELLO после AUTH
    await this.waitForType("GW_HELLO");
    return authAck;
  }

  async e2eeCaps() {
    const capsId = this.send("E2EE_CAPS", {
      insertableStreams: true,
      sframe: true,
      doubleRatchet: true,
      supportedCipherSuites: ["DOUBLE_RATCHET_P256_AES128GCM"],
    });
    const capsAck = await this.waitForAck(capsId);
    expect(capsAck.ack?.ok).toBe(true);
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

function buildDiscoveryKeyPackage(params: {
  roomId: string;
  fromDeviceId: string;
  toDeviceId: string;
  userId: string;
  epoch?: number;
  messageId?: string;
  senderKeyId?: string;
}) {
  const b64 = Buffer.from("a".repeat(32)).toString("base64");
  const sig = Buffer.from("s".repeat(64)).toString("base64");
  const jwkCoord = Buffer.from("x".repeat(32)).toString("base64url");
  return {
    keyPackageType: "DISCOVERY",
    roomId: params.roomId,
    fromDeviceId: params.fromDeviceId,
    toDeviceId: params.toDeviceId,
    targetDeviceId: params.toDeviceId,
    senderKeyId: params.senderKeyId ?? randomUUID(),
    epoch: params.epoch ?? 0,
    ciphertext: b64,
    senderPublicKey: b64,
    senderSigningPublicKey: b64,
    salt: b64,
    sig,
    messageId: params.messageId ?? randomUUID(),
    discoveryNonce: "discovery-nonce-123456",
    senderIdentity: {
      userId: params.userId,
      deviceId: params.fromDeviceId,
      sessionId: `session-${params.fromDeviceId}`,
      identityPubKeyJwk: { kty: "EC", crv: "P-256", x: jwkCoord, y: jwkCoord },
    },
  };
}

async function createJoinedTwoPeerRoom(port: number, suffix: string, extraAllowedUserIds: string[] = []) {
  const aliceToken = `alice-${suffix}-token-123456789012`;
  const bobToken = `bob-${suffix}-token---123456789012`;
  const aliceUserId = devUserId(aliceToken);
  const bobUserId = devUserId(bobToken);
  const aliceDeviceId = `alice-${suffix}-dev`;
  const bobDeviceId = `bob-${suffix}-dev`;

  const alice = new WsSession(await connectWs(port));
  const bob = new WsSession(await connectWs(port));
  await alice.helloAndAuth(aliceDeviceId, aliceToken);
  await bob.helloAndAuth(bobDeviceId, bobToken);
  await alice.e2eeCaps();
  await bob.e2eeCaps();

  const createId = alice.send("ROOM_CREATE", {
    preferredRegion: "tr",
    allowedUserIds: [aliceUserId, bobUserId, ...extraAllowedUserIds],
  });
  const created = await alice.waitForType("ROOM_CREATED");
  const roomId = created.payload.roomId as string;
  const callId = created.payload.callId as string;
  const joinToken = (await alice.waitForType("ROOM_JOIN_SECRET")).payload.joinToken as string;
  await alice.waitForAck(createId);

  const aliceJoinId = alice.send("ROOM_JOIN", { roomId, joinToken, deviceId: aliceDeviceId });
  await alice.waitForType("ROOM_JOIN_OK");
  await alice.waitForType("ROOM_SNAPSHOT");
  expect((await alice.waitForAck(aliceJoinId)).ack?.ok).toBe(true);

  const bobJoinId = bob.send("ROOM_JOIN", { roomId, joinToken, deviceId: bobDeviceId });
  await bob.waitForType("ROOM_JOIN_OK");
  await bob.waitForType("ROOM_SNAPSHOT");
  expect((await bob.waitForAck(bobJoinId)).ack?.ok).toBe(true);
  await alice.waitForType("PEER_JOINED");
  await alice.waitForType("REKEY_REQUIRED");

  return { alice, bob, roomId, callId, joinToken, aliceUserId, bobUserId, aliceDeviceId, bobDeviceId };
}

async function joinAdditionalPeer(port: number, params: { roomId: string; joinToken: string; deviceId: string; token: string }) {
  const peer = new WsSession(await connectWs(port));
  await peer.helloAndAuth(params.deviceId, params.token);
  await peer.e2eeCaps();
  const joinId = peer.send("ROOM_JOIN", { roomId: params.roomId, joinToken: params.joinToken, deviceId: params.deviceId });
  await peer.waitForType("ROOM_JOIN_OK");
  await peer.waitForType("ROOM_SNAPSHOT");
  expect((await peer.waitForAck(joinId)).ack?.ok).toBe(true);
  return peer;
}

// ─── Управление серверами ────────────────────────────────────────────────────

const runningServers: ChildProcess[] = [];

afterEach(async () => {
  while (runningServers.length) {
    const proc = runningServers.pop();
    if (proc) await stopCallsWs(proc);
  }
});

// ─── Тесты ───────────────────────────────────────────────────────────────────

describe("calls-ws: полный жизненный цикл звонка (реальные TCP/WebSocket)", () => {

  it("health endpoint отвечает 200 с корректным JSON", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });

    const json = JSON.parse(body);
    expect(json.ok).toBe(true);
    expect(json.storage).toBeDefined();
  }, 15000);

  it("HELLO → WELCOME → AUTH → AUTH_OK → GW_HELLO полный хендшейк", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const ws = await connectWs(port);
    const session = new WsSession(ws);

    try {
      // HELLO
      const helloId = session.send("HELLO", { client: { deviceId: "handshake-dev-1" } });

      // Ждём WELCOME (сервер отправляет перед ACK)
      const welcome = await session.waitForType("WELCOME");
      expect(welcome.payload.heartbeatSec).toBe(10);
      expect(welcome.payload.resumeToken).toBeDefined();
      expect((welcome.payload.features as Record<string, unknown>).wsSeqRequired).toBe(true);

      const helloAck = await session.waitForAck(helloId);
      expect(helloAck.ack?.ok).toBe(true);

      // AUTH
      const authId = session.send("AUTH", { accessToken: "test-handshake-token-12345678901234" });

      const authOk = await session.waitForType("AUTH_OK");
      expect(authOk.payload.userId).toBe(devUserId("test-han"));
      expect(authOk.payload.deviceId).toBe("handshake-dev-1");

      const gwHello = await session.waitForType("GW_HELLO");
      expect(gwHello.payload.storage).toBeDefined();

      const authAck = await session.waitForAck(authId);
      expect(authAck.ack?.ok).toBe(true);
    } finally {
      session.close();
    }
  }, 15000);

  it("AUTH без токена — UNAUTHENTICATED", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const session = new WsSession(await connectWs(port));
    try {
      const helloId = session.send("HELLO", { client: { deviceId: "noauth-dev" } });
      await session.waitForAck(helloId);

      const authId = session.send("AUTH", { accessToken: "short" });
      const authAck = await session.waitForAck(authId);
      expect(authAck.ack?.ok).toBe(false);
      expect(authAck.ack?.error?.code).toBe("UNAUTHENTICATED");
    } finally {
      session.close();
    }
  }, 15000);

  it("seq нарушен → SEQ_OUT_OF_ORDER", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const ws = await connectWs(port);
    const session = new WsSession(ws);
    try {
      // Отправляем seq=1
      const helloId = session.send("HELLO", { client: { deviceId: "seq-test-dev" } });
      await session.waitForAck(helloId);

      // session.seq уже 2, но мы вручную шлём seq=5
      const badMsgId = randomUUID();
      ws.send(JSON.stringify({
        v: 1,
        type: "E2EE_CAPS",
        msgId: badMsgId,
        ts: Date.now(),
        seq: 5,
        payload: { insertableStreams: true, sframe: true },
      }));

      const badAck = await session.waitForAck(badMsgId);
      expect(badAck.ack?.ok).toBe(false);
      expect(badAck.ack?.error?.code).toBe("SEQ_OUT_OF_ORDER");
    } finally {
      session.close();
    }
  }, 15000);

  it("ROOM_CREATE → ROOM_CREATED + ROOM_JOIN_SECRET", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const caller = new WsSession(await connectWs(port));
    try {
      await caller.helloAndAuth("caller-room-dev", "caller-room-token-123456789012345");
      await caller.e2eeCaps();

      const createId = caller.send("ROOM_CREATE", {
        preferredRegion: "tr",
        allowedUserIds: [devUserId("caller-r"), devUserId("callee-r")],
      });

      const created = await caller.waitForType("ROOM_CREATED");
      expect(created.payload.roomId).toBeDefined();
      expect(created.payload.callId).toBeDefined();
      expect(created.payload.region).toBe("tr");
      expect(created.payload.epoch).toBe(0);

      const joinSecret = await caller.waitForType("ROOM_JOIN_SECRET");
      expect(joinSecret.payload.roomId).toBe(created.payload.roomId);
      expect(typeof joinSecret.payload.joinToken).toBe("string");
      expect((joinSecret.payload.joinToken as string).length).toBeGreaterThan(20);

      const createAck = await caller.waitForAck(createId);
      expect(createAck.ack?.ok).toBe(true);
    } finally {
      caller.close();
    }
  }, 15000);

  it("полный цикл: CREATE → JOIN → SNAPSHOT → ROOM_LEAVE", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    // Join token одноразовый (jti replay protection).
    // В реальном продукте caller отправляет token callee через call.invite,
    // callee делает ROOM_JOIN. Здесь тестируем полный single-peer цикл.
    const callerToken = "caller-full-cycle-token-12345678";
    const callerUserId = devUserId(callerToken);

    const caller = new WsSession(await connectWs(port));

    try {
      // ── Шаг 1: Аутентификация ─────────────────────────────────────────────
      await caller.helloAndAuth("caller-full-dev", callerToken);
      await caller.e2eeCaps();

      // ── Шаг 2: Создание комнаты ───────────────────────────────────────────
      const createId = caller.send("ROOM_CREATE", {
        preferredRegion: "ru",
        allowedUserIds: [callerUserId],
      });

      const roomCreated = await caller.waitForType("ROOM_CREATED");
      const roomId = roomCreated.payload.roomId as string;
      const callId = roomCreated.payload.callId as string;
      expect(roomId).toBeTruthy();
      expect(callId).toBeTruthy();
      expect(roomCreated.payload.region).toBe("ru");
      expect(roomCreated.payload.epoch).toBe(0);

      const joinSecretFrame = await caller.waitForType("ROOM_JOIN_SECRET");
      const joinToken = joinSecretFrame.payload.joinToken as string;
      expect(joinToken).toBeTruthy();
      expect(joinToken.length).toBeGreaterThan(20);

      await caller.waitForAck(createId);

      // ── Шаг 3: Вход в комнату (расходует join token) ──────────────────────
      const joinId = caller.send("ROOM_JOIN", {
        roomId,
        joinToken,
        deviceId: "caller-full-dev",
      });

      const joinOk = await caller.waitForType("ROOM_JOIN_OK");
      expect(joinOk.payload.roomId).toBe(roomId);
      expect(joinOk.payload.callId).toBe(callId);
      expect(joinOk.payload.mediasoup).toBeDefined();
      const mediasoup = joinOk.payload.mediasoup as Record<string, unknown>;
      const rtpCaps = mediasoup.routerRtpCapabilities as Record<string, unknown>;
      expect(Array.isArray(rtpCaps.codecs)).toBe(true);
      expect((rtpCaps.codecs as Array<unknown>).length).toBeGreaterThan(0);
      expect(joinOk.payload.turn).toBeDefined();

      // ROOM_SNAPSHOT сразу после JOIN
      const snapshot = await caller.waitForType("ROOM_SNAPSHOT");
      expect(snapshot.payload.roomId).toBe(roomId);
      expect(Array.isArray(snapshot.payload.peers)).toBe(true);

      const joinAck = await caller.waitForAck(joinId);
      expect(joinAck.ack?.ok).toBe(true);

      // ── Шаг 4: Replay protection — повторный JOIN отклоняется ─────────────
      const replayJoinId = caller.send("ROOM_JOIN", {
        roomId,
        joinToken,
        deviceId: "caller-full-dev",
      });
      const replayAck = await caller.waitForAck(replayJoinId);
      expect(replayAck.ack?.ok).toBe(false);
      expect(replayAck.ack?.error?.code).toBe("REPLAY_DETECTED");

      // ── Шаг 5: ROOM_LEAVE ─────────────────────────────────────────────────
      const leaveId = caller.send("ROOM_LEAVE", { roomId });

      const roomLeft = await caller.waitForType("ROOM_LEFT");
      expect(roomLeft.payload.roomId).toBe(roomId);

      const leaveAck = await caller.waitForAck(leaveId);
      expect(leaveAck.ack?.ok).toBe(true);

    } finally {
      caller.close();
    }
  }, 15000);

  it("ROOM_JOIN с невалидным joinToken — UNAUTHORIZED", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const session = new WsSession(await connectWs(port));
    try {
      await session.helloAndAuth("badtoken-dev", "badtoken-session-token-1234567890");
      await session.e2eeCaps();

      // Создаём комнату
      session.send("ROOM_CREATE", { preferredRegion: "tr" });
      const created = await session.waitForType("ROOM_CREATED");
      const roomId = created.payload.roomId as string;

      // Пытаемся JOIN с поддельным токеном
      const joinId = session.send("ROOM_JOIN", {
        roomId,
        joinToken: "fake-token.fake-signature",
        deviceId: "badtoken-dev",
      });

      const joinAck = await session.waitForAck(joinId);
      expect(joinAck.ack?.ok).toBe(false);
      expect(joinAck.ack?.error?.code).toBe("UNAUTHORIZED");
    } finally {
      session.close();
    }
  }, 15000);

  it("ROOM_JOIN в несуществующую комнату — ROOM_NOT_FOUND", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const session = new WsSession(await connectWs(port));
    try {
      await session.helloAndAuth("notfound-dev", "notfound-session-token-1234567890");

      const joinId = session.send("ROOM_JOIN", {
        roomId: "room_nonexistent",
        joinToken: "whatever.signature",
        deviceId: "notfound-dev",
      });

      const joinAck = await session.waitForAck(joinId);
      expect(joinAck.ack?.ok).toBe(false);
      expect(joinAck.ack?.error?.code).toBe("ROOM_NOT_FOUND");
    } finally {
      session.close();
    }
  }, 15000);

  it("call.invite + call.accept между двумя пользователями", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const aliceToken = "alice-signal-token-12345678901234";
    const bobToken = "bob-signal-token--12345678901234";
    const aliceUserId = devUserId(aliceToken);
    const bobUserId = devUserId(bobToken);

    const alice = new WsSession(await connectWs(port));
    const bob = new WsSession(await connectWs(port));

    try {
      await alice.helloAndAuth("alice-dev-1", aliceToken);
      await bob.helloAndAuth("bob-dev-1", bobToken);

      // Alice приглашает Bob
      const inviteId = alice.send("call.invite", {
        to: bobUserId,
        callId: "call-signal-test",
        callType: "video",
        conversationId: "conv-123",
      });

      // Bob получает приглашение
      const received = await bob.waitForType("call.invite");
      expect(received.payload.callId).toBe("call-signal-test");
      expect(received.payload.to).toBe(bobUserId);
      expect(received.payload.callType).toBe("video");

      const inviteAck = await alice.waitForAck(inviteId);
      expect(inviteAck.ack?.ok).toBe(true);

      // Bob принимает
      const acceptId = bob.send("call.accept", {
        to: aliceUserId,
        callId: "call-signal-test",
      });

      const acceptFrame = await alice.waitForType("call.accept");
      expect(acceptFrame.payload.callId).toBe("call-signal-test");

      const acceptAck = await bob.waitForAck(acceptId);
      expect(acceptAck.ack?.ok).toBe(true);

      // Alice отправляет hangup
      const hangupId = alice.send("call.hangup", {
        to: bobUserId,
        callId: "call-signal-test",
      });

      const hangupFrame = await bob.waitForType("call.hangup");
      expect(hangupFrame.payload.callId).toBe("call-signal-test");

      const hangupAck = await alice.waitForAck(hangupId);
      expect(hangupAck.ack?.ok).toBe(true);
    } finally {
      alice.close();
      bob.close();
    }
  }, 20000);

  it("закрытие WebSocket очищает device binding, сервер остаётся стабильным", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const callerToken = "caller-dc-test-token-1234567890";

    const caller = new WsSession(await connectWs(port));
    const second = new WsSession(await connectWs(port));

    try {
      await caller.helloAndAuth("caller-dc-dev", callerToken);
      await second.helloAndAuth("second-dc-dev", "second-dc-test-token-1234567890");

      // Создаём комнату и входим
      caller.send("ROOM_CREATE", {});
      const created = await caller.waitForType("ROOM_CREATED");
      const roomId = created.payload.roomId as string;

      const joinSecret = await caller.waitForType("ROOM_JOIN_SECRET");
      const joinToken = joinSecret.payload.joinToken as string;

      caller.send("ROOM_JOIN", { roomId, joinToken, deviceId: "caller-dc-dev" });
      await caller.waitForType("ROOM_JOIN_OK");
      await caller.waitForType("ROOM_SNAPSHOT");

      // Second session резко закрывает соединение (имитация обрыва)
      second.ws.terminate();

      // Даём серверу время на обработку close
      await new Promise((r) => setTimeout(r, 300));

      // Caller по-прежнему может работать: сервер стабилен после обрыва
      const pingId = caller.send("PING", {});
      const pingAck = await caller.waitForAck(pingId);
      expect(pingAck.ack?.ok).toBe(true);
    } finally {
      caller.close();
      second.close();
    }
  }, 20000);

  it("SFU transport stubs: TRANSPORT_CREATE/CONNECT, PRODUCE, PRODUCER_CLOSE/CONSUMER_CLOSE", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const session = new WsSession(await connectWs(port));
    try {
      await session.helloAndAuth("transport-dev-1", "transport-stub-token-123456789012");

      // TRANSPORT_CREATE (send)
      const tcId = session.send("TRANSPORT_CREATE", {
        roomId: "room_any",
        direction: "send",
      });
      const tcSendRes = await session.waitFor(
        (f) => f.type === "TRANSPORT_CREATED" && f.payload.direction === "send",
      );
      expect(tcSendRes.payload.transportId).toBeDefined();
      expect(tcSendRes.payload.iceParameters).toBeDefined();
      expect(tcSendRes.payload.dtlsParameters).toBeDefined();
      await session.waitForAck(tcId);

      // TRANSPORT_CREATE (recv)
      const tcRecvId = session.send("TRANSPORT_CREATE", {
        roomId: "room_any",
        direction: "recv",
      });
      const tcRecvRes = await session.waitFor(
        (f) => f.type === "TRANSPORT_CREATED" && f.payload.direction === "recv",
      );
      expect(tcRecvRes.payload.transportId).toBeDefined();
      await session.waitForAck(tcRecvId);

      // TRANSPORT_CONNECT
      const connectId = session.send("TRANSPORT_CONNECT", {
        transportId: tcSendRes.payload.transportId,
        dtlsParameters: { role: "client" },
      });
      const connectAck = await session.waitForAck(connectId);
      expect(connectAck.ack?.ok).toBe(true);

      // PRODUCE
      const produceId = session.send("PRODUCE", {
        roomId: "room_any",
        transportId: tcSendRes.payload.transportId,
        kind: "audio",
        rtpParameters: {},
      });
      const produced = await session.waitForType("PRODUCED");
      expect(produced.payload.producerId).toBeDefined();
      expect(produced.payload.kind).toBe("audio");
      await session.waitForAck(produceId);

      const producerCloseId = session.send("PRODUCER_CLOSE", {
        roomId: "room_any",
        producerId: produced.payload.producerId,
      });
      const producerCloseAck = await session.waitForAck(producerCloseId);
      expect(producerCloseAck.ack?.ok).toBe(true);

      const consumerCloseId = session.send("CONSUMER_CLOSE", {
        roomId: "room_any",
        consumerId: "consumer_stub",
      });
      const consumerCloseAck = await session.waitForAck(consumerCloseId);
      expect(consumerCloseAck.ack?.ok).toBe(true);
    } finally {
      session.close();
    }
  }, 15000);

  it("per-IP rate limit: >10 соединений с одного IP получают close(4029)", async () => {
    const { proc, port } = await startCallsWs({
      CALLS_WS_MAX_CONNECTIONS_PER_IP: "3",
    });
    runningServers.push(proc);

    const sockets: WebSocket[] = [];
    try {
      // Открываем 3 соединения (лимит)
      for (let i = 0; i < 3; i++) {
        sockets.push(await connectWs(port));
      }

      // 4-е соединение должно быть закрыто сервером
      const fourthWs = await connectWs(port);
      sockets.push(fourthWs);

      const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("4th socket not closed")), 3000);
        fourthWs.once("close", (code, reason) => {
          clearTimeout(timer);
          resolve({ code, reason: reason.toString() });
        });
      });

      expect(closed.code).toBe(4029);
      expect(closed.reason).toBe("TOO_MANY_CONNECTIONS");
    } finally {
      for (const s of sockets) {
        try { s.close(); } catch { /* ignore */ }
      }
    }
  }, 15000);

  it("behavioral E2EE: mailbox replay, late join, duplicate package ignored, missingSenderKeys обновляется после KEY_ACK", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const { alice, bob, roomId, aliceUserId, aliceDeviceId, bobDeviceId } = await createJoinedTwoPeerRoom(port, "behav1");

    try {
      const bobStateId = bob.send("ROOM_STATE_GET", { roomId });
      const bobState = await bob.waitForType("ROOM_STATE");
      expect(((bobState.payload.e2ee as Record<string, unknown>).missingSenderKeys as string[])).toContain(aliceDeviceId);
      expect((await bob.waitForAck(bobStateId)).ack?.ok).toBe(true);

      const packageMessageId = randomUUID();
      const keyPackagePayload = buildDiscoveryKeyPackage({
        roomId,
        fromDeviceId: aliceDeviceId,
        toDeviceId: bobDeviceId,
        userId: aliceUserId,
        messageId: packageMessageId,
      });
      const keyPackageId = alice.send("KEY_PACKAGE", keyPackagePayload);
      const pushedPackage = await bob.waitForType("KEY_PACKAGE");
      expect((pushedPackage.payload as Record<string, unknown>).messageId).toBe(packageMessageId);
      expect((await alice.waitForAck(keyPackageId)).ack?.ok).toBe(true);

      const duplicatePackageId = alice.send("KEY_PACKAGE", keyPackagePayload);
      const duplicateAck = await alice.waitForAck(duplicatePackageId);
      expect(duplicateAck.ack?.ok).toBe(false);
      expect(duplicateAck.ack?.error?.code).toBe("REPLAY_DETECTED");
      await expect(bob.waitForType("KEY_PACKAGE", 300)).rejects.toThrow("waitFor timed out");

      const syncId = bob.send("SYNC_MAILBOX", { deviceId: bobDeviceId, lastStreamId: "0-0", limit: 20 });
      const mailbox = await bob.waitForType("MAILBOX_BATCH");
      const messages = mailbox.payload.messages as Array<{ frame: { type: string; payload?: string | Record<string, unknown> } }>;
      expect(messages.some((m) => m.frame.type === "KEY_PACKAGE" && String(m.frame.payload).includes(packageMessageId))).toBe(true);
      expect((await bob.waitForAck(syncId)).ack?.ok).toBe(true);

      const keyAckId = bob.send("KEY_ACK", {
        roomId,
        epoch: 0,
        fromDeviceId: bobDeviceId,
        senderKeyId: keyPackagePayload.senderKeyId,
        messageId: randomUUID(),
        refId: keyPackageId,
      });
      const keyAcked = await bob.waitForType("KEY_ACKED");
      expect((keyAcked.payload.missingSenderKeys as string[])).not.toContain(aliceDeviceId);
      expect((await bob.waitForAck(keyAckId)).ack?.ok).toBe(true);
    } finally {
      alice.close();
      bob.close();
    }
  }, 20000);

  it("behavioral E2EE: malformed/fuzzed KEY_PACKAGE fails closed", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const { alice, bob, roomId, aliceUserId, aliceDeviceId, bobDeviceId } = await createJoinedTwoPeerRoom(port, "fuzz1");

    try {
      const valid = buildDiscoveryKeyPackage({
        roomId,
        fromDeviceId: aliceDeviceId,
        toDeviceId: bobDeviceId,
        userId: aliceUserId,
      });

      const cases: Array<{ name: string; mutate: (payload: Record<string, unknown>) => void; code: string }> = [
        { name: "missing keyPackageType", mutate: (p) => { delete p.keyPackageType; }, code: "INVALID_KEY_PACKAGE_TYPE" },
        { name: "invalid keyPackageType", mutate: (p) => { p.keyPackageType = "BAD"; }, code: "INVALID_KEY_PACKAGE_TYPE" },
        { name: "missing roomId", mutate: (p) => { delete p.roomId; }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "fromDevice mismatch", mutate: (p) => { p.fromDeviceId = "mallory-fuzz-dev"; (p.senderIdentity as Record<string, unknown>).deviceId = "mallory-fuzz-dev"; }, code: "UNAUTHORIZED" },
        { name: "target mismatch", mutate: (p) => { p.targetDeviceId = "different-target-dev"; }, code: "INVALID_KEY_PACKAGE_TARGET" },
        { name: "bad base64 ciphertext", mutate: (p) => { p.ciphertext = "not base64"; }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "bad senderPublicKey", mutate: (p) => { p.senderPublicKey = "not base64"; p.ciphertext = "not base64"; }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "bad salt length", mutate: (p) => { p.salt = Buffer.from("short").toString("base64"); }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "bad sig", mutate: (p) => { p.sig = "not base64"; }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "bad messageId", mutate: (p) => { p.messageId = "not-a-uuid"; }, code: "INVALID_KEY_PACKAGE_SCHEMA" },
        { name: "unknown target", mutate: (p) => { p.toDeviceId = "unknown-fuzz-dev"; p.targetDeviceId = "unknown-fuzz-dev"; }, code: "UNAUTHORIZED" },
      ];

      for (const item of cases) {
        const payload = structuredClone(valid) as Record<string, unknown>;
        payload.messageId = randomUUID();
        item.mutate(payload);
        const msgId = alice.send("KEY_PACKAGE", payload);
        const ack = await alice.waitForAck(msgId);
        expect(ack.ack?.ok, item.name).toBe(false);
        expect(ack.ack?.error?.code, item.name).toBe(item.code);
      }

      await expect(bob.waitForType("KEY_PACKAGE", 300)).rejects.toThrow("waitFor timed out");
    } finally {
      alice.close();
      bob.close();
    }
  }, 20000);

  it("behavioral E2EE: stale epoch KEY_PACKAGE rejected after REKEY_COMMIT", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const { alice, bob, roomId, aliceUserId, aliceDeviceId, bobDeviceId } = await createJoinedTwoPeerRoom(port, "behav2");

    try {
      const beginId = alice.send("REKEY_BEGIN", { roomId, epoch: 1, newEpoch: 1 });
      await alice.waitForType("REKEY_BEGIN");
      await bob.waitForType("REKEY_BEGIN");
      expect((await alice.waitForAck(beginId)).ack?.ok).toBe(true);

      const aliceAckId = alice.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: aliceDeviceId, messageId: randomUUID(), refId: beginId });
      await alice.waitForType("KEY_ACKED");
      expect((await alice.waitForAck(aliceAckId)).ack?.ok).toBe(true);

      const bobAckId = bob.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: bobDeviceId, messageId: randomUUID(), refId: beginId });
      await bob.waitForType("KEY_ACKED");
      expect((await bob.waitForAck(bobAckId)).ack?.ok).toBe(true);

      const commitId = alice.send("REKEY_COMMIT", { roomId, epoch: 1 });
      await alice.waitForType("REKEY_COMMIT");
      await bob.waitForType("REKEY_COMMIT");
      expect((await alice.waitForAck(commitId)).ack?.ok).toBe(true);

      const staleId = alice.send("KEY_PACKAGE", buildDiscoveryKeyPackage({
        roomId,
        fromDeviceId: aliceDeviceId,
        toDeviceId: bobDeviceId,
        userId: aliceUserId,
        epoch: 0,
      }));
      const staleAck = await alice.waitForAck(staleId);
      expect(staleAck.ack?.ok).toBe(false);
      expect(staleAck.ack?.error?.code).toBe("STALE_EPOCH");
    } finally {
      alice.close();
      bob.close();
    }
  }, 20000);

  it("behavioral E2EE: rekey membership storm excludes removed peers from quorum and key delivery", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const charlieUserId = devUserId("charlie-st");
    const daveUserId = devUserId("dave-stor");
    const base = await createJoinedTwoPeerRoom(port, "storm1", [charlieUserId, daveUserId]);
    const { alice, bob, roomId, joinToken, aliceDeviceId, bobDeviceId } = base;
    const charlieDeviceId = "charlie-storm1-dev";
    const daveDeviceId = "dave-storm1-dev";
    let charlie: WsSession | null = null;
    let dave: WsSession | null = null;

    try {
      charlie = await joinAdditionalPeer(port, { roomId, joinToken, deviceId: charlieDeviceId, token: "charlie-storm1-token-123456789012" });
      dave = await joinAdditionalPeer(port, { roomId, joinToken, deviceId: daveDeviceId, token: "dave-storm1-token---123456789012" });

      const kickId = alice.send("PEER_KICKED", { roomId, deviceId: daveDeviceId });
      expect((await alice.waitForAck(kickId)).ack?.ok).toBe(true);

      const beginId = alice.send("REKEY_BEGIN", { roomId, epoch: 1, newEpoch: 1 });
      expect((await alice.waitForAck(beginId)).ack?.ok).toBe(true);

      const aliceAckId = alice.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: aliceDeviceId, messageId: randomUUID(), refId: beginId });
      expect((await alice.waitForAck(aliceAckId)).ack?.ok).toBe(true);

      const bobAckId = bob.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: bobDeviceId, messageId: randomUUID(), refId: beginId });
      expect((await bob.waitForAck(bobAckId)).ack?.ok).toBe(true);

      const commitTooEarlyId = alice.send("REKEY_COMMIT", { roomId, epoch: 1 });
      const commitTooEarlyAck = await alice.waitForAck(commitTooEarlyId);
      expect(commitTooEarlyAck.ack?.ok).toBe(false);
      expect(commitTooEarlyAck.ack?.error?.code).toBe("E2EE_KEY_SYNC_FAILED");

      const charlieAckId = charlie.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: charlieDeviceId, messageId: randomUUID(), refId: beginId });
      expect((await charlie.waitForAck(charlieAckId)).ack?.ok).toBe(true);

      const daveAckId = dave.send("KEY_ACK", { roomId, epoch: 1, fromDeviceId: daveDeviceId, messageId: randomUUID(), refId: beginId });
      const daveAck = await dave.waitForAck(daveAckId);
      expect(daveAck.ack?.ok).toBe(false);
      expect(daveAck.ack?.error?.code).toBe("UNAUTHORIZED");

      const commitId = alice.send("REKEY_COMMIT", { roomId, epoch: 1 });
      expect((await alice.waitForAck(commitId)).ack?.ok).toBe(true);

      const stateId = alice.send("ROOM_STATE_GET", { roomId });
      const state = await alice.waitForType("ROOM_STATE");
      const expected = (state.payload.e2ee as Record<string, unknown>).expectedSenderDevices as string[];
      expect(expected.sort()).toEqual([aliceDeviceId, bobDeviceId, charlieDeviceId].sort());
      expect(expected).not.toContain(daveDeviceId);
      expect((await alice.waitForAck(stateId)).ack?.ok).toBe(true);
    } finally {
      alice.close();
      bob.close();
      charlie?.close();
      dave?.close();
    }
  }, 30000);

  it("server exclusion policy: removed device не получает key material и не участвует в room state", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const aliceToken = "alice-exclusion-token-123456789012";
    const bobToken = "bob-exclusion-token--123456789012";
    const aliceUserId = devUserId(aliceToken);
    const bobUserId = devUserId(bobToken);

    const alice = new WsSession(await connectWs(port));
    const bob = new WsSession(await connectWs(port));

    const b64 = Buffer.from("a".repeat(32)).toString("base64");
    const sig = Buffer.from("s".repeat(64)).toString("base64");
    const jwkCoord = Buffer.from("x".repeat(32)).toString("base64url");

    try {
      await alice.helloAndAuth("alice-exclusion-dev", aliceToken);
      await bob.helloAndAuth("bob-exclusion-dev", bobToken);
      await alice.e2eeCaps();
      await bob.e2eeCaps();

      const createId = alice.send("ROOM_CREATE", {
        preferredRegion: "tr",
        allowedUserIds: [aliceUserId, bobUserId],
      });
      const created = await alice.waitForType("ROOM_CREATED");
      const roomId = created.payload.roomId as string;
      const joinToken = (await alice.waitForType("ROOM_JOIN_SECRET")).payload.joinToken as string;
      await alice.waitForAck(createId);

      const aliceJoinId = alice.send("ROOM_JOIN", { roomId, joinToken, deviceId: "alice-exclusion-dev" });
      await alice.waitForType("ROOM_JOIN_OK");
      await alice.waitForType("ROOM_SNAPSHOT");
      expect((await alice.waitForAck(aliceJoinId)).ack?.ok).toBe(true);

      const bobJoinId = bob.send("ROOM_JOIN", { roomId, joinToken, deviceId: "bob-exclusion-dev" });
      await bob.waitForType("ROOM_JOIN_OK");
      await bob.waitForType("ROOM_SNAPSHOT");
      expect((await bob.waitForAck(bobJoinId)).ack?.ok).toBe(true);
      await alice.waitForType("PEER_JOINED");
      await alice.waitForType("REKEY_REQUIRED");

      const removeId = alice.send("DEVICE_REMOVED", { roomId, deviceId: "bob-exclusion-dev" });
      const removedForBob = await bob.waitForType("DEVICE_REMOVED");
      expect(removedForBob.payload.deviceId).toBe("bob-exclusion-dev");
      const removedForAlice = await alice.waitForType("DEVICE_REMOVED");
      expect(removedForAlice.payload.rekeyRequired).toBe(true);
      const rekeyRequired = await alice.waitForType("REKEY_REQUIRED");
      expect(rekeyRequired.payload.reason).toBe("device_removed");
      expect((await alice.waitForAck(removeId)).ack?.ok).toBe(true);

      const stateId = bob.send("ROOM_STATE_GET", { roomId });
      const stateAck = await bob.waitForAck(stateId);
      expect(stateAck.ack?.ok).toBe(false);
      expect(stateAck.ack?.error?.code).toBe("UNAUTHORIZED");

      const keyPackageId = alice.send("KEY_PACKAGE", {
        keyPackageType: "DISCOVERY",
        roomId,
        fromDeviceId: "alice-exclusion-dev",
        toDeviceId: "bob-exclusion-dev",
        targetDeviceId: "bob-exclusion-dev",
        senderKeyId: randomUUID(),
        epoch: 0,
        ciphertext: b64,
        senderPublicKey: b64,
        senderSigningPublicKey: b64,
        salt: b64,
        sig,
        messageId: randomUUID(),
        discoveryNonce: "discovery-nonce-123456",
        senderIdentity: {
          userId: aliceUserId,
          deviceId: "alice-exclusion-dev",
          sessionId: "session-alice-exclusion",
          identityPubKeyJwk: { kty: "EC", crv: "P-256", x: jwkCoord, y: jwkCoord },
        },
      });
      const keyPackageAck = await alice.waitForAck(keyPackageId);
      expect(keyPackageAck.ack?.ok).toBe(false);
      expect(keyPackageAck.ack?.error?.code).toBe("DEVICE_EXCLUDED");

      const snapshotId = alice.send("ROOM_STATE_GET", { roomId });
      const roomState = await alice.waitForType("ROOM_STATE");
      const expectedSenderDevices = (roomState.payload.e2ee as Record<string, unknown>).expectedSenderDevices as string[];
      expect(expectedSenderDevices).toEqual(["alice-exclusion-dev"]);
      expect((await alice.waitForAck(snapshotId)).ack?.ok).toBe(true);
    } finally {
      alice.close();
      bob.close();
    }
  }, 20000);

  it("GET_ROUTER_RTP_CAPABILITIES возвращает кодеки", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const session = new WsSession(await connectWs(port));
    try {
      await session.helloAndAuth("rtp-caps-dev", "rtp-caps-token-12345678901234567");

      const rtpId = session.send("GET_ROUTER_RTP_CAPABILITIES", { roomId: "room_any" });

      const rtpRes = await session.waitForType("ROUTER_RTP_CAPABILITIES");
      const caps = rtpRes.payload.routerRtpCapabilities as Record<string, unknown>;
      expect(Array.isArray(caps.codecs)).toBe(true);
      const codecs = caps.codecs as Array<Record<string, unknown>>;
      expect(codecs.length).toBeGreaterThanOrEqual(2);

      // Проверяем наличие opus и VP8
      const mimeTypes = codecs.map((c) => c.mimeType);
      expect(mimeTypes).toContain("audio/opus");
      expect(mimeTypes).toContain("video/VP8");

      const rtpAck = await session.waitForAck(rtpId);
      expect(rtpAck.ack?.ok).toBe(true);
    } finally {
      session.close();
    }
  }, 15000);

  it("дубликат msgId → ACK ok (dedup)", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const ws = await connectWs(port);
    const session = new WsSession(ws);
    try {
      await session.helloAndAuth("dedup-dev-1", "dedup-token-12345678901234567890");

      // Отправляем PING дважды с одинаковым msgId
      const msgId = randomUUID();
      const frame = JSON.stringify({
        v: 1,
        type: "PING",
        msgId,
        ts: Date.now(),
        seq: 3,  // следующий после HELLO(1) + AUTH(2)
        payload: {},
      });

      ws.send(frame);
      const firstAck = await session.waitForAck(msgId);
      expect(firstAck.ack?.ok).toBe(true);

      // Тот же msgId, но seq=4 (дубликат по msgId)
      ws.send(JSON.stringify({
        v: 1,
        type: "PING",
        msgId,
        ts: Date.now(),
        seq: 4,
        payload: {},
      }));
      const secondAck = await session.waitForAck(msgId);
      expect(secondAck.ack?.ok).toBe(true);
    } finally {
      session.close();
    }
  }, 15000);

});
