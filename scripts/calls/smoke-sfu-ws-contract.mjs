import crypto from "node:crypto";
import process from "node:process";
import WebSocket from "ws";

const DEFAULT_ENDPOINTS = [
  "wss://sfu-ru.mansoni.ru/ws",
  "wss://sfu-tr.mansoni.ru/ws",
  "wss://sfu-ae.mansoni.ru/ws",
];

const AUTH_TIMEOUT_MS = Number(process.env.CALLS_SMOKE_AUTH_TIMEOUT_MS ?? "7000");
const STEP_TIMEOUT_MS = Number(process.env.CALLS_SMOKE_STEP_TIMEOUT_MS ?? "9000");
const accessToken = String(process.env.CALLS_SMOKE_ACCESS_TOKEN ?? "").trim();

if (!accessToken) {
  console.error("[smoke-sfu] Missing CALLS_SMOKE_ACCESS_TOKEN");
  process.exit(2);
}

function parseEndpoints() {
  const fromArg = process.argv.find((arg) => arg.startsWith("--endpoints="));
  const raw = fromArg ? fromArg.slice("--endpoints=".length) : "";
  const list = (raw || process.env.CALLS_SMOKE_ENDPOINTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ENDPOINTS;
}

function createFrameSender(ws) {
  let seq = 1;
  return (type, payload = {}) => {
    const msgId = crypto.randomUUID();
    const frame = {
      v: 1,
      type,
      msgId,
      ts: Date.now(),
      seq: seq++,
      payload,
    };
    ws.send(JSON.stringify(frame));
    return msgId;
  };
}

function ensureFrameBuffer(ws) {
  if (Array.isArray(ws.__callsSmokeFrames)) return ws.__callsSmokeFrames;
  const frames = [];
  ws.__callsSmokeFrames = frames;
  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(String(raw));
      frames.push(parsed);
      if (frames.length > 200) frames.shift();
    } catch {
      // Ignore malformed frames in smoke harness.
    }
  });
  return frames;
}

function waitForFrame(ws, predicate, timeoutMs) {
  const bufferedFrames = ensureFrameBuffer(ws);
  const bufferedMatch = bufferedFrames.find(predicate);
  if (bufferedMatch) {
    return Promise.resolve(bufferedMatch);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw) => {
      let parsed;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!predicate(parsed)) return;
      cleanup();
      resolve(parsed);
    };

    const onClose = (code, reason) => {
      cleanup();
      reject(new Error(`socket closed before expected frame (code=${code}, reason=${String(reason)})`));
    };

    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

async function expectAckOk(ws, ackOfMsgId, timeoutMs) {
  const ack = await waitForFrame(
    ws,
    (frame) => frame?.type === "ACK" && frame?.ack?.ackOfMsgId === ackOfMsgId,
    timeoutMs,
  );

  if (!ack?.ack?.ok) {
    const code = ack?.ack?.error?.code ?? "ACK_FAILED";
    const message = ack?.ack?.error?.message ?? "Unknown ACK failure";
    throw new Error(`${code}: ${message}`);
  }

  return ack;
}

function isNonEmptyCapabilities(caps) {
  if (!caps || typeof caps !== "object") return false;
  const codecs = Array.isArray(caps.codecs) ? caps.codecs : [];
  return codecs.length > 0;
}

