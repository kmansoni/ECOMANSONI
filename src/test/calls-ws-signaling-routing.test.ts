/* @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import WebSocket from "ws";

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

function waitForHealth(port: number, timeoutMs = 8000) {
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
        setTimeout(probe, 120);
      });
      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("calls-ws did not become healthy in time"));
          return;
        }
        setTimeout(probe, 120);
      });
    };
    probe();
  });
}

async function startCallsWs() {
  const port = 20000 + Math.floor(Math.random() * 2000);
  const serverEntry = path.resolve(process.cwd(), "server/calls-ws/index.mjs");
  const proc = spawn(process.execPath, [serverEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CALLS_WS_PORT: String(port),
      CALLS_DEV_INSECURE_AUTH: "1",
      CALLS_ALLOW_INMEM_FALLBACK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupLogs = "";
  proc.stdout.on("data", (chunk) => {
    startupLogs += chunk.toString();
  });
  proc.stderr.on("data", (chunk) => {
    startupLogs += chunk.toString();
  });

  await Promise.race([
    waitForHealth(port),
    new Promise<never>((_, reject) => {
      proc.once("exit", (code, signal) => {
        reject(new Error(`calls-ws exited before health check (code=${String(code)}, signal=${String(signal)})`));
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
      if (!proc.killed && proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }, 1200);
  });
}

function connectWs(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", (err) => reject(err));
  });
}

function devUserIdFromToken(token: string) {
  return `dev_${token.slice(0, 8)}`;
}

class WsSession {
  readonly ws: WebSocket;
  private seq = 1;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  send(type: string, payload: Record<string, unknown>) {
    const msgId = randomUUID();
    const frame: WsFrame = {
      v: 1,
      type,
      msgId,
      ts: Date.now(),
      seq: this.seq++,
      payload,
    };
    this.ws.send(JSON.stringify(frame));
    return msgId;
  }

  waitForAck(ackOfMsgId: string, timeoutMs = 5000) {
    return new Promise<WsFrame>((resolve, reject) => {
      const onMessage = (raw: WebSocket.RawData) => {
        try {
          const frame = JSON.parse(raw.toString()) as WsFrame;
          if (frame.type !== "ACK") return;
          if (frame.ack?.ackOfMsgId !== ackOfMsgId) return;
          cleanup();
          resolve(frame);
        } catch {
          // ignore non-json
        }
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting ACK for ${ackOfMsgId}`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.ws.off("message", onMessage);
        this.ws.off("error", onError);
      };

      this.ws.on("message", onMessage);
      this.ws.on("error", onError);
    });
  }

  waitForFrame(type: string, timeoutMs = 5000) {
    return new Promise<WsFrame>((resolve, reject) => {
      const onMessage = (raw: WebSocket.RawData) => {
        try {
          const frame = JSON.parse(raw.toString()) as WsFrame;
          if (frame.type !== type) return;
          cleanup();
          resolve(frame);
        } catch {
          // ignore non-json
        }
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting frame type ${type}`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.ws.off("message", onMessage);
        this.ws.off("error", onError);
      };

      this.ws.on("message", onMessage);
      this.ws.on("error", onError);
    });
  }

  waitForClose(timeoutMs = 5000) {
    return new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting socket close"));
      }, timeoutMs);

      const onClose = (code: number, reason: Buffer) => {
        cleanup();
        resolve({ code, reason: reason.toString() });
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.ws.off("close", onClose);
        this.ws.off("error", onError);
      };

      this.ws.on("close", onClose);
      this.ws.on("error", onError);
    });
  }

  async helloAndAuth(deviceId: string, accessToken: string) {
    const helloMsgId = this.send("HELLO", { client: { deviceId } });
    const helloAck = await this.waitForAck(helloMsgId);
    expect(helloAck.ack?.ok).toBe(true);

    const authMsgId = this.send("AUTH", { accessToken });
    const authAck = await this.waitForAck(authMsgId);
    expect(authAck.ack?.ok).toBe(true);
  }
}

const runningServers: ChildProcess[] = [];

afterEach(async () => {
  while (runningServers.length) {
    const proc = runningServers.pop();
    if (proc) {
      await stopCallsWs(proc);
    }
  }
});

describe("calls-ws signaling routing", () => {
  it("delivers call.invite to authenticated callee before ROOM_JOIN", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const calleeToken = "callee-token-aaaaaaaaaaaaaaaaaaaa";
    const callerToken = "caller-token-bbbbbbbbbbbbbbbbbbbb";
    const calleeUserId = devUserIdFromToken(calleeToken);

    const calleeWs = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const callerWs = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));

    try {
      await calleeWs.helloAndAuth("callee-device-1", calleeToken);
      await callerWs.helloAndAuth("caller-device-1", callerToken);

      const deliveredPromise = calleeWs.waitForFrame("call.invite");
      const inviteMsgId = callerWs.send("call.invite", {
        to: calleeUserId,
        callId: "call-before-room-join",
        callType: "video",
      });

      const inviteAck = await callerWs.waitForAck(inviteMsgId);
      expect(inviteAck.ack?.ok).toBe(true);

      const delivered = await deliveredPromise;
      expect(delivered.payload.callId).toBe("call-before-room-join");
      expect(delivered.payload.to).toBe(calleeUserId);
    } finally {
      calleeWs.ws.close();
      callerWs.ws.close();
    }
  }, 20000);

  it("falls back to toUser broadcast when to_device is stale", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const calleeToken = "callee-token-cccccccccccccccccccc";
    const callerToken = "caller-token-dddddddddddddddddddd";
    const calleeUserId = devUserIdFromToken(calleeToken);

    const calleeWs = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const callerWs = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));

    try {
      await calleeWs.helloAndAuth("callee-device-fallback", calleeToken);
      await callerWs.helloAndAuth("caller-device-fallback", callerToken);

      const deliveredPromise = calleeWs.waitForFrame("call.invite");
      const inviteMsgId = callerWs.send("call.invite", {
        to: calleeUserId,
        to_device: "non-existent-device-123",
        callId: "call-stale-device-fallback",
        callType: "audio",
      });

      const inviteAck = await callerWs.waitForAck(inviteMsgId);
      expect(inviteAck.ack?.ok).toBe(true);

      const delivered = await deliveredPromise;
      expect(delivered.payload.callId).toBe("call-stale-device-fallback");
      expect(delivered.payload.to).toBe(calleeUserId);
    } finally {
      calleeWs.ws.close();
      callerWs.ws.close();
    }
  }, 20000);

  it("rejects invalid call payload with VALIDATION_FAILED", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const callerWs = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));

    try {
      await callerWs.helloAndAuth("caller-device-invalid", "caller-token-eeeeeeeeeeeeeeeeeeee");

      const badInviteMsgId = callerWs.send("call.invite", {
        to: "dev_target123",
        callType: "video",
      });

      const badInviteAck = await callerWs.waitForAck(badInviteMsgId);
      expect(badInviteAck.ack?.ok).toBe(false);
      expect(badInviteAck.ack?.error?.code).toBe("VALIDATION_FAILED");
    } finally {
      callerWs.ws.close();
    }
  }, 20000);

  it("replaces stale socket when same user reconnects with same deviceId", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const sharedToken = "shared-user-token-ffffffffffffffff";
    const userId = devUserIdFromToken(sharedToken);

    const firstSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const secondSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const callerSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));

    try {
      await firstSession.helloAndAuth("shared-device-42", sharedToken);
      const closePromise = firstSession.waitForClose();

      await secondSession.helloAndAuth("shared-device-42", sharedToken);
      const closed = await closePromise;
      expect(closed.code).toBe(4009);
      expect(closed.reason).toBe("DEVICE_REPLACED");

      await callerSession.helloAndAuth("caller-device-shared-check", "caller-token-12121212121212121212");
      const deliveredPromise = secondSession.waitForFrame("call.invite");
      const inviteMsgId = callerSession.send("call.invite", {
        to: userId,
        callId: "call-after-device-replace",
        callType: "video",
      });
      const inviteAck = await callerSession.waitForAck(inviteMsgId);
      expect(inviteAck.ack?.ok).toBe(true);

      const delivered = await deliveredPromise;
      expect(delivered.payload.callId).toBe("call-after-device-replace");
    } finally {
      firstSession.ws.close();
      secondSession.ws.close();
      callerSession.ws.close();
    }
  }, 20000);

  it("rejects deviceId hijack attempt from another user", async () => {
    const { proc, port } = await startCallsWs();
    runningServers.push(proc);

    const ownerToken = "owner-token-13131313131313131313";
    const attackerToken = "attacker-token-1414141414141414";
    const ownerUserId = devUserIdFromToken(ownerToken);

    const ownerSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const attackerSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));
    const callerSession = new WsSession(await connectWs(`ws://127.0.0.1:${port}`));

    try {
      await ownerSession.helloAndAuth("exclusive-device-99", ownerToken);

      const attackerHelloMsgId = attackerSession.send("HELLO", { client: { deviceId: "exclusive-device-99" } });
      const attackerHelloAck = await attackerSession.waitForAck(attackerHelloMsgId);
      expect(attackerHelloAck.ack?.ok).toBe(true);

      const attackerAuthMsgId = attackerSession.send("AUTH", { accessToken: attackerToken });
      const attackerAuthAck = await attackerSession.waitForAck(attackerAuthMsgId);
      expect(attackerAuthAck.ack?.ok).toBe(false);
      expect(attackerAuthAck.ack?.error?.code).toBe("VALIDATION_FAILED");
      expect(attackerAuthAck.ack?.error?.message).toBe("DEVICE_ID_IN_USE");

      await callerSession.helloAndAuth("caller-device-owner-check", "caller-token-15151515151515151515");
      const deliveredPromise = ownerSession.waitForFrame("call.invite");
      const inviteMsgId = callerSession.send("call.invite", {
        to: ownerUserId,
        callId: "call-owner-still-reachable",
        callType: "audio",
      });
      const inviteAck = await callerSession.waitForAck(inviteMsgId);
      expect(inviteAck.ack?.ok).toBe(true);

      const delivered = await deliveredPromise;
      expect(delivered.payload.callId).toBe("call-owner-still-reachable");
    } finally {
      ownerSession.ws.close();
      attackerSession.ws.close();
      callerSession.ws.close();
    }
  }, 20000);
});
