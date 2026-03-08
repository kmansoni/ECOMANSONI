/**
 * LiveReplay — автосохранение записи эфира через MediaRecorder + Supabase Storage
 */
import React, { useState, useRef, useCallback } from "react";
import { Play, Square, Save, Download, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/mediaUpload";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as any;

interface Props {
  sessionId: string;
  stream: MediaStream | null;
  onSaved?: (url: string) => void;
}

export function LiveReplay({ sessionId, stream, onSaved }: Props) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(() => {
    if (!stream) { toast.error("Нет активного потока"); return; }
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      toast.error("Ошибка запуска записи");
    }
  }, [stream]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const saveRecording = useCallback(async () => {
    if (chunksRef.current.length === 0) { toast.error("Нет записанных данных"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const uploadResult = await uploadMedia(blob, { bucket: 'media' });
      const replayUrl = uploadResult.url;

      // Сохранить ссылку в live_sessions
      await db.from("live_sessions").update({ replay_url: replayUrl }).eq("id", sessionId);

      setSavedUrl(replayUrl);
      onSaved?.(replayUrl);
      toast.success("Запись эфира сохранена!");
    } catch (err: any) {
      toast.error("Ошибка сохранения: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  }, [sessionId, onSaved]);

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      {!savedUrl ? (
        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-600/30 text-red-400 rounded-full text-xs font-medium hover:bg-red-600/30 transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Записать
            </button>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-600/30 text-red-400 rounded-full text-xs font-medium animate-pulse">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                REC {formatDur(duration)}
              </div>
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-white/70 rounded-full text-xs hover:bg-zinc-700"
              >
                <Square className="w-3 h-3" />
                Стоп
              </button>
            </>
          )}

          {!recording && chunksRef.current.length > 0 && (
            <button
              onClick={saveRecording}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/30 text-primary rounded-full text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Сохранить запись
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400 flex items-center gap-1">
            <Play className="w-3 h-3" />
            Запись сохранена
          </span>
          <a
            href={savedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Скачать
          </a>
        </div>
      )}
    </div>
  );
}
