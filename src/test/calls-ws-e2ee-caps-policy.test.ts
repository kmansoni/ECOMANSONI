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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function startCallsWs(envOverrides: Record<string, string>) {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const serverEntry = path.resolve(process.cwd(), "server/calls-ws/index.mjs");
  const proc = spawn(process.execPath, [serverEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CALLS_WS_PORT: String(port),
      CALLS_DEV_INSECURE_AUTH: envOverrides.CALLS_DEV_INSECURE_AUTH ?? "1",
      CALLS_ALLOW_INMEM_FALLBACK: "1",
      ...envOverrides,
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

function connectWs(url: string, headers?: Record<string, string>) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, headers ? { headers } : undefined);
    ws.once("open", () => resolve(ws));
    ws.once("error", (err) => reject(err));
  });
}

function waitForClose(ws: WebSocket, timeoutMs = 5000) {
  return new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket close"));
    }, timeoutMs);

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sendFrame(ws: WebSocket, type: string, payload: Record<string, unknown>, seq?: number) {
  const msgId = randomUUID();
  const frame: WsFrame = {
    v: 1,
    type,
    msgId,
    ts: Date.now(),
    payload,
  };
  if (typeof seq === "number") {
    frame.seq = seq;
  }
  ws.send(JSON.stringify(frame));
  return msgId;
}

function waitForAck(ws: WebSocket, ackOfMsgId: string, timeoutMs = 5000) {
  return new Promise<WsFrame>((resolve, reject) => {
    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const frame = JSON.parse(raw.toString()) as WsFrame;
        if (frame.type !== "ACK") return;
        if (frame.ack?.ackOfMsgId !== ackOfMsgId) return;
        cleanup();
        resolve(frame);
      } catch {
        // Ignore non-json payloads.
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
      ws.off("message", onMessage);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

async function authAndGetAck(ws: WebSocket) {
  const helloMsgId = sendFrame(ws, "HELLO", { client: { deviceId: "test-device-1" } }, 1);
  await waitForAck(ws, helloMsgId);

  const authMsgId = sendFrame(
    ws,
    "AUTH",
    { accessToken: "dev-access-token-12345678901234567890" },
    2,
  );
  const authAck = await waitForAck(ws, authMsgId);
  expect(authAck.ack?.ok).toBe(true);
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

describe("calls-ws E2EE_CAPS policy enforcement", () => {
  it("rejects E2EE_CAPS when SFrame/Insertable Streams are missing in strict mode", async () => {
    const { proc, port } = await startCallsWs({ CALLS_REQUIRE_SFRAME_CAPS: "1" });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`);
    try {
      await authAndGetAck(ws);

      const capsMsgId = sendFrame(
        ws,
        "E2EE_CAPS",
        {
          insertableStreams: false,
          sframe: false,
        },
        3,
      );
      const capsAck = await waitForAck(ws, capsMsgId);

      expect(capsAck.ack?.ok).toBe(false);
      expect(capsAck.ack?.error?.code).toBe("E2EE_POLICY_VIOLATION");
    } finally {
      ws.close();
      await delay(20);
    }
  }, 20000);

  it("rejects E2EE_CAPS when Double Ratchet capability is missing in strict mode", async () => {
    const { proc, port } = await startCallsWs({
      CALLS_REQUIRE_SFRAME_CAPS: "1",
      CALLS_REQUIRE_DOUBLE_RATCHET_CAPS: "1",
    });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`);
    try {
      await authAndGetAck(ws);

      const capsMsgId = sendFrame(
        ws,
        "E2EE_CAPS",
        {
          insertableStreams: true,
          sframe: true,
        },
        3,
      );
      const capsAck = await waitForAck(ws, capsMsgId);

      expect(capsAck.ack?.ok).toBe(false);
      expect(capsAck.ack?.error?.code).toBe("E2EE_POLICY_VIOLATION");
      expect(capsAck.ack?.error?.message).toContain("Double Ratchet");
    } finally {
      ws.close();
      await delay(20);
    }
  }, 20000);

  it("accepts E2EE_CAPS when SFrame and Double Ratchet are present", async () => {
    const { proc, port } = await startCallsWs({
      CALLS_REQUIRE_SFRAME_CAPS: "1",
      CALLS_REQUIRE_DOUBLE_RATCHET_CAPS: "1",
    });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`);
    try {
      await authAndGetAck(ws);

      const capsMsgId = sendFrame(
        ws,
        "E2EE_CAPS",
        {
          insertableStreams: true,
          sframe: true,
          doubleRatchet: true,
          supportedCipherSuites: ["DOUBLE_RATCHET_P256_AES128GCM"],
        },
        3,
      );
      const capsAck = await waitForAck(ws, capsMsgId);

      expect(capsAck.ack?.ok).toBe(true);
    } finally {
      ws.close();
      await delay(20);
    }
  }, 20000);

  it("accepts E2EE_CAPS with weak caps when compatibility mode is enabled", async () => {
    const { proc, port } = await startCallsWs({
      CALLS_REQUIRE_SFRAME_CAPS: "0",
      CALLS_REQUIRE_DOUBLE_RATCHET_CAPS: "0",
    });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`);
    try {
      await authAndGetAck(ws);

      const capsMsgId = sendFrame(
        ws,
        "E2EE_CAPS",
        {
          insertableStreams: false,
          sframe: false,
        },
        3,
      );
      const capsAck = await waitForAck(ws, capsMsgId);

      expect(capsAck.ack?.ok).toBe(true);
    } finally {
      ws.close();
      await delay(20);
    }
  }, 20000);
});

describe("calls-ws secure transport policy", () => {
  it("rejects insecure connection in production-like mode when secure transport is required", async () => {
    const { proc, port } = await startCallsWs({
      NODE_ENV: "production",
      CALLS_DEV_INSECURE_AUTH: "0",
      CALLS_WS_REQUIRE_SECURE_TRANSPORT: "1",
      CALLS_WS_TRUSTED_PROXIES: "127.0.0.1",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "example-anon-key",
      CALLS_JOIN_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
    });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`);
    const closed = await waitForClose(ws);
    expect(closed.code).toBe(4003);
    expect(closed.reason).toBe("SECURE_TRANSPORT_REQUIRED");
  }, 20000);

  it("allows trusted proxy upgrade with x-forwarded-proto=https in production-like mode", async () => {
    const { proc, port } = await startCallsWs({
      NODE_ENV: "production",
      CALLS_DEV_INSECURE_AUTH: "0",
      CALLS_WS_REQUIRE_SECURE_TRANSPORT: "1",
      CALLS_WS_TRUSTED_PROXIES: "127.0.0.1",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "example-anon-key",
      CALLS_JOIN_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
    });
    runningServers.push(proc);

    const ws = await connectWs(`ws://127.0.0.1:${port}`, {
      "x-forwarded-proto": "https",
    });

    try {
      const helloMsgId = sendFrame(ws, "HELLO", { client: { deviceId: "proxy-secure-device" } }, 1);
      const helloAck = await waitForAck(ws, helloMsgId);
      expect(helloAck.ack?.ok).toBe(true);
    } finally {
      ws.close();
      await delay(20);
    }
  }, 20000);
});
