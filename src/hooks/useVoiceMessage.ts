import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadMedia } from '@/lib/mediaUpload';
import { logger } from '@/lib/logger';

interface VoiceRecordingResult {
  blob: Blob;
  duration: number;
  waveform: number[];
}

export function useVoiceMessage() {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformDataRef = useRef<number[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      waveformDataRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setDuration(0);
      setWaveform([]);

      // Таймер длительности
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Анимация waveform
      const captureWaveform = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = Array.from(data).slice(0, 32).reduce((a, b) => a + b, 0) / 32;
        const normalized = avg / 255;
        waveformDataRef.current.push(normalized);
        setWaveform([...waveformDataRef.current.slice(-50)]);
        animFrameRef.current = requestAnimationFrame(captureWaveform);
      };
      captureWaveform();
    } catch (err) {
      logger.error('[useVoiceMessage] Ошибка доступа к микрофону', { error: err });
    }
  }, []);

  const stopRecording = useCallback((): Promise<VoiceRecordingResult> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;

      cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);

      const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const finalWaveform = [...waveformDataRef.current];

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        cleanupStream();
        setIsRecording(false);
        setDuration(0);
        resolve({ blob, duration: durationSeconds, waveform: finalWaveform });
      };

      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    cleanupStream();
    setIsRecording(false);
    setDuration(0);
    setWaveform([]);
  }, []);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const sendVoiceMessage = useCallback(
    async (conversationId: string, blob: Blob, dur: number, wfm: number[]) => {
      if (!user) throw new Error('Не авторизован');

      const result = await uploadMedia(blob, { bucket: 'voice-messages' });
      const audioUrl = result.url;

      // Создаём сообщение
      const { data: message, error: msgError } = await (supabase as any)
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: '🎤 Голосовое сообщение',
          media_type: 'voice',
          media_url: audioUrl,
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // Создаём запись голосового сообщения
      const { data: voiceMsg, error: voiceError } = await (supabase as any)
        .from('voice_messages')
        .insert({
          message_id: message.id,
          sender_id: user.id,
          conversation_id: conversationId,
          audio_url: audioUrl,
          duration_seconds: dur,
          waveform: wfm,
        })
        .select()
        .single();

      if (voiceError) throw voiceError;
      return voiceMsg;
    },
    [user]
  );

  const playVoiceMessage = useCallback((audioUrl: string, id: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setCurrentPlayingId(id);
    setIsPlaying(true);
    setPlaybackProgress(0);

    audio.ontimeupdate = () => {
      if (audio.duration) {
        setPlaybackProgress(audio.currentTime / audio.duration);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
      setCurrentPlayingId(null);
    };

    audio.play().catch(() => {
      setIsPlaying(false);
      setCurrentPlayingId(null);
    });
  }, []);

  const pauseVoiceMessage = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  // Cleanup при размонтировании: остановить таймер, анимацию, поток
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
      audioRef.current?.pause();
    };
  }, []);

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording,
    duration,
    waveform,
    sendVoiceMessage,
    playVoiceMessage,
    pauseVoiceMessage,
    isPlaying,
    playbackProgress,
    currentPlayingId,
  };
}
