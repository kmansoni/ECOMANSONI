import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Music, Play, Pause, Check, Loader2 } from 'lucide-react';
import { useMusic, MusicTrack } from '@/hooks/useMusic';

interface MusicPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (track: MusicTrack, startTime: number, duration: number) => void;
}

export function MusicPicker({ open, onClose, onSelect }: MusicPickerProps) {
  const { tracks, trending, loading, search } = useMusic();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MusicTrack[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(15);
  const audioRef = useRef<HTMLAudioElement>(null);

  const displayTracks = searchResults ?? trending;

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const results = await search(q);
    setSearchResults(results);
    setSearching(false);
  }, [search]);

  const togglePlay = (track: MusicTrack) => {
    if (!audioRef.current) return;
    if (playingId === track.id) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      audioRef.current.src = track.audio_url;
      audioRef.current.currentTime = startTime;
      audioRef.current.play().catch(() => {});
      setPlayingId(track.id);
    }
  };

  const handleConfirm = () => {
    if (!selectedTrack) return;
    onSelect(selectedTrack, startTime, duration);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

            {/* Handle */}
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-3 mb-0 flex-shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-base font-bold text-white">Выбрать музыку</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Поиск треков..."
                  className="w-full bg-zinc-800 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none border border-zinc-700 focus:border-zinc-500"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />}
              </div>
            </div>

            {/* Track list */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {!query && (
                <p className="text-xs text-zinc-500 font-medium mb-3">В тренде</p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {displayTracks.map(track => (
                    <div
                      key={track.id}
                      onClick={() => setSelectedTrack(track)}
                      className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors ${
                        selectedTrack?.id === track.id
                          ? 'bg-zinc-700 border border-zinc-600'
                          : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
                      }`}
                    >
                      {/* Cover */}
                      <div className="w-11 h-11 rounded-lg bg-zinc-700 flex-shrink-0 overflow-hidden">
                        {track.cover_url ? (
                          <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-zinc-500" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{track.title}</p>
                        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Play button */}
                        <button
                          onClick={e => { e.stopPropagation(); togglePlay(track); }}
                          className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"
                        >
                          {playingId === track.id
                            ? <Pause className="w-3.5 h-3.5 text-white" />
                            : <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                          }
                        </button>

                        {/* Selected */}
                        {selectedTrack?.id === track.id && (
                          <Check className="w-4 h-4 text-green-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trim section & confirm button */}
            {selectedTrack && (
              <div className="border-t border-zinc-800 px-5 py-4 flex-shrink-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Начало (сек)</label>
                    <input
                      type="number"
                      value={startTime}
                      onChange={e => setStartTime(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-zinc-800 text-white rounded-xl px-3 py-2 text-sm outline-none border border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Длина (сек)</label>
                    <input
                      type="number"
                      value={duration}
                      onChange={e => setDuration(Math.max(1, Math.min(60, parseInt(e.target.value) || 15)))}
                      className="w-full bg-zinc-800 text-white rounded-xl px-3 py-2 text-sm outline-none border border-zinc-700"
                    />
                  </div>
                </div>
                <button
                  onClick={handleConfirm}
                  className="w-full bg-white text-black font-semibold py-3 rounded-2xl active:scale-98 transition-transform"
                >
                  Добавить трек
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
