/**
 * @file src/components/reels/ReelAutoCaptions.tsx
 * @description Автоматические субтитры для Reels — Instagram Auto-Captions стиль.
 *
 * Архитектура:
 * - Web Speech API (SpeechRecognition) для real-time транскрипции при записи
 * - Для уже записанных видео: Supabase Edge Function → Whisper API
 * - Субтитры хранятся как JSON массив [{start_ms, end_ms, text}]
 * - Отображение: анимированный текст внизу видео с highlight текущего слова
 * - Редактирование: пользователь может исправить текст перед публикацией
 * - Стили: белый текст с чёрной обводкой (Instagram-стиль)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Captions, Loader2, Check, Pencil, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface Caption {
  start_ms: number;
  end_ms: number;
  text: string;
}

interface ReelAutoCaptionsProps {
  videoUrl?: string;
  currentTimeMs: number;
  captions: Caption[];
  isVisible: boolean;
}

// Отображение субтитров поверх видео
export function ReelCaptionsOverlay({ videoUrl, currentTimeMs, captions, isVisible }: ReelAutoCaptionsProps) {
  if (!isVisible || captions.length === 0) return null;

  const currentCaption = captions.find(
    (c) => currentTimeMs >= c.start_ms && currentTimeMs <= c.end_ms
  );

  return (
    <AnimatePresence mode="wait">
      {currentCaption && (
        <motion.div
          key={currentCaption.start_ms}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-20 left-4 right-4 z-10 flex justify-center"
        >
          <div
            className="text-white text-center text-base font-semibold px-3 py-1 rounded-lg max-w-[90%]"
            style={{
              textShadow: "0 0 4px #000, 0 0 8px #000, 1px 1px 0 #000, -1px -1px 0 #000",
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          >
            {currentCaption.text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Генератор субтитров (для редактора Reel)
interface CaptionGeneratorProps {
  videoFile: File | null;
  videoUrl: string | null;
  onCaptionsGenerated: (captions: Caption[]) => void;
}

export function CaptionGenerator({ videoFile, videoUrl, onCaptionsGenerated }: CaptionGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

  const generateCaptions = async () => {
    if (!videoFile && !videoUrl) return;
    setIsGenerating(true);

    try {
      // Попытка через Web Speech API (только для live recording)
      // Для загруженных видео — через Edge Function с Whisper
      if (videoFile) {
        const formData = new FormData();
        formData.append("file", videoFile);
        formData.append("language", "ru");

        const { data, error } = await (supabase as any).functions.invoke("transcribe-video", {
          body: formData,
        });

        if (error) throw error;

        const generatedCaptions: Caption[] = data?.captions ?? [];
        setCaptions(generatedCaptions);
        onCaptionsGenerated(generatedCaptions);
        setCaptionsEnabled(true);
        toast.success("Субтитры сгенерированы");
      } else {
        // Fallback: пустые субтитры для ручного ввода
        toast.info("Введите субтитры вручную");
        setIsEditing(true);
      }
    } catch (err) {
      // Fallback: ручной ввод
      toast.info("Автогенерация недоступна. Введите субтитры вручную.");
      setIsEditing(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualSave = () => {
    if (!editText.trim()) return;
    // Простое разбиение на предложения с равномерным распределением времени
    const sentences = editText.split(/[.!?]+/).filter((s) => s.trim());
    const videoDuration = 15000; // default 15s
    const perSentence = videoDuration / sentences.length;

    const manualCaptions: Caption[] = sentences.map((text, i) => ({
      start_ms: Math.round(i * perSentence),
      end_ms: Math.round((i + 1) * perSentence - 100),
      text: text.trim(),
    }));

    setCaptions(manualCaptions);
    onCaptionsGenerated(manualCaptions);
    setCaptionsEnabled(true);
    setIsEditing(false);
    toast.success("Субтитры добавлены");
  };

  const handleToggle = () => {
    if (!captionsEnabled) {
      generateCaptions();
    } else {
      setCaptionsEnabled(false);
      onCaptionsGenerated([]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Переключатель субтитров */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Captions className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Субтитры</span>
        </div>
        <button
          onClick={handleToggle}
          disabled={isGenerating}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors",
            captionsEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
              captionsEnabled ? "translate-x-7" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {/* Статус генерации */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Генерация субтитров...</span>
        </div>
      )}

      {/* Сгенерированные субтитры */}
      {captionsEnabled && captions.length > 0 && !isEditing && (
        <div className="bg-muted/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{captions.length} фраз</span>
            <button
              onClick={() => {
                setEditText(captions.map((c) => c.text).join(". "));
                setIsEditing(true);
              }}
              className="flex items-center gap-1 text-xs text-primary"
            >
              <Pencil className="w-3 h-3" />
              Редактировать
            </button>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {captions.map((c) => c.text).join(" ")}
          </p>
        </div>
      )}

      {/* Ручной ввод */}
      {isEditing && (
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder="Введите текст субтитров..."
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="resize-none min-h-[80px] text-sm"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="flex-1">
              <X className="w-3 h-3 mr-1" />
              Отмена
            </Button>
            <Button size="sm" onClick={handleManualSave} disabled={!editText.trim()} className="flex-1">
              <Check className="w-3 h-3 mr-1" />
              Сохранить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Real-time субтитры при записи через Web Speech API
export function useLiveCaptions(isRecording: boolean) {
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition || !isRecording) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ru-RU";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final || interim);
    };

    recognition.onerror = () => {
      // Keep current transcript and stop silently on speech API errors.
      setIsRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Speech API can throw if called before user gesture / unsupported browser.
      setIsRecording(false);
    }

    return () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop race when recognition is already stopped.
      }
    };
  }, [isRecording]);

  return { transcript };
}
