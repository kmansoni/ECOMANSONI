import { useState, useRef } from "react";
import { Play, Pause } from "lucide-react";

interface VideoCircleMessageProps {
  videoUrl: string;
  duration: string;
  isOwn: boolean;
}

export function VideoCircleMessage({ videoUrl, duration, isOwn }: VideoCircleMessageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const videoDuration = videoRef.current?.duration || 0;
  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  return (
    <div className="relative group cursor-pointer" onClick={togglePlay}>
      {/* Circular video */}
      <div className={`w-48 h-48 rounded-full overflow-hidden border-2 ${
        isOwn ? "border-primary" : "border-muted-foreground/30"
      }`}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          playsInline
        />
      </div>

      {/* Progress ring */}
      <svg className="absolute inset-0 w-48 h-48 -rotate-90 pointer-events-none">
        <circle
          cx="96"
          cy="96"
          r="94"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={isOwn ? "text-primary" : "text-muted-foreground/50"}
          strokeDasharray={`${progress * 5.906} 590.6`}
          strokeLinecap="round"
        />
      </svg>

      {/* Play/Pause overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-6 h-6 text-black fill-black ml-1" />
          </div>
        </div>
      )}

      {/* Duration label */}
      <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs ${
        isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}>
        {isPlaying ? formatTime(currentTime) : duration}
      </div>
    </div>
  );
}
