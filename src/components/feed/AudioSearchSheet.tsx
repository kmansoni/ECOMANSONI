/**
 * @file src/components/feed/AudioSearchSheet.tsx
 * @description Поиск по аудио — Instagram Audio Search стиль.
 * Поиск Reels и Stories по треку/исполнителю.
 *
 * Архитектура:
 * - Поиск по music_tracks (title, artist)
 * - Для каждого трека: список Reels использующих этот трек
 * - Trending audio: топ треков по количеству использований
 * - Tap на трек → страница трека с лентой Reels
 * - Использование трека в новом Reel
 */

import { useState, useEffect, useRef } from "react";
import { Search, Music, TrendingUp, Play, Pause, ChevronRight, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dbLoose } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover_url: string | null;
  audio_url: string;
  use_count: number;
}

interface AudioSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack?: (track: AudioTrack) => void;
  mode?: "search" | "select"; // search = навигация, select = выбор для Reel
}

export function AudioSearchSheet({ isOpen, onClose, onSelectTrack, mode = "search" }: AudioSearchSheetProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AudioTrack[]>([]);
  const [trending, setTrending] = useState<AudioTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) loadTrending();
    return () => {
      audioRef.current?.pause();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [isOpen]);

  const loadTrending = async () => {
    const { data } = await dbLoose
      .from("music_tracks")
      .select("id, title, artist, duration, cover_url, audio_url, use_count")
      .order("use_count", { ascending: false })
      .limit(15);
    setTrending((data ?? []) as AudioTrack[]);
  };

  const handleSearch = (q: string) => {
    setQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) { setResults([]); return; }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      const { data } = await dbLoose
        .from("music_tracks")
        .select("id, title, artist, duration, cover_url, audio_url, use_count")
        .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
        .order("use_count", { ascending: false })
        .limit(20);
      setResults((data ?? []) as AudioTrack[]);
      setIsLoading(false);
    }, 300);
  };

  const handlePlayPreview = (track: AudioTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(track.audio_url);
    audio.volume = 0.7;
    audio.play().catch(() => { /* autoplay blocked */ });
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const handleTrackPress = (track: AudioTrack) => {
    if (mode === "select" && onSelectTrack) {
      audioRef.current?.pause();
      onSelectTrack(track);
      onClose();
    } else {
      navigate(`/audio-track/${track.id}`);
      onClose();
    }
  };

  const displayTracks = query.trim() ? results : trending;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            {mode === "select" ? "Выбрать аудио" : "Поиск по аудио"}
          </SheetTitle>
        </SheetHeader>

        {/* Поиск */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск треков и исполнителей..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
        </div>

        {/* Заголовок секции */}
        {!query.trim() && (
          <div className="flex items-center gap-2 mt-4 mb-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">Популярные треки</span>
          </div>
        )}

        {/* Список треков */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-3 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded animate-pulse mb-1 w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayTracks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Mic className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {query.trim() ? "Треки не найдены" : "Нет популярных треков"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {displayTracks.map((track, i) => (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleTrackPress(track)}
                >
                  {/* Обложка */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    {track.cover_url ? (
                      <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Music className="w-5 h-5 text-white" />
                      </div>
                    )}

                    {/* Анимация воспроизведения */}
                    {playingId === track.id && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex gap-0.5 items-end h-4">
                          {[1, 2, 3].map((b) => (
                            <div
                              key={b}
                              className="w-1 bg-white rounded-full animate-bounce"
                              style={{
                                height: `${8 + b * 4}px`,
                                animationDelay: `${b * 0.1}s`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Инфо */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
                      {track.use_count > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {track.use_count.toLocaleString()} Reels
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Кнопка превью */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePlayPreview(track); }}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
                  >
                    {playingId === track.id ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>

                  {mode === "search" && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
