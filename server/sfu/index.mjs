import http from "node:http";
import crypto from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { createMediaPlaneController } from "./mediaPlane.mjs";

const PORT = Number(process.env.SFU_PORT ?? "8888");
const REGION = process.env.SFU_REGION ?? "tr";
const NODE_ID = process.env.SFU_NODE_ID ?? "local-sfu-1";
const E2EE_REQUIRED_DEFAULT = (() => {
  const raw = String(process.env.SFU_E2EE_REQUIRED ?? process.env.E2EE_REQUIRED_DEFAULT ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
})();
const HEARTBEAT_SEC = Math.max(5, Number(process.env.SFU_HEARTBEAT_SEC ?? "10"));
const IS_PROD = process.env.NODE_ENV === "production";
const CALLS_DEV_INSECURE_AUTH = !IS_PROD && process.env.CALLS_DEV_INSECURE_AUTH === "1";
const REQUIRE_MEDIASOUP_IN_PROD = IS_PROD && process.env.SFU_REQUIRE_MEDIASOUP !== "0";
const requireSFrame = (() => {
  const raw = String(process.env.SFU_REQUIRE_SFRAME ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return IS_PROD;
})();
const requireDoubleRatchet = (() => {
  const raw = String(process.env.SFU_REQUIRE_DOUBLE_RATCHET ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return IS_PROD;
})();
const REQUIRE_SECURE_WS = IS_PROD && process.env.SFU_REQUIRE_SECURE_WS !== "0";
const TRUSTED_PROXIES = new Set(
  (process.env.SFU_TRUSTED_PROXIES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_AUTH_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const STARTED_AT = Date.now();
const MAX_PARTICIPANTS_PER_ROOM = (() => {
  const raw = Number(process.env.CALLS_MAX_PARTICIPANTS_PER_ROOM ?? "50");
  return Number.isFinite(raw) && raw >= 2 ? Math.floor(raw) : 50;
})();

/**
 * E2EE rate limiting — per-process sliding window.
 *
 * LIMITATION: This rate limiter is process-local (in-memory Map).
 * In multi-instance SFU deployments behind a load balancer, an attacker
 * can bypass the limit by distributing requests across instances.
 *
 * TODO(production): Replace with Redis-backed rate limiter when multiple
 * SFU instances are deployed. See server/calls-ws/index.mjs `isJoinTokenUsed()`
 * for a Redis pattern that can be adapted here.
 */
const e2eeRateLimits = new Map(); // deviceId -> { keyPackages, rekeys, lastReset }
const E2EE_RATE_WINDOW = 60000; // 1 minute
const E2EE_MAX_KEY_PACKAGES = 50;
const E2EE_MAX_REKEYS = 5;
// SECURITY FIX: Cap Map size to prevent OOM under device-ID flooding.
// Without this bound an attacker can open many WebSocket connections with unique
// deviceIds to grow the Map without limit before the 2-minute cleanup fires.
// Past this threshold new (unseen) devices are rate-limited hard — existing entries
// continue operating normally.
const E2EE_RATE_LIMIT_MAX_ENTRIES = 200_000;

function checkE2EERateLimit(deviceId, operation) {
  const now = Date.now();
  let entry = e2eeRateLimits.get(deviceId);
  if (!entry || now - entry.lastReset > E2EE_RATE_WINDOW) {
    if (!entry && e2eeRateLimits.size >= E2EE_RATE_LIMIT_MAX_ENTRIES) {
      // Map is full — reject new device to prevent OOM. Existing devices unaffected.
      console.warn(`[E2EE] e2eeRateLimits at capacity (${E2EE_RATE_LIMIT_MAX_ENTRIES}), rejecting new deviceId`);
      return false;
    }
    entry = { keyPackages: 0, rekeys: 0, lastReset: now };
    e2eeRateLimits.set(deviceId, entry);
  }
  if (operation === "KEY_PACKAGE") {
    entry.keyPackages++;
    return entry.keyPackages <= E2EE_MAX_KEY_PACKAGES;
  }
  if (operation === "REKEY_BEGIN") {
    entry.rekeys++;
    return entry.rekeys <= E2EE_MAX_REKEYS;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of e2eeRateLimits) {
    if (now - v.lastReset > E2EE_RATE_WINDOW * 2) e2eeRateLimits.delete(k);
  }
}, E2EE_RATE_WINDOW * 2).unref?.();

if (IS_PROD && !CALLS_DEV_INSECURE_AUTH && (!SUPABASE_URL || !SUPABASE_AUTH_KEY)) {
  throw new Error("[sfu] hard auth requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY in production");
}

const supabaseAuthClient = SUPABASE_URL && SUPABASE_AUTH_KEY
  ? createClient(SUPABASE_URL, SUPABASE_AUTH_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const authCache = new Map();
const AUTH_CACHE_TTL_MS = 15_000;

async function verifyAccessToken(accessToken) {
  if (CALLS_DEV_INSECURE_AUTH) {
    return { userId: `dev_${String(accessToken ?? "anon").slice(0, 20)}` };
  }

  if (typeof accessToken !== "string" || accessToken.length < 20) {
    return null;
  }

  const now = Date.now();
  const cached = authCache.get(accessToken);
  if (cached && cached.exp > now) {
    return { userId: cached.userId };
  }

  if (!supabaseAuthClient) {
    return null;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return null;
  }

  const userId = data.user.id;
  authCache.set(accessToken, { userId, exp: now + AUTH_CACHE_TTL_MS });
  if (authCache.size > 2000) {
    const keys = Array.from(authCache.keys());
    for (let i = 0; i < 500; i++) authCache.delete(keys[i]);
  }

  return { userId };
}

// Периодическая очистка authCache от expired entries (каждые 30 секунд)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCache) {
    if (v.exp <= now) authCache.delete(k);
  }
}, 30_000).unref();

// ── joinToken verification (shared secret with calls-ws) ──────────────
let cachedJoinTokenSecret = null;
const CALLS_JOIN_TOKEN_SKIP = !IS_PROD && process.env.CALLS_JOIN_TOKEN_SKIP === "1";

function getJoinTokenSecret() {
  if (cachedJoinTokenSecret) return cachedJoinTokenSecret;
  const explicit = process.env.CALLS_JOIN_TOKEN_SECRET;
  if (explicit && explicit.length >= 32) {
    cachedJoinTokenSecret = explicit;
    return cachedJoinTokenSecret;
  }
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret && jwtSecret.length >= 32) {
    console.warn("[sfu] Missing CALLS_JOIN_TOKEN_SECRET, using SUPABASE_JWT_SECRET fallback");
    cachedJoinTokenSecret = jwtSecret;
    return cachedJoinTokenSecret;
  }
  if (IS_PROD) {
    const emergency = crypto.randomBytes(48).toString("base64url");
    console.error("[sfu] CRITICAL: no join-token secret in production; using ephemeral secret");
    cachedJoinTokenSecret = emergency;
    return cachedJoinTokenSecret;
  }
  cachedJoinTokenSecret = "dev-only-join-token-secret";
  return cachedJoinTokenSecret;
}

function verifyJoinToken(joinToken, expectedRoomId) {
  if (CALLS_JOIN_TOKEN_SKIP) return { skipped: true };
  if (typeof joinToken !== "string") return null;
  const dotIdx = joinToken.indexOf(".");
  if (dotIdx < 1) return null;
  const encodedPayload = joinToken.slice(0, dotIdx);
  const sig = joinToken.slice(dotIdx + 1);
  if (!encodedPayload || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getJoinTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) return null;

  try {
    const raw = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (raw.length % 4)) % 4;
    const payload = JSON.parse(Buffer.from(raw + "=".repeat(padLen), "base64").toString("utf8"));
    const expMs = Number(payload?.exp ?? 0) * 1000;
    if (!expMs || expMs <= Date.now()) return null;
    if (typeof payload?.roomId !== "string") return null;
    if (expectedRoomId && payload.roomId !== expectedRoomId) return null;
    return payload;
  } catch {
    return null;
  }
}

