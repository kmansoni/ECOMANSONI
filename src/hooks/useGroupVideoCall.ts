/**
 * useGroupVideoCall — групповые видеозвонки через SFU (mediasoup).
 *
 * Архитектура:
 *  - Сигналинг: WebSocket (calls-v2 WS server) / Supabase Realtime как фолбек
 *  - Медиа: mediasoup-client producers/consumers
 *  - Active speaker: VAD через AudioContext.AnalyserNode (RMS threshold 0.015)
 *  - Screen share: отдельный producer с track replaceable
 *  - Raise hand: Supabase Realtime presence state
 *  - Безопасность: все участники авторизованы через JWT, сервер проверяет членство в группе
 *
 * Threat model:
 *  - Клиент не доверяем: все операции валидируются на SFU сервере
 *  - Replay protection: каждый WS message содержит nonce + timestamp (±30s window)
 *  - addParticipant: сервер проверяет, что вызывающий является участником комнаты
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Participant {
  /** UUID пользователя */
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** MediaStream от SFU consumer. null если аудио-only или нет разрешения */
  stream: MediaStream | null;
  /** true если пользователь замьютил микрофон */
  isMuted: boolean;
  /** true если камера выключена */
  isCameraOff: boolean;
  /** true если идёт демонстрация экрана */
  isScreenSharing: boolean;
  /** true если поднял руку */
  isHandRaised: boolean;
  /** true если сейчас говорит (VAD) */
  isSpeaking: boolean;
}

