import { useRef, useEffect, useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  Shuffle,
  ListMusic
} from 'lucide-react';
import { useMusicStore, type Track } from '../store/useMusicStore';
import { getCachedTrackObjectUrl } from '../lib/offlineAudioCache';
import { getAuthToken, getSupabaseClient } from '../lib/supabase';

interface AudioPlayerProps {
  className?: string;
}

export default function AudioPlayer({ className = '' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const playRecordedRef = useRef<string | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    queue,
    playTrack,
    pauseTrack,
    resumeTrack,
    setVolume,
    addToQueue,
  } = useMusicStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Format time as MM:SS
  function formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Handle track change
  useEffect(() => {
    let isActive = true;

    async function prepareTrackSource() {
      if (!currentTrack || !audioRef.current) {
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const cachedUrl = await getCachedTrackObjectUrl(currentTrack.id);
      if (!isActive || !audioRef.current) {
        if (cachedUrl) {
          URL.revokeObjectURL(cachedUrl);
        }
        return;
      }

      if (cachedUrl) {
        objectUrlRef.current = cachedUrl;
      }

      audioRef.current.src = cachedUrl || currentTrack.audioUrl;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(console.error);
      }
    }

    prepareTrackSource().catch(console.error);

    return () => {
      isActive = false;
    };
  }, [currentTrack, isPlaying]);

  // Handle play/pause
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Handle volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Audio event handlers
  function handleTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);

      if (
        currentTrack &&
        getAuthToken() &&
        playRecordedRef.current !== currentTrack.id &&
        audioRef.current.currentTime >= 15
      ) {
        playRecordedRef.current = currentTrack.id;
        void (async () => {
          try {
            await getSupabaseClient().rpc('record_track_play', {
              p_track_id: currentTrack.id,
              p_duration_ms: Math.round(audioRef.current!.currentTime * 1000),
              p_device: 'web',
              p_completed: false,
            });
          } catch (error) {
            console.warn(error);
          }
        })();
      }
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }

  function handleEnded() {
    if (currentTrack && getAuthToken()) {
      void (async () => {
        try {
          await getSupabaseClient().rpc('record_track_play', {
            p_track_id: currentTrack.id,
            p_duration_ms: Math.round((audioRef.current?.duration || 0) * 1000),
            p_device: 'web',
            p_completed: true,
          });
        } catch (error) {
          console.warn(error);
        }
      })();
    }

    if (isRepeat && currentTrack) {
      // Repeat current track
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
    } else if (queue.length > 1) {
      // Play next track in queue
      const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
      if (currentIndex !== -1 && currentIndex < queue.length - 1) {
        const nextIndex = isShuffle 
          ? Math.floor(Math.random() * queue.length)
          : currentIndex + 1;
        playTrack(queue[nextIndex]);
      } else {
        pauseTrack();
      }
    } else {
      pauseTrack();
    }
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(false);
  }

  function handlePrevious() {
    if (!currentTrack || queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentTime > 3) {
      // Restart current track if more than 3 seconds played
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    } else if (currentIndex > 0) {
      playTrack(queue[currentIndex - 1]);
    }
  }

  function handleNext() {
    if (!currentTrack || queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    let nextIndex: number;
    
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (currentIndex >= queue.length - 1) {
      nextIndex = 0; // Loop back to start
    } else {
      nextIndex = currentIndex + 1;
    }
    
    playTrack(queue[nextIndex]);
  }

  if (!currentTrack) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-700/50 ${className}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        crossOrigin="anonymous"
      />
      
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Progress bar (mobile) */}
        <div className="md:hidden mb-3">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full"
            style={{
              background: `linear-gradient(to right, #a855f7 ${progress}%, #334155 ${progress}%)`
            }}
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Track info */}
          <div className="flex items-center gap-3 min-w-0 flex-1 max-w-xs">
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.album}
              className="w-12 h-12 rounded object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {currentTrack.artist}
              </p>
            </div>
          </div>

          {/* Controls - desktop */}
          <div className="hidden md:flex flex-col items-center flex-1">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-2 rounded-full transition-colors ${
                  isShuffle ? 'text-purple-400' : 'text-slate-400 hover:text-white'
                }`}
                title="Перемешать"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              
              <button
                onClick={handlePrevious}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Предыдущий"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              
              <button
                onClick={isPlaying ? pauseTrack : resumeTrack}
                className="p-3 bg-white text-black rounded-full hover:scale-105 transition-transform"
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
              
              <button
                onClick={handleNext}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Следующий"
              >
                <SkipForward className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => setIsRepeat(!isRepeat)}
                className={`p-2 rounded-full transition-colors ${
                  isRepeat ? 'text-purple-400' : 'text-slate-400 hover:text-white'
                }`}
                title="Повторять"
              >
                <Repeat className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar - desktop */}
            <div className="flex items-center gap-2 w-full max-w-xl mt-2">
              <span className="text-xs text-slate-400 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                style={{
                  background: `linear-gradient(to right, #a855f7 ${progress}%, #334155 ${progress}%)`
                }}
              />
              <span className="text-xs text-slate-400 w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Volume & extras - right side */}
          <div className="hidden md:flex items-center gap-3 flex-1 justify-end">
            <button
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="Очередь"
            >
              <ListMusic className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title={isMuted ? 'Включить звук' : 'Выключить звук'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                style={{
                  background: `linear-gradient(to right, #a855f7 ${(isMuted ? 0 : volume) * 100}%, #334155 ${(isMuted ? 0 : volume) * 100}%)`
                }}
              />
            </div>
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-2 flex-shrink-0">
            <button
              onClick={isPlaying ? pauseTrack : resumeTrack}
              className="p-3 bg-white text-black rounded-full"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={handleNext}
              className="p-2 text-slate-300"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}