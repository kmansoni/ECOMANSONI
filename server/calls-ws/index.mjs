import http from "node:http";
import crypto from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import WebSocket, { WebSocketServer } from "ws";
import { createStoreFromEnv } from "./store/index.mjs";

const PORT = Number(process.env.CALLS_WS_PORT ?? "8787");
const NODE_ENV = String(process.env.NODE_ENV ?? "").toLowerCase();
const ENV = String(process.env.ENV ?? "").toLowerCase();
const IS_PROD_LIKE = NODE_ENV === "production" || ENV === "prod" || ENV === "production";
const CALLS_DEV_INSECURE_AUTH = process.env.CALLS_DEV_INSECURE_AUTH === "1";
if (CALLS_DEV_INSECURE_AUTH && IS_PROD_LIKE) {
  throw new Error("CALLS_DEV_INSECURE_AUTH is forbidden in production-like environments");
}
const CALLS_JOIN_TOKEN_TTL_SEC = Math.max(30, Number(process.env.CALLS_JOIN_TOKEN_TTL_SEC ?? "600"));
const KEY_TTL_MS = Math.max(15_000, Number(process.env.CALLS_KEY_TTL_MS ?? "120000"));
const DEDUP_TTL_MS = Math.max(30_000, Number(process.env.CALLS_DEDUP_TTL_SEC ?? "600") * 1000);
const { store, degraded } = await createStoreFromEnv();

const GW_HELLO_PAYLOAD = {
  degraded: !!degraded,
  storage: store.kind,
  features: store.features,
};

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const envelopeValidate = ajv.compile({
  type: "object",
  additionalProperties: true,
  required: ["v", "type", "msgId", "ts", "payload"],
  properties: {
    v: { type: "integer", const: 1 },
    type: { type: "string" },
    msgId: { type: "string", format: "uuid" },
    ts: { type: "integer" },
    seq: { type: "integer" },
    ack: {
      type: "object",
      required: ["ackOfMsgId"],
      properties: {
        ackOfMsgId: { type: "string", format: "uuid" },
        ok: { type: "boolean" },
        error: { type: "object" }
      }
    },
    payload: { type: "object" }
  }
});

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
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
    ack: {
      ackOfMsgId,
      ok,
      error
    },
    payload: {}
  });
}

function wsError(code, message, details, retryable) {
  return { code, message, details, retryable };
}

// In-memory dev state
const rooms = new Map(); // roomId -> { callId, region, nodeId, epoch, memberSetVersion, peers: Map(deviceId -> {userId, role, e2eeReady}), producers: [] }

const deviceSockets = new Map(); // deviceId -> ws
const usedJoinTokenJtis = new Map(); // jti -> expMs

const joinReplayGc = setInterval(() => {
  const now = Date.now();
  for (const [jti, expMs] of usedJoinTokenJtis.entries()) {
    if (!Number.isFinite(expMs) || expMs <= now) usedJoinTokenJtis.delete(jti);
  }
}, 60_000);
joinReplayGc.unref?.();

