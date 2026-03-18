import crypto from "node:crypto";
import process from "node:process";
import WebSocket from "ws";

const DEFAULT_ENDPOINTS = [
  "wss://sfu-ru.mansoni.ru/ws",
  "wss://sfu-tr.mansoni.ru/ws",
  "wss://sfu-ae.mansoni.ru/ws",
];

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const STEP_TIMEOUT_MS = Number(process.env.CALLS_SMOKE_STEP_TIMEOUT_MS || "12000");

function parseEndpoints() {
  const raw = String(process.env.CALLS_SMOKE_ENDPOINTS || "").trim();
  if (!raw) return DEFAULT_ENDPOINTS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

async function createTempUserToken() {
  const email = `sfu.probe.${Date.now()}@example.com`;
  const password = `Probe!${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => "");
    throw new Error(`create user failed: ${createResp.status} ${text}`);
  }

  const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text().catch(() => "");
    throw new Error(`token issue failed: ${tokenResp.status} ${text}`);
  }

  const payload = await tokenResp.json();
  const accessToken = String(payload?.access_token || "");
  if (!accessToken) {
    throw new Error("token issue failed: missing access_token");
  }

  return { email, accessToken };
}

function makeClient(endpoint, name) {
  const ws = new WebSocket(endpoint);
  const st = { ws, name, seq: 1, frames: [], waiters: [], closeInfo: null };

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(String(raw));
    } catch {
      return;
    }
    st.frames.push(frame);
    for (const waiter of [...st.waiters]) {
      if (!waiter.p(frame)) continue;
      clearTimeout(waiter.t);
      st.waiters = st.waiters.filter((x) => x !== waiter);
      waiter.r(frame);
    }
  });

  ws.on("close", (code, reasonBuf) => {
    const reason = typeof reasonBuf?.toString === "function" ? reasonBuf.toString() : "";
    st.closeInfo = { code, reason };
    for (const waiter of [...st.waiters]) {
      clearTimeout(waiter.t);
      waiter.j(new Error(`${name} socket closed code=${code} reason=${reason || "-"}`));
    }
    st.waiters = [];
  });

  return st;
}

function waitOpen(client, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${client.name} open timeout`)), timeoutMs);
    client.ws.once("open", () => {
      clearTimeout(t);
      resolve();
    });
    client.ws.once("error", (e) => {
      clearTimeout(t);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

function waitFor(client, predicate, timeoutMs = STEP_TIMEOUT_MS) {
  for (const f of client.frames) {
    if (predicate(f)) return Promise.resolve(f);
  }

  return new Promise((resolve, reject) => {
    const waiter = {
      p: predicate,
      r: resolve,
      j: reject,
      t: setTimeout(() => {
        client.waiters = client.waiters.filter((w) => w !== waiter);
        reject(new Error(`${client.name} timeout ${timeoutMs}ms`));
      }, timeoutMs),
    };
    client.waiters.push(waiter);
  });
}

function send(client, type, payload = {}) {
  const msgId = crypto.randomUUID();
  client.ws.send(JSON.stringify({ v: 1, type, msgId, ts: Date.now(), seq: client.seq++, payload }));
  return msgId;
}

async function sendAndAck(client, type, payload = {}, timeoutMs = STEP_TIMEOUT_MS) {
  const msgId = send(client, type, payload);
  const ack = await waitFor(client, (f) => f?.type === "ACK" && f?.ack?.ackOfMsgId === msgId, timeoutMs);
  if (!ack?.ack?.ok) {
    const code = ack?.ack?.error?.code || "ACK_FAILED";
    const message = ack?.ack?.error?.message || "Unknown ACK failure";
    throw new Error(`${client.name} ${type} failed: ${code} ${message}`);
  }
  return ack;
}

function hasCaps(caps) {
  return !!caps && Array.isArray(caps.codecs) && caps.codecs.length > 0;
}

async function probeEndpoint(endpoint, tokenA, tokenB) {
  const stage = {};
  const startedAt = Date.now();

  const A = makeClient(endpoint, "A");
  const B = makeClient(endpoint, "B");

  try {
    let t = Date.now();
    await Promise.all([waitOpen(A), waitOpen(B)]);
    stage.connectMs = Date.now() - t;

    const devA = `probe_a_${crypto.randomUUID().slice(0, 8)}`;
    const devB = `probe_b_${crypto.randomUUID().slice(0, 8)}`;

    t = Date.now();
    await Promise.all([
      sendAndAck(A, "HELLO", { client: { deviceId: devA, platform: "probe" } }),
      sendAndAck(B, "HELLO", { client: { deviceId: devB, platform: "probe" } }),
    ]);
    await Promise.all([
      waitFor(A, (f) => f?.type === "WELCOME"),
      waitFor(B, (f) => f?.type === "WELCOME"),
    ]);
    stage.helloMs = Date.now() - t;

    t = Date.now();
    await Promise.all([
      sendAndAck(A, "AUTH", { accessToken: tokenA }),
      sendAndAck(B, "AUTH", { accessToken: tokenB }),
    ]);
    const authA = await waitFor(A, (f) => f?.type === "AUTH_OK", STEP_TIMEOUT_MS);
    const authB = await waitFor(B, (f) => f?.type === "AUTH_OK", STEP_TIMEOUT_MS);
    stage.authMs = Date.now() - t;

    t = Date.now();
    await Promise.all([
      sendAndAck(A, "E2EE_CAPS", { insertableStreams: true, sframe: false }),
      sendAndAck(B, "E2EE_CAPS", { insertableStreams: true, sframe: false }),
    ]);
    stage.e2eeCapsMs = Date.now() - t;

    t = Date.now();
    await sendAndAck(A, "ROOM_CREATE", {
      preferredRegion: "tr",
      allowedUserIds: [authA?.payload?.userId, authB?.payload?.userId].filter(Boolean),
    });
    const created = await waitFor(A, (f) => f?.type === "ROOM_CREATED" && typeof f?.payload?.roomId === "string", STEP_TIMEOUT_MS);
    const roomId = created.payload.roomId;
    const callId = created.payload.callId;

    let joinToken;
    try {
      const secret = await waitFor(A, (f) => f?.type === "ROOM_JOIN_SECRET" && f?.payload?.roomId === roomId, 2500);
      joinToken = secret?.payload?.joinToken;
    } catch {
      joinToken = undefined;
    }
    stage.roomCreateMs = Date.now() - t;

    t = Date.now();
    await Promise.all([
      sendAndAck(A, "ROOM_JOIN", { roomId, callId, deviceId: devA, ...(joinToken ? { joinToken } : {}) }),
      sendAndAck(B, "ROOM_JOIN", { roomId, callId, deviceId: devB, ...(joinToken ? { joinToken } : {}) }),
    ]);

    const joinOkA = await waitFor(A, (f) => f?.type === "ROOM_JOIN_OK" && f?.payload?.roomId === roomId, STEP_TIMEOUT_MS);
    const joinOkB = await waitFor(B, (f) => f?.type === "ROOM_JOIN_OK" && f?.payload?.roomId === roomId, STEP_TIMEOUT_MS);
    const capsA = joinOkA?.payload?.mediasoup?.routerRtpCapabilities || joinOkA?.payload?.routerRtpCapabilities;
    const capsB = joinOkB?.payload?.mediasoup?.routerRtpCapabilities || joinOkB?.payload?.routerRtpCapabilities;
    const epoch = Number(joinOkA?.payload?.epoch ?? 0);

    await Promise.all([
      sendAndAck(A, "E2EE_READY", { roomId, epoch }),
      sendAndAck(B, "E2EE_READY", { roomId, epoch }),
    ]);

    let getRouterSupported = true;
    let getRouterCapsOk = false;
    try {
      await sendAndAck(B, "GET_ROUTER_RTP_CAPABILITIES", { roomId });
      const capsFrame = await waitFor(B, (f) => f?.type === "ROUTER_RTP_CAPABILITIES" && f?.payload?.roomId === roomId, STEP_TIMEOUT_MS);
      getRouterCapsOk = hasCaps(capsFrame?.payload?.routerRtpCapabilities);
    } catch {
      getRouterSupported = false;
      getRouterCapsOk = false;
    }

    stage.roomJoinMs = Date.now() - t;

    t = Date.now();
    await Promise.all([
      sendAndAck(A, "TRANSPORT_CREATE", { roomId, direction: "send" }),
      sendAndAck(A, "TRANSPORT_CREATE", { roomId, direction: "recv" }),
      sendAndAck(B, "TRANSPORT_CREATE", { roomId, direction: "send" }),
      sendAndAck(B, "TRANSPORT_CREATE", { roomId, direction: "recv" }),
    ]);

    await Promise.all([
      waitFor(A, (f) => f?.type === "TRANSPORT_CREATED" && f?.payload?.roomId === roomId && f?.payload?.direction === "send"),
      waitFor(A, (f) => f?.type === "TRANSPORT_CREATED" && f?.payload?.roomId === roomId && f?.payload?.direction === "recv"),
      waitFor(B, (f) => f?.type === "TRANSPORT_CREATED" && f?.payload?.roomId === roomId && f?.payload?.direction === "send"),
      waitFor(B, (f) => f?.type === "TRANSPORT_CREATED" && f?.payload?.roomId === roomId && f?.payload?.direction === "recv"),
    ]);
    stage.transportMs = Date.now() - t;

    try { await Promise.all([sendAndAck(A, "ROOM_LEAVE", { roomId }), sendAndAck(B, "ROOM_LEAVE", { roomId })]); } catch {}
    A.ws.close(1000, "done");
    B.ws.close(1000, "done");

    return {
      endpoint,
      ok: hasCaps(capsA) && hasCaps(capsB) && getRouterSupported && getRouterCapsOk,
      stage,
      checks: {
        joinCapsA: hasCaps(capsA),
        joinCapsB: hasCaps(capsB),
        getRouterSupported,
        getRouterCapsOk,
      },
      totalMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    try { A.ws.close(1000, "done"); } catch {}
    try { B.ws.close(1000, "done"); } catch {}
    return {
      endpoint,
      ok: false,
      stage,
      checks: {
        joinCapsA: false,
        joinCapsB: false,
        getRouterSupported: false,
        getRouterCapsOk: false,
      },
      close: {
        A: A.closeInfo,
        B: B.closeInfo,
      },
      totalMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeEndpointWithRetry(endpoint, tokenA, tokenB, maxAttempts = 2) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await probeEndpoint(endpoint, tokenA, tokenB);
    if (result.ok) return { ...result, attempt };
    last = { ...result, attempt };
    const errText = String(result.error || "").toLowerCase();
    const isTransientSocketClose = errText.includes("socket closed") || errText.includes("open timeout");
    if (!isTransientSocketClose || attempt >= maxAttempts) {
      return last;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

async function main() {
  requireEnv();
  const endpoints = parseEndpoints();
  const a = await createTempUserToken();
  const b = await createTempUserToken();

  console.log(`[sfu-ready] temp users: A=${a.email} B=${b.email}`);
  const results = [];
  for (const endpoint of endpoints) {
    const res = await probeEndpointWithRetry(endpoint, a.accessToken, b.accessToken);
    results.push(res);
    console.log(`[sfu-ready] ${endpoint} ok=${res.ok} attempt=${res.attempt || 1} totalMs=${res.totalMs} error=${res.error || "-"}`);
  }

  console.log("\n[sfu-ready] summary");
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[sfu-ready] fatal", err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
