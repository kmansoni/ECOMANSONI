import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { logger } from "@/lib/logger";

interface UseVoiceMediaArgs {
  conversationId: string;
  sendMediaMessage: (file: File, type: string, duration?: number) => Promise<unknown>;
  typingOnKeyDown: () => void;
  typingOnStop: () => void;
}

export function useVoiceMedia({ conversationId, sendMediaMessage, typingOnKeyDown, typingOnStop }: UseVoiceMediaArgs) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [voicePlaybackRate, setVoicePlaybackRate] = useState<number>(1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingMimeTypeRef = useRef<string | null>(null);
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync with state for use inside onstop callback
  useEffect(() => {
    recordingTimeRef.current = recordingTime;
  }, [recordingTime]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingInterval.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      setRecordingTime(0);
    }
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];

      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      recordingMimeTypeRef.current = mimeType || null;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      typingOnKeyDown();
    } catch (err) {
      logger.warn("chat: failed to start recording", { conversationId, error: err });
    }
  }, [conversationId, typingOnKeyDown]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const duration = recordingTimeRef.current;

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const mimeType = recordingMimeTypeRef.current || mediaRecorderRef.current?.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (duration > 0) {
          const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });
          await sendMediaMessage(file, "voice", duration);
        }

        mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
        resolve();
      };

      mediaRecorderRef.current!.stop();
      setIsRecording(false);
      typingOnStop();
    });
  }, [isRecording, sendMediaMessage, typingOnStop]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    typingOnStop();
  }, [typingOnStop]);

  const toggleVoicePlay = useCallback(
    async (messageId: string, mediaUrl?: string) => {
      if (playingVoice === messageId) {
        audioRef.current?.pause();
        setPlayingVoice(null);
      } else {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (mediaUrl) {
          try {
            const audio = new Audio(mediaUrl);
            audio.onended = () => setPlayingVoice(null);
            audio.onerror = (e) => {
              logger.warn("chat: audio playback error", { conversationId, messageId, error: e });
              setPlayingVoice(null);
            };
            await audio.play();
            audioRef.current = audio;
            audio.playbackRate = voicePlaybackRate;
            setPlayingVoice(messageId);
          } catch (error) {
            logger.warn("chat: failed to play audio", { conversationId, messageId, error });
            setPlayingVoice(null);
          }
        }
      }
    },
    [conversationId, playingVoice, voicePlaybackRate],
  );

  const cycleVoiceSpeed = useCallback(() => {
    const speeds = [1, 1.5, 2];
    const currentIdx = speeds.indexOf(voicePlaybackRate);
    const nextRate = speeds[(currentIdx + 1) % speeds.length];
    setVoicePlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }, [voicePlaybackRate]);

  const getWaveformHeights = useMemo(() => {
    const cache: Record<string, number[]> = {};
    return (messageId: string): number[] => {
      if (!cache[messageId]) {
        const heights: number[] = [];
        let seed = messageId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        for (let i = 0; i < 20; i++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          heights.push((seed % 16) + 8);
        }
        cache[messageId] = heights;
      }
      return cache[messageId];
    };
  }, []);

  return {
    isRecording,
    recordingTime,
    playingVoice,
    voicePlaybackRate,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleVoicePlay,
    cycleVoiceSpeed,
    getWaveformHeights,
  };
}