function getTurnIceServersPublic() {
  const urls = String(process.env.CALLS_TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // IMPORTANT: WS is signaling/control-plane only.
  // It must NEVER emit TURN username/credential (those are issued by edge function).
  // WS only advertises TURN URLs (if any).
  return urls.length ? [{ urls }] : [];
}

function getJoinTokenSecret() {
  const explicit = process.env.CALLS_JOIN_TOKEN_SECRET;
  if (explicit && explicit.length >= 32) return explicit;

  if (IS_PROD_LIKE) {
    throw new Error("Missing CALLS_JOIN_TOKEN_SECRET in production-like environment");
  }

  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (supabaseJwtSecret && supabaseJwtSecret.length >= 32) {
    console.warn("[calls-ws] Using SUPABASE_JWT_SECRET fallback for join token signing in non-prod environment");
    return supabaseJwtSecret;
  }

  console.warn("[calls-ws] Using development-only join token secret (non-prod only)");
  return "dev-only-join-token-secret";
}

function encodeBase64Url(raw) {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(raw) {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function issueJoinToken({ roomId, callId, userId }) {
  const payload = {
    roomId,
    callId,
    userId,
    jti: uuid(),
    exp: Math.floor(Date.now() / 1000) + CALLS_JOIN_TOKEN_TTL_SEC,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getJoinTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

function verifyJoinToken(joinToken) {
  if (typeof joinToken !== "string") return null;
  const [encodedPayload, sig] = joinToken.split(".");
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
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const expMs = Number(payload?.exp ?? 0) * 1000;
    if (!expMs || expMs <= Date.now()) return null;
    if (typeof payload?.jti !== "string" || payload.jti.length < 8) return null;
    if (typeof payload?.roomId !== "string" || typeof payload?.callId !== "string" || typeof payload?.userId !== "string") {
      return null;
    }

    // One-time token usage (best effort, process-local).
    if (usedJoinTokenJtis.has(payload.jti)) return null;
    usedJoinTokenJtis.set(payload.jti, expMs);

    return payload;
  } catch {
    return null;
  }
}

function pruneSeenMsgIds(seenMsgIds) {
  const cutoff = nowMs() - DEDUP_TTL_MS;
  for (const [msgId, ts] of seenMsgIds.entries()) {
    if (ts < cutoff) seenMsgIds.delete(msgId);
  }
}

async function validateSupabaseAccessToken(accessToken) {
  if (CALLS_DEV_INSECURE_AUTH) {
    return { ok: true, userId: `dev_${String(accessToken).slice(0, 8)}` };
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, userId: null, reason: "missing_supabase_env" };
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      return { ok: false, userId: null, reason: `auth_api_status_${res.status}` };
    }
    const data = await res.json().catch(() => null);
    const userId = typeof data?.id === "string" ? data.id : null;
    if (!userId) {
      return { ok: false, userId: null, reason: "auth_api_no_user_id" };
    }
    return { ok: true, userId };
  } catch (error) {
    return { ok: false, userId: null, reason: error instanceof Error ? error.message : "auth_api_error" };
  }
}

function sendGwHello(ws, seq) {
  send(ws, {
    v: 1,
    type: "GW_HELLO",
    msgId: uuid(),
    ts: nowMs(),
    seq,
    payload: GW_HELLO_PAYLOAD,
  });
}

async function makeSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const roomVersion = await store.getRoomVersion(room.callId);

  return {
    roomId,
    callId: room.callId,
    region: room.region,
    nodeId: room.nodeId,
    roomVersion,
    epoch: room.epoch,
    memberSetVersion: room.memberSetVersion,
    serverTime: nowMs(),
    peers: Array.from(room.peers.values()).map((p) => ({
      userId: p.userId,
      deviceId: p.deviceId,
      role: p.role,
      state: "joined",
      e2eeReady: p.e2eeReady,
    })),
    producers: room.producers,
    e2ee: {
      required: true,
      epoch: room.epoch,
      leaderDeviceId: Array.from(room.peers.keys())[0] ?? "",
      expectedSenderDevices: Array.from(room.peers.keys()),
      protocolVersion: 1,
      missingSenderKeys: []
    }
  };
}

const server = http.createServer();
server.on("request", (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...GW_HELLO_PAYLOAD }));
    return;
  }
});
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const conn = {
    authenticated: false,
    userId: null,
    deviceId: null,
    expectedSeq: 1,
    seenMsgIds: new Map(),
    resumeToken: uuid(),
  };

  ws.on("message", async (data) => {
    let frame;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!envelopeValidate(frame)) {
      ack(ws, frame?.msgId ?? uuid(), false, wsError("VALIDATION_FAILED", "Invalid envelope", { errors: envelopeValidate.errors }, false));
      return;
    }

    // Duplicate msgId (in-memory TTL)
    if (conn.seenMsgIds.size > 1024) {
      pruneSeenMsgIds(conn.seenMsgIds);
    }
    if (conn.seenMsgIds.has(frame.msgId)) {
      ack(ws, frame.msgId, true);
      return;
    }
    conn.seenMsgIds.set(frame.msgId, nowMs());

    // seq enforcement for non-ACK frames
    if (!frame.ack && typeof frame.seq === "number") {
      if (frame.seq !== conn.expectedSeq) {
        ack(ws, frame.msgId, false, wsError("SEQ_OUT_OF_ORDER", `Expected seq=${conn.expectedSeq} got ${frame.seq}`, {}, true));
        return;
      }
      conn.expectedSeq++;
    }

    // Handle types
    switch (frame.type) {
      case "HELLO": {
        conn.deviceId = frame.payload?.client?.deviceId ?? conn.deviceId;
        if (conn.deviceId) deviceSockets.set(conn.deviceId, ws);
        send(ws, {
          v: 1,
          type: "WELCOME",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            serverTime: nowMs(),
            heartbeatSec: 10,
            resumeToken: conn.resumeToken,
            features: { wsSeqRequired: true, e2eeRequiredDefault: true }
          }
        });
        return ack(ws, frame.msgId, true);
      }

      case "AUTH": {
        const accessToken = frame.payload?.accessToken;
        if (typeof accessToken !== "string" || accessToken.length < 20) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Missing accessToken", {}, false));
          return;
        }
        const authResult = await validateSupabaseAccessToken(accessToken);
        if (!authResult.ok || !authResult.userId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Invalid accessToken", { reason: authResult.reason ?? "invalid" }, false));
          return;
        }
        conn.authenticated = true;
        conn.userId = authResult.userId;
        if (conn.deviceId) deviceSockets.set(conn.deviceId, ws);
        send(ws, {
          v: 1,
          type: "AUTH_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { userId: conn.userId, deviceId: conn.deviceId ?? "dev-device" }
        });

        // Advertise gateway mode/features immediately after auth
        sendGwHello(ws, conn.expectedSeq++);
        return ack(ws, frame.msgId, true);
      }

      case "SYNC_MAILBOX": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const deviceId = frame.payload?.deviceId;
        if (!deviceId || deviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "deviceId mismatch", {}, false));
          return;
        }
        if (!store.features.offlineMailbox) {
          send(ws, {
            v: 1,
            type: "MAILBOX_BATCH",
            msgId: uuid(),
            ts: nowMs(),
            seq: conn.expectedSeq++,
            payload: { deviceId, nextStreamId: frame.payload?.lastStreamId ?? "0-0", messages: [] },
          });
          ack(ws, frame.msgId, true);
          return;
        }

        const lastStreamId = frame.payload?.lastStreamId ?? "0-0";
        const limit = Math.max(1, Math.min(200, Number(frame.payload?.limit ?? 50)));
        const { cursorTo, items } = await store.sync(deviceId, lastStreamId, limit);

        const messages = items.map((it) => ({ streamId: it.streamId, frame: it.msg }));
        const nextStreamId = cursorTo;

        send(ws, {
          v: 1,
          type: "MAILBOX_BATCH",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { deviceId, nextStreamId, messages },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "MAILBOX_ACK": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, true);
          return;
        }
        const deviceId = frame.payload?.deviceId;
        if (!deviceId || deviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "deviceId mismatch", {}, false));
          return;
        }
        const upToStreamId = frame.payload?.upToStreamId;
        if (!upToStreamId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing upToStreamId", {}, false));
          return;
        }
        await store.ack(deviceId, upToStreamId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_CAPS": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "ROOM_CREATE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const roomId = `room_${uuid().slice(0, 8)}`;
        const callId = `call_${uuid().slice(0, 8)}`;
        const region = frame.payload?.preferredRegion ?? "tr";
        const nodeId = "local-sfu-1";

        rooms.set(roomId, {
          callId,
          region,
          nodeId,
          ownerUserId: conn.userId,
          joinToken: issueJoinToken({ roomId, callId, userId: conn.userId }),
          epoch: 0,
          memberSetVersion: 0,
          peers: new Map(),
          producers: []
        });

        // initialize room version
        await store.bumpRoomVersion(callId);

        send(ws, {
          v: 1,
          type: "ROOM_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId, callId, region, nodeId, epoch: 0, memberSetVersion: 0 }
        });

        send(ws, {
          v: 1,
          type: "ROOM_JOIN_SECRET",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId, joinToken: rooms.get(roomId).joinToken }
        });

        return ack(ws, frame.msgId, true);
      }

      case "ROOM_JOIN": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const roomId = frame.payload?.roomId;
        if (!roomId || !rooms.has(roomId)) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId }, false));
          return;
        }

        const room = rooms.get(roomId);
        const providedJoinToken = frame.payload?.joinToken;
        const joinPayload = verifyJoinToken(providedJoinToken);
        if (!joinPayload) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid join token", { roomId }, false));
          return;
        }
        if (joinPayload.roomId !== roomId || joinPayload.callId !== room.callId || joinPayload.userId !== conn.userId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid join token", { roomId }, false));
          return;
        }
        const deviceId = frame.payload?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 6)}`;
        conn.deviceId = deviceId;
        deviceSockets.set(deviceId, ws);

        room.memberSetVersion++;
        await store.addMember(room.callId, deviceId);
        await store.bumpRoomVersion(room.callId);
        room.peers.set(deviceId, {
          userId: conn.userId,
          deviceId,
          role: "member",
          e2eeReady: false
        });

        const iceServers = getTurnIceServersPublic();
        const turnUrls = iceServers.length ? iceServers[0].urls : [];
        const turnAvailable = Array.isArray(turnUrls) && turnUrls.some((u) => typeof u === "string" && /^turns?:/i.test(u));

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
              routerRtpCapabilities: {},
              sendTransportOptions: {},
              recvTransportOptions: {}
            },
            turn: {
              turnAvailable,
              turnUrls,
              iceServers, // urls only; never includes username/credential
              credsVia: "edge_function",
              forceRelayAfterMs: turnAvailable ? 4000 : 0,
            }
          }
        });

        // Send snapshot right away
        const snapshot = await makeSnapshot(roomId);
        if (snapshot) {
          send(ws, {
            v: 1,
            type: "ROOM_SNAPSHOT",
            msgId: uuid(),
            ts: nowMs(),
            seq: conn.expectedSeq++,
            payload: snapshot
          });
        }

        // Offline mailbox is handled via SYNC_MAILBOX.

        return ack(ws, frame.msgId, true);
      }

      // Call signaling layer (dev routing). These are independent from rooms.
      case "call.invite": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        // Best effort: deliver to the callee's device if connected.
        const toUser = frame.payload?.to;
        const toDevice = frame.payload?.to_device ?? null;
        if (toDevice && deviceSockets.has(toDevice)) {
          send(deviceSockets.get(toDevice), { ...frame, ts: nowMs() });
        }
        return ack(ws, frame.msgId, true);
      }

      case "call.accept":
      case "call.decline":
      case "call.cancel":
      case "call.hangup":
      case "call.rekey": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "KEY_PACKAGE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId: p.roomId }, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        if (p.toDeviceId && !(await store.assertMember(room.callId, p.toDeviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Recipient is not a call member", {}, false));
          return;
        }
        const record = {
          roomId: p.roomId,
          epoch: p.epoch,
          fromDeviceId: p.fromDeviceId,
          toDeviceId: p.toDeviceId,
          senderKeyId: p.senderKeyId,
          keyPackageType: p.keyPackageType ?? "SENDER_KEY",
          ciphertext: p.ciphertext,
          sig: p.sig,
          protocolVersion: p.protocolVersion ?? 1,
          createdAt: nowMs(),
          expiresAt: nowMs() + KEY_TTL_MS,
          deliveredAt: null,
          ackedAt: null,
          attempts: 0,
        };
        // save route for ACK routing
        await store.saveRoute(frame.msgId, record.fromDeviceId);

        const recipientFrame = {
          ...frame,
          ts: nowMs(),
        };
        if (store.features.offlineMailbox) {
          await store.deliver(record.toDeviceId, {
            ver: 1,
            id: recipientFrame.msgId,
            type: "KEY_PACKAGE",
            ts: recipientFrame.ts,
            callId: room.callId,
            fromDevice: record.fromDeviceId,
            epoch: record.epoch,
            payload: record.ciphertext,
            refId: record.senderKeyId,
            sig: record.sig,
          });
        }

        // immediate push if online
        const recipientWs = deviceSockets.get(record.toDeviceId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          send(recipientWs, recipientFrame);
        }
        return ack(ws, frame.msgId, true);
      }

      case "KEY_ACK": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};

        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId: p.roomId }, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        // Track rekey ACK only if this ACK refers to the begin message for this epoch
        const beginId = await store.getRekeyBeginId(room.callId, p.epoch);
        if (beginId && frame.payload?.refId === beginId) {
          await store.markAck(room.callId, p.epoch, p.fromDeviceId);
        }

        // Route ACK back to initiator using route(refId)
        const refId = frame.payload?.refId;
        if (refId) {
          const initiator = await store.getRoute(refId);
          if (initiator) {
            const ackFrame = { ...frame, ts: nowMs() };
            if (store.features.offlineMailbox) {
              await store.deliver(initiator, {
                ver: 1,
                id: ackFrame.msgId,
                type: "KEY_ACK",
                ts: ackFrame.ts,
                callId: room.callId,
                fromDevice: p.fromDeviceId,
                epoch: p.epoch,
                payload: "",
                refId,
                sig: "",
              });
            }
            const wsi = deviceSockets.get(initiator);
            if (wsi && wsi.readyState === WebSocket.OPEN) send(wsi, ackFrame);
          }
        }

        return ack(ws, frame.msgId, true);
      }

      case "REKEY_BEGIN": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", {}, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        // save begin id and need-set
        const toDevices = room ? Array.from(room.peers.keys()) : [];
        const epoch = p.newEpoch ?? p.epoch ?? 0;
        await store.setRekeyBeginId(room.callId, epoch, frame.msgId);
        await store.setNeed(room.callId, epoch, toDevices);
        await store.saveRoute(frame.msgId, conn.deviceId);

        // fan-out begin as opaque payload
        for (const to of toDevices) {
          const beginFrame = { ...frame, ts: nowMs() };
          if (store.features.offlineMailbox) {
            await store.deliver(to, {
              ver: 1,
              id: beginFrame.msgId,
              type: "REKEY_BEGIN",
              ts: beginFrame.ts,
              callId: room.callId,
              fromDevice: conn.deviceId,
              epoch,
              payload: "",
              refId: "",
              sig: "",
            });
          }
          const wst = deviceSockets.get(to);
          if (wst && wst.readyState === WebSocket.OPEN) send(wst, beginFrame);
        }
        return ack(ws, frame.msgId, true);
      }

      case "REKEY_COMMIT": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", {}, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        if (!store.features.rekeyCommit) {
          ack(ws, frame.msgId, false, wsError("E2EE_KEY_SYNC_FAILED", "DEGRADED_NO_COMMIT", {}, false));
          return;
        }

        const epoch = p.epoch;
        const gate = await store.tryCommit(room.callId, epoch);
        if (!gate.ok) {
          ack(ws, frame.msgId, false, wsError("E2EE_KEY_SYNC_FAILED", gate.reason, { ack: gate.ack, need: gate.need }, true));
          return;
        }

        // Apply epoch and bump version
        room.epoch = epoch;
        await store.bumpRoomVersion(room.callId);

        const toDevices = Array.from(room.peers.keys());
        for (const to of toDevices) {
          const commitFrame = { ...frame, ts: nowMs() };
          if (store.features.offlineMailbox) {
            await store.deliver(to, {
              ver: 1,
              id: commitFrame.msgId,
              type: "REKEY_COMMIT",
              ts: commitFrame.ts,
              callId: room.callId,
              fromDevice: conn.deviceId,
              epoch,
              payload: "",
              refId: "",
              sig: "",
            });
          }
          const wst = deviceSockets.get(to);
          if (wst && wst.readyState === WebSocket.OPEN) send(wst, commitFrame);
        }

        // Also send a fresh snapshot
        const snapshot = await makeSnapshot(p.roomId);
        if (snapshot) {
          for (const to of toDevices) {
            const wst = deviceSockets.get(to);
            if (!wst || wst.readyState !== WebSocket.OPEN) continue;
            send(wst, {
              v: 1,
              type: "ROOM_SNAPSHOT",
              msgId: uuid(),
              ts: nowMs(),
              seq: undefined,
              payload: snapshot,
            });
          }
        }

        return ack(ws, frame.msgId, true);
      }

      default:
        // Unknown or not implemented
        ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", `Unsupported type: ${frame.type}`, {}, false));
    }
  });

  ws.on("close", () => {
    if (conn.deviceId && deviceSockets.get(conn.deviceId) === ws) {
      deviceSockets.delete(conn.deviceId);
    }

    if (!conn.deviceId) return;

    for (const room of rooms.values()) {
      if (!room.peers.has(conn.deviceId)) continue;

      room.peers.delete(conn.deviceId);
      room.memberSetVersion++;
      void store.removeMember?.(room.callId, conn.deviceId);
      void store.bumpRoomVersion(room.callId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[calls-ws] listening on ws://localhost:${PORT}`);
});