async function runEndpointSmoke(endpoint) {
  const startedAt = Date.now();
  const ws = new WebSocket(endpoint);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`connect timeout after ${AUTH_TIMEOUT_MS}ms`)), AUTH_TIMEOUT_MS);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  ensureFrameBuffer(ws);
  const send = createFrameSender(ws);
  const deviceId = `smoke_${crypto.randomUUID().slice(0, 8)}`;

  const helloMsgId = send("HELLO", {
    client: {
      deviceId,
      platform: "smoke",
    },
  });
  await expectAckOk(ws, helloMsgId, STEP_TIMEOUT_MS);
  await waitForFrame(
    ws,
    (frame) => frame?.type === "WELCOME",
    STEP_TIMEOUT_MS,
  );

  const authMsgId = send("AUTH", {
    accessToken,
    client: { deviceId },
  });
  await expectAckOk(ws, authMsgId, STEP_TIMEOUT_MS);

  const e2eeCapsMsgId = send("E2EE_CAPS", {
    insertableStreams: true,
    sframe: true,
  });
  await expectAckOk(ws, e2eeCapsMsgId, STEP_TIMEOUT_MS);

  const createMsgId = send("ROOM_CREATE", {
    preferredRegion: "ru",
    allowedUserIds: [],
  });
  await expectAckOk(ws, createMsgId, STEP_TIMEOUT_MS);

  const roomCreated = await waitForFrame(
    ws,
    (frame) => frame?.type === "ROOM_CREATED" && typeof frame?.payload?.roomId === "string",
    STEP_TIMEOUT_MS,
  );

  const roomId = roomCreated.payload.roomId;
  const callId = roomCreated.payload.callId;

  let joinToken;
  try {
    const secret = await waitForFrame(
      ws,
      (frame) => frame?.type === "ROOM_JOIN_SECRET" && frame?.payload?.roomId === roomId,
      1500,
    );
    joinToken = secret?.payload?.joinToken;
  } catch {
    joinToken = undefined;
  }

  const joinMsgId = send("ROOM_JOIN", {
    roomId,
    callId,
    deviceId,
    ...(joinToken ? { joinToken } : {}),
  });
  await expectAckOk(ws, joinMsgId, STEP_TIMEOUT_MS);

  const joined = await waitForFrame(
    ws,
    (frame) => frame?.type === "ROOM_JOIN_OK" && frame?.payload?.roomId === roomId,
    STEP_TIMEOUT_MS,
  );

  const epoch = Number(joined?.payload?.epoch ?? 0);
  const e2eeReadyMsgId = send("E2EE_READY", {
    roomId,
    epoch,
  });
  await expectAckOk(ws, e2eeReadyMsgId, STEP_TIMEOUT_MS);

  const caps = joined?.payload?.mediasoup?.routerRtpCapabilities;
  const hasCaps = isNonEmptyCapabilities(caps);

  const transportCreateMsgId = send("TRANSPORT_CREATE", {
    roomId,
    direction: "send",
  });

  await expectAckOk(ws, transportCreateMsgId, STEP_TIMEOUT_MS);

  let transportCreated = null;
  try {
    transportCreated = await waitForFrame(
      ws,
      (frame) =>
        frame?.type === "TRANSPORT_CREATED" &&
        frame?.payload?.roomId === roomId &&
        frame?.payload?.direction === "send",
      STEP_TIMEOUT_MS,
    );
  } catch {
    transportCreated = null;
  }

  ws.close(1000, "smoke done");

  return {
    endpoint,
    ok: hasCaps && !!transportCreated,
    hasCaps,
    hasTransportCreated: !!transportCreated,
    transportId: transportCreated?.payload?.transportId ?? null,
    roomId,
    callId,
    durationMs: Date.now() - startedAt,
  };
}

async function main() {
  const endpoints = parseEndpoints();
  const results = [];

  for (const endpoint of endpoints) {
    try {
      const result = await runEndpointSmoke(endpoint);
      results.push({ ...result, error: null });
      console.log(`[smoke-sfu] ${endpoint} => ok=${result.ok} caps=${result.hasCaps} transport=${result.hasTransportCreated}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        endpoint,
        ok: false,
        hasCaps: false,
        hasTransportCreated: false,
        transportId: null,
        roomId: null,
        callId: null,
        durationMs: null,
        error: message,
      });
      console.log(`[smoke-sfu] ${endpoint} => ok=false error=${message}`);
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n[smoke-sfu] Summary");
  console.log(JSON.stringify(results, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke-sfu] Fatal:", err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