function isObject(value) {
  return !!value && typeof value === "object";
}

function hasNonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isSecureUpgradeRequest(req) {
  if (req?.socket?.encrypted === true) return true;

  const xForwardedProto = req?.headers?.["x-forwarded-proto"];
  if (!xForwardedProto) return false;

  const remoteAddress = (req?.socket?.remoteAddress ?? "").replace(/^::ffff:/i, "");
  if (TRUSTED_PROXIES.size > 0 && !TRUSTED_PROXIES.has(remoteAddress)) {
    return false;
  }

  const proto = String(Array.isArray(xForwardedProto) ? xForwardedProto[0] : xForwardedProto)
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https" || proto === "wss";
}

function validateDtlsParameters(dtlsParameters) {
  if (!hasNonEmptyObject(dtlsParameters)) return false;
  if (!hasNonEmptyArray(dtlsParameters.fingerprints)) return false;
  return true;
}

function validateRtpParameters(rtpParameters) {
  if (!hasNonEmptyObject(rtpParameters)) return false;
  const hasCodecs = hasNonEmptyArray(rtpParameters.codecs);
  const hasEncodings = hasNonEmptyArray(rtpParameters.encodings);
  return hasCodecs || hasEncodings;
}

function validateRtpCapabilities(rtpCapabilities) {
  if (!hasNonEmptyObject(rtpCapabilities)) return false;
  return hasNonEmptyArray(rtpCapabilities.codecs);
}

