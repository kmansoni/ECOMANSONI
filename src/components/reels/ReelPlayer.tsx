import { Play, Heart } from "lucide-react";

function isProbablyVideoUrl(url: string): boolean {
  const lower = (url || "").toLowerCase();
  if (!lower) return false;
  if (lower.startsWith("blob:") || lower.startsWith("data:video/")) return true;
  if (/\.(mp4|webm|mov|avi|m4v|m3u8)(\?|#|$)/.test(lower)) return true;
  if (lower.includes("content-type=video") || lower.includes("mime=video")) return true;
  if (lower.includes("video/")) return true;
  if (lower.includes("/reels-media/") || lower.includes("/storage/v1/object/public/reels-media/")) return true;
  return false;
}

interface ReelPlayerProps {
  reel: any;
  index: number;
  currentIndex: number;
  isMuted: boolean;
  isPlaying: boolean;
  showHeartAnimation: boolean;
  failedVideoIds: Set<string>;
  onVideoRef: (index: number, el: HTMLVideoElement | null) => void;
  onError: () => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedData: () => void;
  onPlay: () => void;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

export function ReelPlayer({
  reel,
  index,
  currentIndex,
  isMuted,
  isPlaying,
  showHeartAnimation,
  failedVideoIds,
  onVideoRef,
  onError,
  onLoadedMetadata,
  onLoadedData,
  onPlay,
  onTimeUpdate,
}: ReelPlayerProps) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }} role="region" aria-label="Видеоплеер">
      {isProbablyVideoUrl(reel.video_url) && !failedVideoIds.has(reel.id) ? (
        <video
          ref={(el) => onVideoRef(index, el)}
          src={reel.video_url}
          className="w-full h-full"
          aria-label={`Видео от ${reel?.profiles?.display_name || reel?.profiles?.username || 'автора'}`}
          role="application"
          style={{
            backgroundColor: '#000',
            objectFit: 'cover',
            zIndex: 1,
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
          loop
          muted={isMuted}
          playsInline
          autoPlay={index === currentIndex && isPlaying}
          preload={index === currentIndex ? "auto" : Math.abs(index - currentIndex) <= 1 ? "metadata" : "none"}
          onError={onError}
          onLoadedMetadata={onLoadedMetadata}
          onLoadedData={onLoadedData}
          onPlay={onPlay}
          onPlaying={() => {}}
          onPause={() => {}}
          onTimeUpdate={onTimeUpdate}
        />
      ) : reel.thumbnail_url ? (
        <img
          src={reel.thumbnail_url}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-black flex items-center justify-center">
          <Play className="w-12 h-12 text-white/60" />
        </div>
      )}

      {/* Play/Pause indicator */}
      {index === currentIndex && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center animate-scale-in">
            <Play className="w-10 h-10 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Double tap heart animation */}
      {index === currentIndex && showHeartAnimation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart
            className="w-28 h-28 text-white fill-white animate-[heartBurst_1s_ease-out_forwards]"
            style={{
              filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.5))',
            }}
          />
        </div>
      )}
    </div>
  );
}
