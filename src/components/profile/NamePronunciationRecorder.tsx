import { useState, useRef, useCallback } from "react";
import { Mic, Play, Square, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadMedia } from "@/lib/mediaUpload";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const MAX_DURATION_MS = 10_000;

interface NamePronunciationRecorderProps {
  userId: string;
  existingUrl: string | null;
  onChanged: (url: string | null) => void;
}

export function NamePronunciationRecorder({
  userId,
  existingUrl,
  onChanged,
}: NamePronunciationRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        setRecording(false);

        if (blob.size < 500) {
          toast.error("Запись слишком короткая");
          return;
        }

        try {
          setUploading(true);
          const ext = blob.type.includes("ogg") ? "ogg" : "webm";
          const file = new File([blob], `pronunciation_${userId}.${ext}`, { type: blob.type });
          const result = await uploadMedia(file, { bucket: "voice-messages" });
          const url = result.url;

          const { error } = await supabase
            .from("profiles")
            .update({ name_pronunciation_url: url })
            .eq("user_id", userId);

          if (error) throw error;
          onChanged(url);
          toast.success("Произношение имени сохранено");
        } catch (err) {
          logger.error("[NamePronunciation] upload failed", { error: err });
          toast.error("Не удалось сохранить запись");
        } finally {
          setUploading(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      let ms = 0;
      timerRef.current = setInterval(() => {
        ms += 100;
        setElapsed(ms);
        if (ms >= MAX_DURATION_MS) {
          recorder.stop();
        }
      }, 100);
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  }, [userId, onChanged, cleanup]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const playExisting = useCallback(() => {
    if (!existingUrl) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }
    const audio = new Audio(existingUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play().catch(() => toast.error("Не удалось воспроизвести"));
    setPlaying(true);
  }, [existingUrl, playing]);

  const deletePronunciation = useCallback(async () => {
    try {
      setUploading(true);
      const { error } = await supabase
        .from("profiles")
        .update({ name_pronunciation_url: null })
        .eq("user_id", userId);
      if (error) throw error;
      onChanged(null);
      toast.success("Произношение удалено");
    } catch {
      toast.error("Не удалось удалить");
    } finally {
      setUploading(false);
    }
  }, [userId, onChanged]);

  const seconds = Math.min(Math.floor(elapsed / 1000), 10);

  if (uploading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Сохранение...
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm tabular-nums text-foreground">{seconds}с / 10с</span>
        </div>
        <button
          type="button"
          onClick={stopRecording}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500 text-white"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (existingUrl) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={playExisting}
          className="flex items-center gap-1.5 text-sm text-primary"
        >
          <Play className={`w-4 h-4 ${playing ? "text-green-500" : ""}`} />
          {playing ? "Остановить" : "Прослушать"}
        </button>
        <button
          type="button"
          onClick={deletePronunciation}
          className="flex items-center gap-1 text-sm text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Удалить
        </button>
        <button
          type="button"
          onClick={startRecording}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <Mic className="w-3.5 h-3.5" />
          Перезаписать
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      className="flex items-center gap-1.5 text-sm text-primary"
    >
      <Mic className="w-4 h-4" />
      Записать произношение имени
    </button>
  );
}
