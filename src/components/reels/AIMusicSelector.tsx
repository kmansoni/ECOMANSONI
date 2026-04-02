/**
 * AIMusicSelector — выбор AI-музыки для Reels.
 * Mood picker, genre, duration slider, превью + кнопка "Использовать".
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, X, Play, Pause, Loader2, Check } from "lucide-react";
import { useAIMusic, type MoodType, type GenreType, MOOD_OPTIONS, GENRE_OPTIONS } from "@/hooks/useAIMusic";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface AIMusicSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, title: string, duration: number) => void;
}

export function AIMusicSelector({ open, onClose, onSelect }: AIMusicSelectorProps) {
  const { generate, isGenerating, lastTrack } = useAIMusic();
  const [mood, setMood] = useState<MoodType>("happy");
  const [genre, setGenre] = useState<GenreType>("pop");
  const [duration, setDuration] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = useCallback(async () => {
    // Останавливаем текущее превью
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    await generate(mood, duration, genre);
  }, [generate, mood, duration, genre]);

  const handlePreview = useCallback(() => {
    if (!lastTrack?.url) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(lastTrack.url);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = lastTrack.url;
      void audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  }, [lastTrack, isPlaying]);

  const handleSelect = useCallback(() => {
    if (!lastTrack?.url) return;
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onSelect(lastTrack.url, lastTrack.title, lastTrack.duration);
    onClose();
  }, [lastTrack, onSelect, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="music-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="music-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 pb-6"
          >
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Music className="w-5 h-5 text-purple-400" />
                AI Музыка
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="px-4 pt-4 space-y-5">
              {/* Mood */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Настроение</p>
                <div className="flex gap-2 flex-wrap">
                  {MOOD_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMood(m.value)}
                      className={`px-3 py-2 rounded-full text-sm transition-all min-h-[44px] ${
                        mood === m.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/5 text-foreground hover:bg-white/10"
                      }`}
                      aria-label={`Настроение: ${m.label}`}
                    >
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Genre */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Жанр</p>
                <div className="flex gap-2">
                  {GENRE_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGenre(g.value)}
                      className={`px-3 py-2 rounded-full text-sm transition-all min-h-[44px] ${
                        genre === g.value
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                          : "bg-white/5 text-foreground hover:bg-white/10"
                      }`}
                      aria-label={`Жанр: ${g.label}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Длительность</p>
                  <span className="text-xs text-muted-foreground">{duration} сек</span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={([v]) => setDuration(v)}
                  min={5}
                  max={120}
                  step={5}
                  aria-label="Длительность трека"
                />
              </div>

              {/* Generated track preview */}
              {lastTrack && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <button
                    onClick={handlePreview}
                    className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]"
                    aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-purple-400" />
                    ) : (
                      <Play className="w-5 h-5 text-purple-400 ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lastTrack.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {lastTrack.duration}с · {lastTrack.mood}
                      {lastTrack.isFallback && " · Библиотека"}
                    </p>
                  </div>
                  <Button size="sm" onClick={handleSelect} className="min-h-[44px]" aria-label="Использовать трек">
                    <Check className="w-4 h-4 mr-1" />
                    Выбрать
                  </Button>
                </motion.div>
              )}

              {/* Generate button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full min-h-[48px] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                aria-label="Сгенерировать музыку"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4 mr-2" />
                    Сгенерировать
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