const mediaPlane = await createMediaPlaneController({ requireMediasoup: REQUIRE_MEDIASOUP_IN_PROD });
if (REQUIRE_MEDIASOUP_IN_PROD && mediaPlane.mode !== "mediasoup") {
  throw new Error("[sfu] production fail-closed: mediasoup mode is required");
}

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

function wsError(code, message, details = {}, retryable = false) {
  return { code, message, details, retryable };
}

function send(ws, frame) {
  ws.send(JSON.stringify(frame));
}

function ack(ws, ackOfMsgId, ok = true, error) {
  send(ws, {
    v: 1,
    type: "ACK",
    msgId: uuid(),
    ts: nowMs(),
    ack: { ackOfMsgId, ok, error },
    payload: {},
  });
}

const rooms = new Map();
const peersByDevice = new Map();

function ensureRoom(roomId, callId, preferredRegion = REGION) {
  let room = rooms.get(roomId);
  if (room) return room;

  room = {
    roomId,
    callId,
    region: preferredRegion,
    nodeId: NODE_ID,
    roomVersion: 0,
    epoch: 0,
    memberSetVersion: 0,
    peers: new Map(),
    producers: new Map(),
    routerRtpCapabilities: { codecs: [] },
  };
  rooms.set(roomId, room);
  return room;
}

function bumpRoomVersion(room) {
  room.roomVersion = Number(room.roomVersion ?? 0) + 1;
}

function makeSnapshot(room) {
  return {
    roomId: room.roomId,
    callId: room.callId,
    region: room.region,
    nodeId: room.nodeId,
    roomVersion: Number(room.roomVersion ?? 0),
    epoch: room.epoch,
    memberSetVersion: room.memberSetVersion,
    serverTime: nowMs(),
    peers: Array.from(room.peers.values()).map((p) => ({
      userId: p.userId,
      deviceId: p.deviceId,
      role: "member",
      state: "joined",
      e2eeReady: !!p.e2eeReady,
    })),
    producers: Array.from(room.producers.values()),
    e2ee: {
      required: E2EE_REQUIRED_DEFAULT,
      epoch: room.epoch,
      leaderDeviceId: Array.from(room.peers.keys())[0] ?? "",
      expectedSenderDevices: Array.from(room.peers.keys()),
      missingSenderKeys: [],
    },
  };
}

function broadcastRoom(room, frame, exceptDeviceId = null) {
  for (const [deviceId, peer] of room.peers.entries()) {
    if (exceptDeviceId && deviceId === exceptDeviceId) continue;
    if (!peer.ws || peer.ws.readyState !== WebSocket.OPEN) continue;
    send(peer.ws, frame);
  }
}

