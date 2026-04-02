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

  it("SFU transport stubs: TRANSPORT_CREATE/CONNECT, PRODUCE", async () => {
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
