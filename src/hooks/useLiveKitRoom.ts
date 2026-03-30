/**
 * useLiveKitRoom — LiveKit Room lifecycle hook.
 *
 * Manages Room creation, connection, event subscriptions,
 * media track toggling, and deterministic cleanup on unmount.
 *
 * Uses livekit-client Room class directly (not @livekit/components-react)
 * to maintain full control over connection state machine.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
} from 'livekit-client';

export interface UseLiveKitRoomOptions {
  token: string | null;
  serverUrl: string | null;
  role: 'publisher' | 'viewer' | 'guest';
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface UseLiveKitRoomReturn {
  room: Room | null;
  localParticipant: LocalParticipant | null;
  remoteParticipants: RemoteParticipant[];
  connectionState: ConnectionState;
  isConnected: boolean;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  activeSpeakers: Participant[];
  audioTracks: LocalTrackPublication[];
  videoTracks: LocalTrackPublication[];
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  switchCamera: () => Promise<void>;
  disconnect: () => void;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

/**
 * Manages a LiveKit Room for publisher, viewer, or guest roles.
 * Auto-connects when `token` and `serverUrl` are non-null.
 * Retries connection up to 3 times on transient failure.
 * Cleans up on unmount or when token/serverUrl change.
 */
export function useLiveKitRoom(options: UseLiveKitRoomOptions): UseLiveKitRoomReturn {
  const { token, serverUrl, role, onConnect, onDisconnect, onError } = options;

  const roomRef = useRef<Room | null>(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);

  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  useEffect(() => { onConnectRef.current = onConnect; });
  useEffect(() => { onDisconnectRef.current = onDisconnect; });
  useEffect(() => { onErrorRef.current = onError; });

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<Participant[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(false);
  const [audioTracks, setAudioTracks] = useState<LocalTrackPublication[]>([]);
  const [videoTracks, setVideoTracks] = useState<LocalTrackPublication[]>([]);

  const syncLocalTracks = useCallback((lp: LocalParticipant) => {
    const audio: LocalTrackPublication[] = [];
    const video: LocalTrackPublication[] = [];
    lp.trackPublications.forEach((pub) => {
      if (pub.kind === Track.Kind.Audio) audio.push(pub);
      if (pub.kind === Track.Kind.Video) video.push(pub);
    });
    setAudioTracks(audio);
    setVideoTracks(video);
    setIsMicEnabled(lp.isMicrophoneEnabled);
    setIsCameraEnabled(lp.isCameraEnabled);
    setIsScreenShareEnabled(lp.isScreenShareEnabled);
  }, []);

  const syncRemoteParticipants = useCallback((room: Room) => {
    setRemoteParticipants(Array.from(room.remoteParticipants.values()));
  }, []);

  const connectRoom = useCallback(
    async (room: Room, wsUrl: string, jwt: string) => {
      try {
        await room.connect(wsUrl, jwt, {
          autoSubscribe: true,
        });
        retryCountRef.current = 0;
      } catch (err) {
        if (unmountedRef.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        onErrorRef.current?.(error);
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * retryCountRef.current));
          if (!unmountedRef.current) {
            void connectRoom(room, wsUrl, jwt);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    unmountedRef.current = false;

    if (!token || !serverUrl) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
    });

    roomRef.current = room;

    // ── Event bindings ───────────────────────────────────────────────────────

    room.on(RoomEvent.Connected, async () => {
      if (unmountedRef.current) return;
      setConnectionState(ConnectionState.Connected);
      setLocalParticipant(room.localParticipant);
      syncRemoteParticipants(room);
      syncLocalTracks(room.localParticipant);
      onConnectRef.current?.();

      // Auto-enable camera+mic for publisher / guest after state is synced
      if (role === 'publisher' || role === 'guest') {
        try {
          await room.localParticipant.enableCameraAndMicrophone();
          syncLocalTracks(room.localParticipant);
        } catch {
          // Graceful: permissions denied or no device — viewer continues without media
        }
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      if (unmountedRef.current) return;
      setConnectionState(ConnectionState.Disconnected);
      setLocalParticipant(null);
      setRemoteParticipants([]);
      setActiveSpeakers([]);
      onDisconnectRef.current?.();
    });

    room.on(RoomEvent.Reconnecting, () => {
      if (!unmountedRef.current) setConnectionState(ConnectionState.Reconnecting);
    });

    room.on(RoomEvent.Reconnected, () => {
      if (!unmountedRef.current) {
        setConnectionState(ConnectionState.Connected);
        syncRemoteParticipants(room);
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      if (!unmountedRef.current) syncRemoteParticipants(room);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (!unmountedRef.current) syncRemoteParticipants(room);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (!unmountedRef.current) setActiveSpeakers(speakers);
    });

    room.on(RoomEvent.TrackSubscribed, () => {
      if (!unmountedRef.current) syncRemoteParticipants(room);
    });

    room.on(RoomEvent.LocalTrackPublished, () => {
      if (!unmountedRef.current) syncLocalTracks(room.localParticipant);
    });

    room.on(RoomEvent.LocalTrackUnpublished, () => {
      if (!unmountedRef.current) syncLocalTracks(room.localParticipant);
    });

    void connectRoom(room, serverUrl, token);

    return () => {
      unmountedRef.current = true;
      room.removeAllListeners();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [token, serverUrl, role, connectRoom, syncLocalTracks, syncRemoteParticipants]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
    setIsMicEnabled(lp.isMicrophoneEnabled);
    if (roomRef.current) syncLocalTracks(lp);
  }, [syncLocalTracks]);

  const toggleCamera = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    await lp.setCameraEnabled(!lp.isCameraEnabled);
    setIsCameraEnabled(lp.isCameraEnabled);
    if (roomRef.current) syncLocalTracks(lp);
  }, [syncLocalTracks]);

  const toggleScreenShare = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    await lp.setScreenShareEnabled(!lp.isScreenShareEnabled);
    setIsScreenShareEnabled(lp.isScreenShareEnabled);
    if (roomRef.current) syncLocalTracks(lp);
  }, [syncLocalTracks]);

  const switchCamera = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const room = roomRef.current;
    if (!room) return;
    const devices = await Room.getLocalDevices('videoinput');
    if (devices.length < 2) return;
    const current = lp.getTrackPublication(Track.Source.Camera);
    const currentDeviceId = current?.track?.mediaStreamTrack.getSettings().deviceId;
    const next = devices.find((d) => d.deviceId !== currentDeviceId) ?? devices[0];
    await room.switchActiveDevice('videoinput', next.deviceId);
  }, []);

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect();
  }, []);

  return {
    room: roomRef.current,
    localParticipant,
    remoteParticipants,
    connectionState,
    isConnected: connectionState === ConnectionState.Connected,
    isMicEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    activeSpeakers,
    audioTracks,
    videoTracks,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    switchCamera,
    disconnect,
  };
}