export interface GroupCallState {
  participants: Participant[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  activeSpeakerId: string | null;
  pinnedParticipantId: string | null;
  duration: number;
  isJoined: boolean;
  isJoining: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// VAD (Voice Activity Detection) — AudioContext RMS threshold
// ---------------------------------------------------------------------------

const VAD_INTERVAL_MS = 100;
const VAD_RMS_THRESHOLD = 0.015;
const VAD_SILENCE_TIMEOUT_MS = 800;

class VoiceActivityDetector {
  private audioCtx: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode;
  private buffer: Float32Array;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastSpeakingTs = 0;

  constructor(stream: MediaStream, private onSpeaking: (speaking: boolean) => void) {
    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.buffer = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  start() {
    let wasSpeaking = false;
    this.intervalId = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.buffer as Float32Array<ArrayBuffer>);
      let sumSq = 0;
      for (let i = 0; i < this.buffer.length; i++) sumSq += this.buffer[i] * this.buffer[i];
      const rms = Math.sqrt(sumSq / this.buffer.length);
      const isSpeaking = rms > VAD_RMS_THRESHOLD;

      if (isSpeaking) {
        this.lastSpeakingTs = Date.now();
        if (!wasSpeaking) {
          wasSpeaking = true;
          this.onSpeaking(true);
        }
      } else if (wasSpeaking && Date.now() - this.lastSpeakingTs > VAD_SILENCE_TIMEOUT_MS) {
        wasSpeaking = false;
        this.onSpeaking(false);
      }
    }, VAD_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    try {
      this.source.disconnect();
      this.audioCtx.close();
    } catch (error) {
      logger.warn("group_call.vad_cleanup_failed", { error });
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGroupVideoCall(roomId: string) {
  const { user } = useAuth();

  const [state, setState] = useState<GroupCallState>({
    participants: [],
    localStream: null,
    screenStream: null,
    isMuted: false,
    isCameraOn: true,
    isScreenSharing: false,
    isHandRaised: false,
    activeSpeakerId: null,
    pinnedParticipantId: null,
    duration: 0,
    isJoined: false,
    isJoining: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const sfuManagerRef = useRef<SfuMediaManager | null>(null);
  const localProducerIdsRef = useRef<{ audio: string | null; video: string | null }>({ audio: null, video: null });
  const routerCapsRef = useRef<Record<string, unknown> | null>(null);
  const pendingSignalWaitersRef = useRef<Array<{
    type: string;
    timeoutId: ReturnType<typeof setTimeout>;
    predicate: (payload: Record<string, unknown>, parsed: Record<string, unknown>) => boolean;
    resolve: (value: { payload: Record<string, unknown>; parsed: Record<string, unknown> }) => void;
    reject: (reason?: unknown) => void;
  }>>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const manualWsCloseRef = useRef(false);
  const wsSeqRef = useRef(1);
  const wsDeviceIdRef = useRef<string>(`grp_${crypto.randomUUID().slice(0, 8)}`);

  const rejectPendingSignalWaiters = useCallback((reason: string) => {
    const waiters = pendingSignalWaitersRef.current;
    pendingSignalWaitersRef.current = [];
    for (const waiter of waiters) {
      window.clearTimeout(waiter.timeoutId);
      waiter.reject(new Error(reason));
    }
  }, []);

  const waitForSignal = useCallback((
    type: string,
    predicate: (payload: Record<string, unknown>, parsed: Record<string, unknown>) => boolean,
    timeoutMs = 5000,
  ) => {
    return new Promise<{ payload: Record<string, unknown>; parsed: Record<string, unknown> }>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingSignalWaitersRef.current = pendingSignalWaitersRef.current.filter((entry) => entry !== waiter);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      const waiter = {
        type,
        timeoutId,
        predicate,
        resolve,
        reject,
      };
      pendingSignalWaitersRef.current.push(waiter);
    });
  }, []);

  const resolveSignalWaiters = useCallback((type: string, payload: Record<string, unknown>, parsed: Record<string, unknown>) => {
    if (pendingSignalWaitersRef.current.length === 0) return;

    const remaining: typeof pendingSignalWaitersRef.current = [];
    for (const waiter of pendingSignalWaitersRef.current) {
      if (waiter.type !== type) {
        remaining.push(waiter);
        continue;
      }
      if (!waiter.predicate(payload, parsed)) {
        remaining.push(waiter);
        continue;
      }
      window.clearTimeout(waiter.timeoutId);
      waiter.resolve({ payload, parsed });
    }
    pendingSignalWaitersRef.current = remaining;
  }, []);

  const extractRouterCaps = useCallback((payload: Record<string, unknown>): Record<string, unknown> | null => {
    const directCaps = payload.routerRtpCapabilities;
    if (directCaps && typeof directCaps === "object") {
      const codecs = (directCaps as { codecs?: unknown }).codecs;
      if (Array.isArray(codecs) && codecs.length > 0) return directCaps as Record<string, unknown>;
    }

    const mediasoup = payload.mediasoup;
    if (mediasoup && typeof mediasoup === "object") {
      const nestedCaps = (mediasoup as { routerRtpCapabilities?: unknown }).routerRtpCapabilities;
      if (nestedCaps && typeof nestedCaps === "object") {
        const codecs = (nestedCaps as { codecs?: unknown }).codecs;
        if (Array.isArray(codecs) && codecs.length > 0) return nestedCaps as Record<string, unknown>;
      }
    }

    return null;
  }, []);

  const upsertRemoteTrack = useCallback((participantId: string, track: MediaStreamTrack) => {
    setState((s) => {
      const existing = s.participants.find((p) => p.id === participantId) ?? null;
      const baseStream = existing?.stream ?? new MediaStream();

      const clonedTrack = track.clone();
      const nextStream = new MediaStream(baseStream.getTracks());
      if (track.kind === "audio") {
        nextStream.getAudioTracks().forEach((t) => nextStream.removeTrack(t));
      } else if (track.kind === "video") {
        nextStream.getVideoTracks().forEach((t) => nextStream.removeTrack(t));
      }
      nextStream.addTrack(clonedTrack);

      const nextParticipant: Participant = existing
        ? {
            ...existing,
            stream: nextStream,
            isCameraOff: track.kind === "video" ? false : existing.isCameraOff,
          }
        : {
            id: participantId,
            displayName: "Участник",
            avatarUrl: null,
            stream: nextStream,
            isMuted: false,
            isCameraOff: track.kind === "video" ? false : true,
            isScreenSharing: false,
            isHandRaised: false,
            isSpeaking: false,
          };

      return {
        ...s,
        participants: existing
          ? s.participants.map((p) => (p.id === participantId ? nextParticipant : p))
          : [...s.participants, nextParticipant],
      };
    });
  }, []);

  const bootstrapSfuMedia = useCallback(async (stream: MediaStream) => {
    // Vitest/jsdom и старые webview не имеют WebRTC-транспорта для mediasoup.
    if (typeof RTCPeerConnection === "undefined") {
      logger.info("group_call.sfu_media_bootstrap_skipped_no_webrtc");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const routerCaps = routerCapsRef.current;
    if (!routerCaps) {
      logger.warn("group_call.sfu_media_bootstrap_skipped_missing_router_caps", { roomId });
      return;
    }

    const manager = new SfuMediaManager();
    sfuManagerRef.current = manager;

    await manager.loadDevice(routerCaps as import("mediasoup-client").types.RtpCapabilities);

    const sendCreatedPromise = waitForSignal(
      "TRANSPORT_CREATED",
      (payload) => payload.roomId === roomId && payload.direction === "send",
      6000,
    );
    sendSignal("TRANSPORT_CREATE", { direction: "send" });
    const { payload: sendPayload } = await sendCreatedPromise;

    const sendTransportId = typeof sendPayload.transportId === "string" ? sendPayload.transportId : "";
    if (!sendTransportId) {
      throw new Error("TRANSPORT_CREATED(send) without transportId");
    }

    manager.createSendTransport(
      {
        id: sendTransportId,
        iceParameters: sendPayload.iceParameters as import("mediasoup-client").types.IceParameters,
        iceCandidates: (sendPayload.iceCandidates as import("mediasoup-client").types.IceCandidate[]) ?? [],
        dtlsParameters: sendPayload.dtlsParameters as import("mediasoup-client").types.DtlsParameters,
      },
      async (dtlsParameters) => {
        sendSignal("TRANSPORT_CONNECT", {
          transportId: sendTransportId,
          dtlsParameters,
        });
      },
      async ({ kind, rtpParameters, appData }) => {
        const producedPromise = waitForSignal(
          "PRODUCED",
          (payload) => payload.roomId === roomId && typeof payload.producerId === "string",
          6000,
        );
        sendSignal("PRODUCE", {
          transportId: sendTransportId,
          kind,
          rtpParameters,
          appData,
        });
        const { payload } = await producedPromise;
        return payload.producerId as string;
      },
    );

    const recvCreatedPromise = waitForSignal(
      "TRANSPORT_CREATED",
      (payload) => payload.roomId === roomId && payload.direction === "recv",
      6000,
    );
    sendSignal("TRANSPORT_CREATE", { direction: "recv" });
    const { payload: recvPayload } = await recvCreatedPromise;

    const recvTransportId = typeof recvPayload.transportId === "string" ? recvPayload.transportId : "";
    if (!recvTransportId) {
      throw new Error("TRANSPORT_CREATED(recv) without transportId");
    }

    manager.createRecvTransport(
      {
        id: recvTransportId,
        iceParameters: recvPayload.iceParameters as import("mediasoup-client").types.IceParameters,
        iceCandidates: (recvPayload.iceCandidates as import("mediasoup-client").types.IceCandidate[]) ?? [],
        dtlsParameters: recvPayload.dtlsParameters as import("mediasoup-client").types.DtlsParameters,
      },
      async (dtlsParameters) => {
        sendSignal("TRANSPORT_CONNECT", {
          transportId: recvTransportId,
          dtlsParameters,
        });
      },
    );

    for (const track of stream.getTracks()) {
      if (track.readyState !== "live") continue;
      const source = track.kind === "video" ? "camera" : "microphone";
      const producer = await manager.produce(track, { source, trackId: track.id });
      if (track.kind === "audio") localProducerIdsRef.current.audio = producer.id;
      if (track.kind === "video") localProducerIdsRef.current.video = producer.id;
    }
  }, [roomId, waitForSignal]);

  // ---------------------------------------------------------------------------
  // Signaling helpers
  // ---------------------------------------------------------------------------

  /** Отправить сообщение в calls-v2 envelope v1 (seq/msgId/ts). */
  const sendSignal = useCallback((
    type: string,
    payload: Record<string, unknown>,
    options?: { includeRoomId?: boolean }
  ): string | null => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return null;
    const includeRoomId = options?.includeRoomId !== false;
    const msgId = crypto.randomUUID();
    const msg = JSON.stringify({
      v: 1,
      type,
      msgId,
      ts: Date.now(),
      seq: wsSeqRef.current++,
      payload: includeRoomId ? { roomId, ...payload } : payload,
    });
    wsRef.current.send(msg);
    return msgId;
  }, [roomId]);

  // ---------------------------------------------------------------------------
  // Presence (raise hand, mute state) через Supabase Realtime
  // ---------------------------------------------------------------------------

  const syncPresence = useCallback((updates: Record<string, unknown>) => {
    if (!realtimeChannelRef.current) return;
    realtimeChannelRef.current.track({ userId: user?.id, ...updates });
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // joinCall
  // ---------------------------------------------------------------------------

  const joinCall = useCallback(async () => {
    if (!user?.id || state.isJoined || state.isJoining) return;

    setState(s => ({ ...s, isJoining: true, error: null }));
    manualWsCloseRef.current = false;
    let pendingRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    try {
      // 1. Получить локальный медиа-поток
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      }).catch(async () => {
        // Деградация: только аудио
        return navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      });

      localStreamRef.current = stream;

      // 2. VAD для local stream
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks);
        vadRef.current = new VoiceActivityDetector(audioStream, (speaking) => {
          // Сигналим другим участникам через WS
          sendSignal("SPEAKING", { speaking });
        });
        vadRef.current.start();
      }

      // 3. Supabase Realtime для presence
      const channel = supabase.channel(`group-call:${roomId}`, {
        config: { presence: { key: user.id } },
      });
      pendingRealtimeChannel = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          const presenceState = channel.presenceState<{
            userId: string;
            isMuted?: boolean;
            isHandRaised?: boolean;
            isCameraOff?: boolean;
          }>();

          setState(s => ({
            ...s,
            participants: s.participants.map(p => {
              const entries = presenceState[p.id];
              if (!entries || entries.length === 0) return p;
              const latest = entries[entries.length - 1];
              return {
                ...p,
                isMuted: latest.isMuted ?? p.isMuted,
                isHandRaised: latest.isHandRaised ?? p.isHandRaised,
                isCameraOff: latest.isCameraOff ?? p.isCameraOff,
              };
            }),
          }));
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
          const pres = newPresences[0] as unknown as { userId: string; displayName?: string; avatarUrl?: string };
          if (key === user.id) return; // self
          setState(s => {
            if (s.participants.some(p => p.id === key)) return s;
            return {
              ...s,
              participants: [
                ...s.participants,
                {
                  id: key,
                  displayName: pres.displayName ?? "Участник",
                  avatarUrl: pres.avatarUrl ?? null,
                  stream: null,
                  isMuted: false,
                  isCameraOff: false,
                  isScreenSharing: false,
                  isHandRaised: false,
                  isSpeaking: false,
                },
              ],
            };
          });
        })
        .on("presence", { event: "leave" }, ({ key }) => {
          setState(s => ({
            ...s,
            participants: s.participants.filter(p => p.id !== key),
            activeSpeakerId: s.activeSpeakerId === key ? null : s.activeSpeakerId,
            pinnedParticipantId: s.pinnedParticipantId === key ? null : s.pinnedParticipantId,
          }));
        });

      await channel.subscribe();
      channel.track({
        userId: user.id,
        isMuted: false,
        isHandRaised: false,
        isCameraOff: false,
      });

      realtimeChannelRef.current = channel;

      // 4. WS подключение к SFU
      // Endpoint must be configured explicitly through env.
      const configuredSfuUrl = String(import.meta.env.VITE_SFU_WS_URL ?? "").trim();
      const sfuUrl = configuredSfuUrl;
      if (!sfuUrl) {
        throw new Error("VITE_SFU_WS_URL is required for group calls");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) {
        throw new Error("Отсутствует токен сессии для подключения к серверу звонков");
      }

      const ws = new WebSocket(`${sfuUrl}/calls-v2?room=${roomId}&token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      wsSeqRef.current = 1;
      routerCapsRef.current = null;
      let roomJoinMsgId: string | null = null;
      let joinResolved = false;

      let joinResolve: (() => void) | null = null;
      let joinReject: ((reason?: unknown) => void) | null = null;
      const joinReadyPromise = new Promise<void>((resolve, reject) => {
        joinResolve = resolve;
        joinReject = reject;
      });

      const resolveJoin = () => {
        if (joinResolved) return;
        joinResolved = true;
        joinResolve?.();
      };

      const rejectJoin = (message: string) => {
        if (joinResolved) return;
        joinResolved = true;
        joinReject?.(new Error(message));
      };

      ws.onopen = () => {
        sendSignal("HELLO", {
          client: {
            platform: "web",
            appVersion: "group-call",
            deviceId: wsDeviceIdRef.current,
          },
        }, { includeRoomId: false });
        sendSignal("AUTH", { accessToken: token }, { includeRoomId: false });
        sendSignal(
          "E2EE_CAPS",
          {
            insertableStreams:
              typeof RTCRtpSender !== "undefined" &&
              (typeof (RTCRtpSender.prototype as { createEncodedStreams?: unknown }).createEncodedStreams === "function" ||
                "RTCRtpScriptTransform" in globalThis),
            sframe: "RTCRtpScriptTransform" in globalThis,
            doubleRatchet: !!globalThis.crypto?.subtle,
          },
          { includeRoomId: false }
        );
        roomJoinMsgId = sendSignal("ROOM_JOIN", { deviceId: wsDeviceIdRef.current }, { includeRoomId: true });
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = (() => {
            if (typeof event.data === "string") {
              return JSON.parse(event.data) as Record<string, unknown>;
            }
            if (event.data && typeof event.data === "object") {
              return event.data as Record<string, unknown>;
            }
            return null;
          })();
          if (!parsed || typeof parsed.type !== "string") return;

          const payload = parsed.payload && typeof parsed.payload === "object"
            ? parsed.payload as Record<string, unknown>
            : {};

          resolveSignalWaiters(parsed.type, payload, parsed);

          const ack = parsed.ack && typeof parsed.ack === "object"
            ? parsed.ack as { ackOfMsgId?: string; ok?: boolean; error?: { message?: string } }
            : null;

          if (ack && roomJoinMsgId && ack.ackOfMsgId === roomJoinMsgId && ack.ok === false) {
            rejectJoin(ack.error?.message ?? "ROOM_JOIN rejected by server");
            return;
          }

          const msg = parsed as {
            type: string;
            participantId?: string;
            speaking?: boolean;
            stream?: MediaStream | null;
            streamAction?: "upsert" | "remove";
            hasVideo?: boolean;
          };

          if (msg.type === "ERROR") {
            rejectJoin(typeof payload.message === "string" ? payload.message : "Ошибка протокола звонка");
            return;
          }

          if (msg.type === "ROOM_JOIN_OK") {
            routerCapsRef.current = extractRouterCaps(payload);
            resolveJoin();
            return;
          }

          if (msg.type === "PRODUCER_ADDED") {
            const producerId = typeof payload.producerId === "string" ? payload.producerId : null;
            const peerDeviceId = typeof payload.peerDeviceId === "string" ? payload.peerDeviceId : null;
            const manager = sfuManagerRef.current;
            if (manager && producerId && peerDeviceId !== wsDeviceIdRef.current && manager.rtpCapabilities) {
              sendSignal("CONSUME", {
                producerId,
                rtpCapabilities: manager.rtpCapabilities,
              });
            }
            return;
          }

          if (msg.type === "CONSUMER_ADDED") {
            const manager = sfuManagerRef.current;
            const consumerId = typeof payload.consumerId === "string" ? payload.consumerId : null;
            const producerId = typeof payload.producerId === "string" ? payload.producerId : null;
            const kind = payload.kind === "audio" || payload.kind === "video" ? payload.kind : null;
            if (manager && consumerId && producerId && kind) {
              void (async () => {
                try {
                  const consumer = await manager.consume({
                    id: consumerId,
                    producerId,
                    kind,
                    rtpParameters: (payload.rtpParameters as import("mediasoup-client").types.RtpParameters) ?? ({ codecs: [] } as import("mediasoup-client").types.RtpParameters),
                    source: typeof payload.source === "string" ? payload.source : undefined,
                  });
                  await manager.resumeConsumer(consumer.id);
                  sendSignal("CONSUMER_RESUME", { consumerId: consumer.id });

                  const peerId = typeof payload.peerId === "string" ? payload.peerId : "";
                  const participantId = peerId.includes(":") ? peerId.split(":")[0] : peerId;
                  if (participantId) {
                    upsertRemoteTrack(participantId, consumer.track);
                  }
                } catch (error) {
                  logger.warn("group_call.consume_failed", { error, roomId });
                }
              })();
            }
            return;
          }

          const participantIdRaw = typeof payload.participantId === "string"
            ? payload.participantId
            : msg.participantId;
          const participantId = typeof participantIdRaw === "string" && participantIdRaw.trim().length > 0
            ? participantIdRaw
            : null;
          const speaking = typeof payload.speaking === "boolean"
            ? payload.speaking
            : msg.speaking;
          const streamAction = payload.streamAction === "upsert" || payload.streamAction === "remove"
            ? payload.streamAction
            : msg.streamAction;
          const hasVideo = typeof payload.hasVideo === "boolean"
            ? payload.hasVideo
            : msg.hasVideo;
          const stream = payload.stream instanceof MediaStream
            ? payload.stream
            : (msg.stream instanceof MediaStream || msg.stream === null ? msg.stream : undefined);

          switch (msg.type) {
            case "participant-speaking":
              if (participantId && typeof speaking === "boolean") {
                setState(s => {
                  const existing = s.participants.find((p) => p.id === participantId) ?? null;
                  const nextParticipant: Participant = existing
                    ? { ...existing, isSpeaking: speaking }
                    : {
                        id: participantId,
                        displayName: "Участник",
                        avatarUrl: null,
                        stream: null,
                        isMuted: false,
                        isCameraOff: true,
                        isScreenSharing: false,
                        isHandRaised: false,
                        isSpeaking: speaking,
                      };

                  return {
                    ...s,
                    activeSpeakerId: speaking
                      ? participantId
                      : (s.activeSpeakerId === participantId ? null : s.activeSpeakerId),
                    participants: existing
                      ? s.participants.map((p) => (p.id === participantId ? nextParticipant : p))
                      : [...s.participants, nextParticipant],
                  };
                });
              }
              break;
            case "participant-stream":
              if (participantId) {
                const hasStreamPayload = stream instanceof MediaStream || stream === null;
                const hasStreamActionPayload = streamAction === "upsert" || streamAction === "remove";
                const hasVideoPayload = typeof hasVideo === "boolean";
                if (!hasStreamPayload && !hasStreamActionPayload && !hasVideoPayload) {
                  break;
                }

                setState(s => {
                  const existing = s.participants.find((p) => p.id === participantId) ?? null;
                  const shouldRemoveStream = streamAction === "remove" || stream === null;
                  if (!existing && shouldRemoveStream) {
                    return s;
                  }

                  const streamFromPayload = stream instanceof MediaStream
                    ? stream
                    : stream === null
                      ? null
                      : undefined;
                  const nextStream = shouldRemoveStream
                    ? null
                    : (streamFromPayload !== undefined ? streamFromPayload : (existing?.stream ?? null));
                  const resolvedHasVideo = streamFromPayload
                    ? streamFromPayload.getVideoTracks().length > 0
                    : typeof hasVideo === "boolean"
                      ? hasVideo
                      : (nextStream ? nextStream.getVideoTracks().length > 0 : false);
                  const nextParticipant: Participant = existing
                    ? {
                        ...existing,
                        stream: nextStream,
                        isCameraOff: !resolvedHasVideo,
                      }
                    : {
                      id: participantId,
                        displayName: "Участник",
                        avatarUrl: null,
                        stream: nextStream,
                        isMuted: false,
                        isCameraOff: !resolvedHasVideo,
                        isScreenSharing: false,
                        isHandRaised: false,
                        isSpeaking: false,
                      };

                  return {
                    ...s,
                    participants: existing
                      ? s.participants.map((p) => (p.id === participantId ? nextParticipant : p))
                      : [...s.participants, nextParticipant],
                  };
                });
              }
              break;
          }
        } catch (error) {
          logger.warn("group_call.ws_message_malformed", { error });
        }
      };

      ws.onerror = () => {
        setState(s => ({ ...s, error: "Ошибка соединения с сервером звонков" }));
      };

      ws.onclose = () => {
        if (!joinResolved) {
          rejectJoin("Соединение закрыто до завершения ROOM_JOIN");
        }
        rejectPendingSignalWaiters("WebSocket closed");
        const wasManualClose = manualWsCloseRef.current;
        manualWsCloseRef.current = false;

        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }

        vadRef.current?.stop();
        vadRef.current = null;

        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;

        realtimeChannelRef.current?.untrack();
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }

        wsRef.current = null;
        sfuManagerRef.current?.close();
        sfuManagerRef.current = null;
        localProducerIdsRef.current = { audio: null, video: null };
        routerCapsRef.current = null;

        setState({
          participants: [],
          localStream: null,
          screenStream: null,
          isMuted: false,
          isCameraOn: true,
          isScreenSharing: false,
          isHandRaised: false,
          activeSpeakerId: null,
          pinnedParticipantId: null,
          duration: 0,
          isJoined: false,
          isJoining: false,
          error: wasManualClose ? null : "Соединение с сервером звонков разорвано",
        });
      };

      const joinTimeout = window.setTimeout(() => {
        rejectJoin("Таймаут ROOM_JOIN");
      }, 10000);
      await joinReadyPromise;
      window.clearTimeout(joinTimeout);

      await bootstrapSfuMedia(stream).catch((error) => {
        logger.warn("group_call.sfu_media_bootstrap_failed", { error, roomId });
      });

      // 5. Таймер длительности звонка
      startTimeRef.current = Date.now();
      durationTimerRef.current = setInterval(() => {
        setState(s => ({ ...s, duration: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
      }, 1000);

      setState(s => ({
        ...s,
        localStream: stream,
        isJoined: true,
        isJoining: false,
        isCameraOn: stream.getVideoTracks().length > 0,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось подключиться к звонку";

      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }

      vadRef.current?.stop();
      vadRef.current = null;

      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      wsRef.current?.close();
      wsRef.current = null;
      rejectPendingSignalWaiters("joinCall failed");
      sfuManagerRef.current?.close();
      sfuManagerRef.current = null;
      localProducerIdsRef.current = { audio: null, video: null };
      routerCapsRef.current = null;
      manualWsCloseRef.current = false;

      const channelToCleanup = realtimeChannelRef.current ?? pendingRealtimeChannel;
      channelToCleanup?.untrack();
      if (channelToCleanup) {
        supabase.removeChannel(channelToCleanup);
      }
      realtimeChannelRef.current = null;

      setState(s => ({
        ...s,
        participants: [],
        localStream: null,
        screenStream: null,
        isScreenSharing: false,
        isJoined: false,
        isJoining: false,
        duration: 0,
        error: msg,
      }));
    }
  }, [user?.id, roomId, state.isJoined, state.isJoining, sendSignal]);

  // ---------------------------------------------------------------------------
  // leaveCall
  // ---------------------------------------------------------------------------

  const leaveCall = useCallback(() => {
    // Остановить таймер
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    // VAD
    vadRef.current?.stop();
    vadRef.current = null;

    // Остановить медиа треки
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    // WS
    manualWsCloseRef.current = true;
    sendSignal("ROOM_LEAVE", { reason: "client_leave" });
    wsRef.current?.close();
    wsRef.current = null;
    rejectPendingSignalWaiters("leaveCall");
    sfuManagerRef.current?.close();
    sfuManagerRef.current = null;
    localProducerIdsRef.current = { audio: null, video: null };
    routerCapsRef.current = null;

    // Presence
    realtimeChannelRef.current?.untrack();
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    setState({
      participants: [],
      localStream: null,
      screenStream: null,
      isMuted: false,
      isCameraOn: true,
      isScreenSharing: false,
      isHandRaised: false,
      activeSpeakerId: null,
      pinnedParticipantId: null,
      duration: 0,
      isJoined: false,
      isJoining: false,
      error: null,
    });
  }, [rejectPendingSignalWaiters, sendSignal]);

  // ---------------------------------------------------------------------------
  // toggleMute
  // ---------------------------------------------------------------------------

  const toggleMute = useCallback(() => {
    setState(s => {
      const newMuted = !s.isMuted;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      syncPresence({ isMuted: newMuted });
      return { ...s, isMuted: newMuted };
    });
  }, [syncPresence]);

  // ---------------------------------------------------------------------------
  // toggleCamera
  // ---------------------------------------------------------------------------

  const toggleCamera = useCallback(() => {
    setState(s => {
      const newCameraOn = !s.isCameraOn;
      localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newCameraOn; });
      syncPresence({ isCameraOff: !newCameraOn });
      return { ...s, isCameraOn: newCameraOn };
    });
  }, [syncPresence]);

  // ---------------------------------------------------------------------------
  // toggleScreenShare
  // ---------------------------------------------------------------------------

  const toggleScreenShare = useCallback(async () => {
    if (state.isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setState(s => ({ ...s, isScreenSharing: false, screenStream: null }));
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });

      // Автоматически остановить при нажатии "Стоп" в браузере
      screenStream.getVideoTracks()[0].onended = () => {
        if (screenStreamRef.current !== screenStream) return;
        screenStreamRef.current = null;
        setState(s => ({ ...s, isScreenSharing: false, screenStream: null }));
      };

      screenStreamRef.current = screenStream;
      setState(s => ({ ...s, isScreenSharing: true, screenStream }));
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setState(s => ({ ...s, error: "Не удалось начать демонстрацию экрана" }));
      }
    }
  }, [state.isScreenSharing]);

  // ---------------------------------------------------------------------------
  // raiseHand
  // ---------------------------------------------------------------------------

  const raiseHand = useCallback(() => {
    setState(s => {
      const newHandRaised = !s.isHandRaised;
      syncPresence({ isHandRaised: newHandRaised });
      return { ...s, isHandRaised: newHandRaised };
    });
  }, [syncPresence]);

  // ---------------------------------------------------------------------------
  // pinParticipant
  // ---------------------------------------------------------------------------

  const pinParticipant = useCallback((id: string | null) => {
    setState(s => ({
      ...s,
      pinnedParticipantId: s.pinnedParticipantId === id ? null : id,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // addParticipant — приглашение через push-уведомление + Realtime
  // ---------------------------------------------------------------------------

  const addParticipant = useCallback(async (userId: string) => {
    if (!user?.id) return;
    // Валидация: нельзя пригласить себя
    if (userId === user.id) return;

    const { error } = await supabase.functions.invoke("group-call-invite", {
      body: { roomId, inviteeId: userId },
    });

    if (error) {
      setState(s => ({ ...s, error: "Не удалось пригласить участника" }));
    }
  }, [roomId, user?.id]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const leaveCallRef = useRef(leaveCall);
  useEffect(() => { leaveCallRef.current = leaveCall; }, [leaveCall]);

  useEffect(() => {
    return () => {
      if (stateRef.current.isJoined) leaveCallRef.current();
    };
  }, []);

  return {
    ...state,
    joinCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    raiseHand,
    pinParticipant,
    addParticipant,
  };
}