function sendToDevice(room, deviceId, frame) {
  const peer = room?.peers?.get(deviceId);
  if (!peer?.ws || peer.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  send(peer.ws, frame);
  return true;
}

function isLikelyBase64(value, minLength = 16) {
  if (typeof value !== "string" || value.length < minLength) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

function isPeerE2EEReadyForEpoch(room, peerDeviceId) {
  if (!E2EE_REQUIRED_DEFAULT) return true;
  const peer = room?.peers?.get(peerDeviceId);
  if (!peer) return false;
  return peer.e2eeReady === true && peer.e2eeEpoch === room.epoch;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz" || req.url === "/ready") {
    const roomCount = rooms.size;
    const peerCount = peersByDevice.size;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        region: REGION,
        nodeId: NODE_ID,
        wsReady: true,
        rooms: roomCount,
        peers: peerCount,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        failoverHints: {
          healthy: true,
          preferredRegion: REGION,
        },
      })
    );
    return;
  }

  if (req.url === "/metrics") {
    const peers = Array.from(rooms.values()).reduce((acc, room) => acc + room.peers.size, 0);
    const producers = Array.from(rooms.values()).reduce((acc, room) => acc + room.producers.size, 0);
    const mediaPlaneMetrics = mediaPlane.metrics();
    const roomsByRegion = Array.from(rooms.values()).reduce((acc, room) => {
      acc[room.region] = (acc[room.region] ?? 0) + 1;
      return acc;
    }, {});
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        nodeId: NODE_ID,
        region: REGION,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        rooms: rooms.size,
        peers,
        producers,
        mediaPlane: mediaPlaneMetrics,
        roomsByRegion,
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  if (REQUIRE_SECURE_WS && !isSecureUpgradeRequest(req)) {
    ws.close(4003, "SECURE_TRANSPORT_REQUIRED");
    return;
  }

  const conn = {
    authenticated: false,
    userId: null,
    deviceId: null,
    roomId: null,
    expectedSeq: 1,
    lastSeq: 0,
    seenMsgIds: new Set(),
    seenMsgIdQueue: [],
    e2eeCaps: null,
  };

  ws.on("message", async (raw) => {
    let frame = null;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!frame || frame.v !== 1 || typeof frame.type !== "string" || typeof frame.msgId !== "string" || typeof frame.ts !== "number") {
      ack(ws, frame?.msgId ?? uuid(), false, wsError("VALIDATION_FAILED", "Invalid envelope"));
      return;
    }

    if (frame.ack) return;

    if (!Number.isInteger(frame.seq) || frame.seq <= 0) {
      ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing or invalid seq", {}, false));
      return;
    }

    if (conn.seenMsgIds.has(frame.msgId)) {
      ack(ws, frame.msgId, true);
      return;
    }

    if (frame.seq <= conn.lastSeq) {
      ack(ws, frame.msgId, false, wsError("REPLAY_DETECTED", "Non-monotonic seq rejected", {}, false));
      return;
    }

    conn.lastSeq = frame.seq;
    conn.seenMsgIds.add(frame.msgId);
    conn.seenMsgIdQueue.push(frame.msgId);
    if (conn.seenMsgIdQueue.length > 4000) {
      const stale = conn.seenMsgIdQueue.shift();
      if (stale) conn.seenMsgIds.delete(stale);
    }

    const ensureAuth = () => {
      if (conn.authenticated) return true;
      ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
      return false;
    };

    try {
      switch (frame.type) {
      case "HELLO": {
        conn.deviceId = frame.payload?.client?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 8)}`;
        send(ws, {
          v: 1,
          type: "WELCOME",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            serverTime: nowMs(),
            heartbeatSec: HEARTBEAT_SEC,
            resumeToken: uuid(),
            features: {
              wsSeqRequired: true,
              e2eeRequiredDefault: E2EE_REQUIRED_DEFAULT,
              sframeRequired: requireSFrame,
              sfuEnabled: true,
            },
          },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "AUTH": {
        const accessToken = frame.payload?.accessToken;
        const verified = await verifyAccessToken(accessToken);
        if (!verified) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Invalid accessToken", {}, false));
          return;
        }

        conn.authenticated = true;
        conn.userId = verified.userId;
        if (!conn.deviceId) conn.deviceId = `dev_${uuid().slice(0, 8)}`;
        peersByDevice.set(conn.deviceId, ws);

        send(ws, {
          v: 1,
          type: "AUTH_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { userId: conn.userId, deviceId: conn.deviceId },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_CAPS": {
        if (!ensureAuth()) return;
        const insertableStreams = frame.payload?.insertableStreams === true;
        const sframe = frame.payload?.sframe === true;
        const doubleRatchet =
          frame.payload?.doubleRatchet === true ||
          (Array.isArray(frame.payload?.supportedCipherSuites) &&
            frame.payload.supportedCipherSuites.some((suite) =>
              suite === "DOUBLE_RATCHET_P256_AES128GCM" || suite === "DR_P256_HKDF_SHA256_AES128GCM"
            ));
        conn.e2eeCaps = { insertableStreams, sframe, doubleRatchet };

        if (E2EE_REQUIRED_DEFAULT && !insertableStreams) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Insertable Streams capability is required", {}, false));
          return;
        }
        if (requireSFrame && (!insertableStreams || !sframe)) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame + Insertable Streams capabilities are required", {
            insertableStreams,
            sframe,
          }, false));
          return;
        }
        if (requireDoubleRatchet && !doubleRatchet) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Double Ratchet capability is required", {
            doubleRatchet,
          }, false));
          return;
        }

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_CREATE": {
        if (!ensureAuth()) return;
        // S2: joinToken verification for ROOM_CREATE too
        const createTokenPayload = verifyJoinToken(frame.payload?.joinToken);
        if (!createTokenPayload) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid or missing joinToken for ROOM_CREATE", {}, false));
          return;
        }
        const roomId = frame.payload?.roomId ?? createTokenPayload.roomId ?? `room_${uuid().slice(0, 8)}`;
        const callId = frame.payload?.callId ?? createTokenPayload.callId ?? `call_${uuid().slice(0, 8)}`;
        const preferredRegion = frame.payload?.preferredRegion ?? REGION;
        const room = ensureRoom(roomId, callId, preferredRegion);
        const created = await mediaPlane.createRoom(roomId);
        room.routerRtpCapabilities = created?.routerRtpCapabilities ?? { codecs: [] };

        send(ws, {
          v: 1,
          type: "ROOM_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: room.roomId, callId: room.callId, region: room.region, nodeId: room.nodeId, epoch: room.epoch, memberSetVersion: room.memberSetVersion },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_JOIN": {
        if (!ensureAuth()) return;
        if (E2EE_REQUIRED_DEFAULT && !conn.e2eeCaps?.insertableStreams) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "E2EE_CAPS with insertableStreams=true required before ROOM_JOIN", {}, false));
          return;
        }
        if (requireSFrame && (!conn.e2eeCaps?.insertableStreams || !conn.e2eeCaps?.sframe)) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame + Insertable Streams capabilities are required before joining the room", {}, false));
          return;
        }
        if (requireDoubleRatchet && !conn.e2eeCaps?.doubleRatchet) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Double Ratchet capability is required before joining the room", {}, false));
          return;
        }
        const roomId = frame.payload?.roomId;
        if (!roomId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing roomId", {}, false));
          return;
        }

        // S3/W1: joinToken verification — unified with calls-ws
        const tokenPayload = verifyJoinToken(frame.payload?.joinToken, roomId);
        if (!tokenPayload) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid or missing joinToken", { roomId }, false));
          return;
        }
        // Verify userId is in allowedUserIds (if token contains the list)
        if (Array.isArray(tokenPayload.allowedUserIds) && tokenPayload.allowedUserIds.length > 0) {
          if (!tokenPayload.allowedUserIds.includes(conn.userId)) {
            ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "User not authorized for this call", { roomId }, false));
            return;
          }
        }

        const callId = frame.payload?.callId ?? tokenPayload.callId ?? `call_${uuid().slice(0, 8)}`;
        const room = ensureRoom(roomId, callId, frame.payload?.preferredRegion ?? REGION);
        const ensured = await mediaPlane.createRoom(roomId);
        room.routerRtpCapabilities = ensured?.routerRtpCapabilities ?? room.routerRtpCapabilities;
        if (room.peers.size >= MAX_PARTICIPANTS_PER_ROOM) {
          ack(ws, frame.msgId, false, wsError("ROOM_FULL", `Max participants exceeded (${MAX_PARTICIPANTS_PER_ROOM})`, { roomId }, false));
          return;
        }
        const deviceId = frame.payload?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 8)}`;
        conn.deviceId = deviceId;
        conn.roomId = roomId;

        room.memberSetVersion += 1;
        bumpRoomVersion(room);
        room.peers.set(deviceId, {
          userId: conn.userId,
          deviceId,
          ws,
          e2eeReady: !E2EE_REQUIRED_DEFAULT,
          e2eeEpoch: E2EE_REQUIRED_DEFAULT ? -1 : room.epoch,
          transports: new Map(),
        });
        peersByDevice.set(deviceId, ws);

        send(ws, {
          v: 1,
          type: "ROOM_JOIN_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            roomId,
            callId: room.callId,
            region: room.region,
            nodeId: room.nodeId,
            epoch: room.epoch,
            memberSetVersion: room.memberSetVersion,
            mediasoup: {
              routerRtpCapabilities: room.routerRtpCapabilities,
              sendTransportOptions: { id: `send_${deviceId}`, iceParameters: {}, dtlsParameters: {} },
              recvTransportOptions: { id: `recv_${deviceId}`, iceParameters: {}, dtlsParameters: {} },
            },
            e2ee: { required: E2EE_REQUIRED_DEFAULT, epoch: room.epoch },
          },
        });

        send(ws, {
          v: 1,
          type: "E2EE_POLICY",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { required: E2EE_REQUIRED_DEFAULT, epoch: room.epoch, rekeyOnJoin: true },
        });

        send(ws, {
          v: 1,
          type: "ROOM_SNAPSHOT",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: makeSnapshot(room),
        });

        broadcastRoom(
          room,
          {
            v: 1,
            type: "PEER_JOINED",
            msgId: uuid(),
            ts: nowMs(),
            payload: { roomId, userId: conn.userId, deviceId },
          },
          deviceId
        );

        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_READY": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const epochRaw = frame.payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing or invalid epoch", {}, false));
          return;
        }
        if (epoch !== room.epoch) {
          ack(ws, frame.msgId, false, wsError("E2EE_EPOCH_MISMATCH", "E2EE readiness epoch mismatch", { expectedEpoch: room.epoch }, true));
          return;
        }

        const peer = room.peers.get(conn.deviceId);
        peer.e2eeReady = true;
        peer.e2eeEpoch = epoch;
        ack(ws, frame.msgId, true);
        return;
      }

      case "TRANSPORT_CREATE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const direction = frame.payload?.direction === "recv" ? "recv" : "send";
        const transport = await mediaPlane.createTransport(room.roomId, conn.deviceId, direction);
        const transportId = transport.id;
        room.peers.get(conn.deviceId).transports.set(transportId, { id: transportId, direction, connected: false });

        send(ws, {
          v: 1,
          type: "TRANSPORT_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            roomId: room.roomId,
            transportId,
            direction,
            iceParameters: transport.iceParameters ?? {},
            iceCandidates: transport.iceCandidates ?? [],
            dtlsParameters: transport.dtlsParameters ?? {},
          },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "TRANSPORT_CONNECT": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }
        const transportId = frame.payload?.transportId;
        const transport = room.peers.get(conn.deviceId).transports.get(transportId);
        if (!transport) {
          ack(ws, frame.msgId, false, wsError("TRANSPORT_NOT_FOUND", "Unknown transport", {}, false));
          return;
        }
        if (mediaPlane.mode === "mediasoup" && !validateDtlsParameters(frame.payload?.dtlsParameters)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "dtlsParameters must be non-empty with fingerprints", {}, false));
          return;
        }
        await mediaPlane.connectTransport(room.roomId, transportId, frame.payload?.dtlsParameters ?? {});
        transport.connected = true;
        ack(ws, frame.msgId, true);
        return;
      }

      case "PRODUCE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const kind = frame.payload?.kind === "audio" ? "audio" : "video";
        if (mediaPlane.mode === "mediasoup" && !validateRtpParameters(frame.payload?.rtpParameters)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "rtpParameters must be non-empty", {}, false));
          return;
        }
        const produced = await mediaPlane.produce(
          room.roomId,
          conn.deviceId,
          frame.payload?.transportId,
          kind,
          frame.payload?.rtpParameters ?? {},
          { peerDeviceId: conn.deviceId, userId: conn.userId }
        );
        const producerId = produced.id;
        const producer = {
          producerId,
          peerDeviceId: conn.deviceId,
          userId: conn.userId,
          kind,
          paused: false,
        };
        room.producers.set(producerId, producer);
        bumpRoomVersion(room);

        // SFrame header validation for incoming media frames
        // SECURITY FIX: SFrame enforcement — producers sending only tiny frames
        // (< 17 bytes, the minimum SFrame overhead) are blocked as they cannot
        // carry valid encrypted payloads and indicate a bypassed E2EE sender.
        if (requireSFrame) {
          if (produced.observer && typeof produced.observer.on === "function") {
            // REQUIRED: mediasoup v3 does NOT emit "trace" events unless enableTrace() is called.
            // Without this the entire SFrame enforcement block is dead code.
            if (typeof produced.enableTrace === "function") {
              produced.enableTrace(["rtp"]);
            }
            let framesChecked = 0;
            let suspiciousFrames = 0;
            const MAX_CHECK_FRAMES = 5;
            const SFRAME_CHECK_TIMEOUT = 10000;
            const checkTimer = setTimeout(() => {
              if (framesChecked === 0) {
                console.log(`[SFrame] WARN: No frames received from producer ${producerId} within ${SFRAME_CHECK_TIMEOUT}ms`);
              }
            }, SFRAME_CHECK_TIMEOUT);
            produced.observer.on("trace", (trace) => {
              if (trace.type === "rtp" && framesChecked < MAX_CHECK_FRAMES) {
                framesChecked++;
                // SECURITY FIX: Track frames too small to contain SFrame header + ciphertext
                if (trace.size !== undefined && trace.size < 17) {
                  suspiciousFrames++;
                  console.log(`[SFrame] WARN: Producer ${producerId} frame ${framesChecked} too small for SFrame (${trace.size} bytes)`);
                }
                if (framesChecked >= MAX_CHECK_FRAMES) {
                  clearTimeout(checkTimer);
                  // SECURITY FIX: If ALL sampled frames are too small, close the producer.
                  // A single outlier (e.g. RTCP SR, padding) is tolerated; unanimous failure is not.
                  if (suspiciousFrames >= MAX_CHECK_FRAMES) {
                    console.warn(`[SFrame] BLOCKING: Producer ${producerId} — ALL ${MAX_CHECK_FRAMES} frames too small for SFrame. Closing producer.`);
                    produced.close();
                  } else {
                    console.log(`[SFrame] OK: Producer ${producerId} passed ${MAX_CHECK_FRAMES} frame checks (${suspiciousFrames} suspicious)`);
                  }
                }
              }
            });
          }
        }

        send(ws, {
          v: 1,
          type: "PRODUCED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: room.roomId, producerId, kind: producer.kind },
        });

        broadcastRoom(
          room,
          {
            v: 1,
            type: "PRODUCER_ADDED",
            msgId: uuid(),
            ts: nowMs(),
            payload: { roomId: room.roomId, producerId, peerDeviceId: conn.deviceId, kind: producer.kind },
          },
          conn.deviceId
        );

        ack(ws, frame.msgId, true);
        return;
      }

      case "CONSUME": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const producerId = frame.payload?.producerId;
        if (!producerId || !room.producers.has(producerId)) {
          ack(ws, frame.msgId, false, wsError("PRODUCER_NOT_FOUND", "Unknown producer", {}, false));
          return;
        }

        const producer = room.producers.get(producerId);
        if (mediaPlane.mode === "mediasoup" && !validateRtpCapabilities(frame.payload?.rtpCapabilities)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "rtpCapabilities must be non-empty", {}, false));
          return;
        }
        const consumed = await mediaPlane.consume(
          room.roomId,
          conn.deviceId,
          producerId,
          frame.payload?.rtpCapabilities ?? null
        );
        send(ws, {
          v: 1,
          type: "CONSUMER_ADDED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            roomId: room.roomId,
            consumerId: consumed.id,
            producerId,
            kind: consumed.kind ?? producer.kind,
            rtpParameters: consumed.rtpParameters ?? {},
          },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "CONSUMER_RESUME": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        // In mediasoup mode, resume the consumer. In fallback mode, no-op — just ack.
        const consumerId = frame.payload?.consumerId;
        if (mediaPlane.mode === "mediasoup" && consumerId && typeof mediaPlane.resumeConsumer === "function") {
          await mediaPlane.resumeConsumer(room.roomId, consumerId).catch(() => {});
        }
        ack(ws, frame.msgId, true);
        return;
      }

      case "ICE_RESTART": {
        if (!ensureAuth()) return;
        send(ws, {
          v: 1,
          type: "ICE_RESTART_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: frame.payload?.roomId ?? conn.roomId, policy: frame.payload?.policy ?? "relay" },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "REKEY_BEGIN": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!checkE2EERateLimit(conn.deviceId, "REKEY_BEGIN")) {
          ack(ws, frame.msgId, false, wsError("RATE_LIMITED", "Too many rekey operations", {}, true));
          return;
        }
        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "REKEY_COMMIT": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (Number.isFinite(frame.payload?.epoch)) {
          room.epoch = Number(frame.payload.epoch);
          if (E2EE_REQUIRED_DEFAULT) {
            for (const peer of room.peers.values()) {
              peer.e2eeReady = false;
              peer.e2eeEpoch = -1;
            }
          }
          bumpRoomVersion(room);
        }
        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "KEY_PACKAGE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!checkE2EERateLimit(conn.deviceId, "KEY_PACKAGE")) {
          ack(ws, frame.msgId, false, wsError("RATE_LIMITED", "Too many key packages", {}, true));
          return;
        }
        // Validate required KEY_PACKAGE fields
        const kp = frame.payload ?? {};
        if (!kp.ciphertext || typeof kp.ciphertext !== "string" || kp.ciphertext.length < 24) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid ciphertext field", {}, false));
          return;
        }
        if (!kp.targetDeviceId || typeof kp.targetDeviceId !== "string") {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing targetDeviceId", {}, false));
          return;
        }
        if (typeof kp.epoch !== "number" || kp.epoch < 0) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Invalid epoch", {}, false));
          return;
        }

        if (!kp.sig || !isLikelyBase64(kp.sig, 24)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid sig", {}, false));
          return;
        }

        if (!kp.senderPublicKey || !isLikelyBase64(kp.senderPublicKey, 24)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid senderPublicKey", {}, false));
          return;
        }

        if (!room.peers.has(kp.targetDeviceId)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_TARGET_NOT_FOUND", "Target device not in room", {}, false));
          return;
        }

        const delivered = sendToDevice(room, kp.targetDeviceId, {
          ...frame,
          msgId: uuid(),
          ts: nowMs(),
        });

        if (!delivered) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_TARGET_OFFLINE", "Target device unavailable", {}, true));
          return;
        }

        ack(ws, frame.msgId, true);
        return;
      }

      case "KEY_ACK": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const ka = frame.payload ?? {};
        if (typeof ka.epoch !== "number" || ka.epoch < 0) {
          ack(ws, frame.msgId, false, wsError("KEY_ACK_INVALID", "Invalid epoch", {}, false));
          return;
        }
        if (typeof ka.fromDeviceId !== "string" || ka.fromDeviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("KEY_ACK_INVALID", "fromDeviceId mismatch", {}, false));
          return;
        }

        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "PING": {
        ack(ws, frame.msgId, true);
        return;
      }

      case "GET_ROUTER_RTP_CAPABILITIES": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? conn.roomId;
        const room = rooms.get(roomId);
        const caps = room?.routerRtpCapabilities ?? { codecs: [] };
        send(ws, {
          v: 1,
          type: "ROUTER_RTP_CAPABILITIES",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId, routerRtpCapabilities: caps },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_LEAVE": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? conn.roomId;
        const room = rooms.get(roomId);
        if (room && conn.deviceId && room.peers.has(conn.deviceId)) {
          mediaPlane.removePeer(room.roomId, conn.deviceId).catch(() => {});
          room.peers.delete(conn.deviceId);
          room.memberSetVersion += 1;
          bumpRoomVersion(room);
          for (const [producerId, producer] of room.producers.entries()) {
            if (producer.peerDeviceId === conn.deviceId) {
              room.producers.delete(producerId);
            }
          }
          broadcastRoom(room, {
            v: 1,
            type: "PEER_LEFT",
            msgId: uuid(),
            ts: nowMs(),
            payload: { roomId: room.roomId, userId: conn.userId, deviceId: conn.deviceId },
          });
          if (room.peers.size === 0) {
            mediaPlane.closeRoom(room.roomId).catch(() => {});
            rooms.delete(roomId);
          }
          conn.roomId = null;
        }
        send(ws, {
          v: 1,
          type: "ROOM_LEFT",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      default: {
        ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", `Unsupported type: ${frame.type}`, {}, false));
      }
    }
    } catch (error) {
      ack(ws, frame.msgId, false, wsError("INTERNAL_ERROR", error?.message ?? "Unexpected server error", {}, true));
    }
  });

  ws.on("close", () => {
    if (conn.deviceId) peersByDevice.delete(conn.deviceId);

    if (conn.roomId && conn.deviceId) {
      const room = rooms.get(conn.roomId);
      if (room && room.peers.has(conn.deviceId)) {
        mediaPlane.removePeer(room.roomId, conn.deviceId).catch(() => {});
        room.peers.delete(conn.deviceId);
        room.memberSetVersion += 1;
        bumpRoomVersion(room);

        for (const [producerId, producer] of room.producers.entries()) {
          if (producer.peerDeviceId === conn.deviceId) {
            room.producers.delete(producerId);
          }
        }

        broadcastRoom(room, {
          v: 1,
          type: "PEER_LEFT",
          msgId: uuid(),
          ts: nowMs(),
          payload: { roomId: room.roomId, userId: conn.userId, deviceId: conn.deviceId },
        });

        if (room.peers.size === 0) {
          mediaPlane.closeRoom(room.roomId).catch(() => {});
          rooms.delete(conn.roomId);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[sfu] listening on http://localhost:${PORT} (region=${REGION} nodeId=${NODE_ID})`);
});
