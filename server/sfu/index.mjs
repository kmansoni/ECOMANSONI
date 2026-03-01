import http from "node:http";
import crypto from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { createMediaPlaneController } from "./mediaPlane.mjs";

const PORT = Number(process.env.SFU_PORT ?? "8888");
const REGION = process.env.SFU_REGION ?? "tr";
const NODE_ID = process.env.SFU_NODE_ID ?? "local-sfu-1";
const E2EE_REQUIRED_DEFAULT = process.env.SFU_E2EE_REQUIRED !== "0";
const HEARTBEAT_SEC = Math.max(5, Number(process.env.SFU_HEARTBEAT_SEC ?? "10"));
const IS_PROD = process.env.NODE_ENV === "production";
const CALLS_DEV_INSECURE_AUTH = !IS_PROD && process.env.CALLS_DEV_INSECURE_AUTH === "1";
const REQUIRE_MEDIASOUP_IN_PROD = IS_PROD && process.env.SFU_REQUIRE_MEDIASOUP !== "0";
const requireSFrame = process.env.SFU_REQUIRE_SFRAME === "1";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_AUTH_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const STARTED_AT = Date.now();

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

function isObject(value) {
  return !!value && typeof value === "object";
}

function hasNonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
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
    epoch: 0,
    memberSetVersion: 0,
    peers: new Map(),
    producers: new Map(),
    routerRtpCapabilities: { codecs: [] },
  };
  rooms.set(roomId, room);
  return room;
}

function makeSnapshot(room) {
  return {
    roomId: room.roomId,
    callId: room.callId,
    region: room.region,
    nodeId: room.nodeId,
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

wss.on("connection", (ws) => {
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
        conn.e2eeCaps = { insertableStreams, sframe };

        if (E2EE_REQUIRED_DEFAULT && !insertableStreams) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Insertable Streams capability is required", {}, false));
          return;
        }
          if (requireSFrame && !sframe) {
            ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame capability is required", {}, false));
            return;
          }

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_CREATE": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? `room_${uuid().slice(0, 8)}`;
        const callId = frame.payload?.callId ?? `call_${uuid().slice(0, 8)}`;
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
          if (requireSFrame && !conn.e2eeCaps?.sframe) {
            ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame capability is required before joining the room", {}, false));
            return;
          }
        const roomId = frame.payload?.roomId;
        if (!roomId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing roomId", {}, false));
          return;
        }

        const callId = frame.payload?.callId ?? `call_${uuid().slice(0, 8)}`;
        const room = ensureRoom(roomId, callId, frame.payload?.preferredRegion ?? REGION);
        const ensured = await mediaPlane.createRoom(roomId);
        room.routerRtpCapabilities = ensured?.routerRtpCapabilities ?? room.routerRtpCapabilities;
        const deviceId = frame.payload?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 8)}`;
        conn.deviceId = deviceId;
        conn.roomId = roomId;

        room.memberSetVersion += 1;
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

      case "REKEY_BEGIN":
      case "REKEY_COMMIT":
      case "KEY_PACKAGE":
      case "KEY_ACK": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        if (frame.type === "REKEY_COMMIT" && Number.isFinite(frame.payload?.epoch)) {
          room.epoch = Number(frame.payload.epoch);
          if (E2EE_REQUIRED_DEFAULT) {
            for (const peer of room.peers.values()) {
              peer.e2eeReady = false;
              peer.e2eeEpoch = -1;
            }
          }
        }

        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, null);
        ack(ws, frame.msgId, true);
        return;
      }

      case "PING": {
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
