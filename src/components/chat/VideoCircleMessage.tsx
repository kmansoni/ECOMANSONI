import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";

interface VideoCircleMessageProps {
  videoUrl: string;
  duration: string;
  isOwn: boolean;
}

const CIRCUMFERENCE = 2 * Math.PI * 94;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export function VideoCircleMessage({ videoUrl, duration, isOwn }: VideoCircleMessageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const timeRef = useRef(0);

  const progress = dur > 0 ? time / dur : 0;

  const handleTap = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!expanded) {
      setExpanded(true);
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [expanded, playing]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setExpanded(false);
    setTime(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    setTime(t);
    timeRef.current = t;
  }, []);

  const collapse = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
    setExpanded(false);
  }, []);

  const onTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setTime(t);
    timeRef.current = t;
  }, []);

  const onLoadMeta = useCallback(() => {
    if (!videoRef.current) return;
    setDur(videoRef.current.duration);
    if (timeRef.current > 0) videoRef.current.currentTime = timeRef.current;
  }, []);

  const expandedVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    videoRef.current = el;
    const seek = () => {
      el.currentTime = timeRef.current;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
  }, []);

  const borderColor = isOwn ? "border-primary" : "border-muted-foreground/30";
  const ringColor = isOwn ? "text-primary" : "text-muted-foreground/50";
  const badgeCls = isOwn
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-foreground";

  return (
    <>
      <div className="relative cursor-pointer" onClick={!expanded ? handleTap : undefined}>
        <div className={`w-48 h-48 rounded-full overflow-hidden border-2 ${borderColor}`}>
          {!expanded && (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadMeta}
              onEnded={handleEnded}
              playsInline
            />
          )}
        </div>

        <svg
          className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          viewBox="0 0 192 192"
        >
          <circle
            cx="96" cy="96" r="94"
            fill="none" stroke="currentColor" strokeWidth="3"
            className={ringColor}
            strokeDasharray={`${progress * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
          />
        </svg>

        {!playing && !expanded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-6 h-6 text-black fill-black ml-1" />
            </div>
          </div>
        )}

        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs ${badgeCls}`}>
          {playing ? fmtTime(time) : duration}
        </div>
      </div>

      {expanded && createPortal(
        <AnimatePresence>
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={collapse}
            role="dialog"
          >
            <motion.div
              className="relative"
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-72 h-72 rounded-full overflow-hidden border-2 border-white/20 cursor-pointer"
                onClick={handleTap}
              >
                <video
                  ref={expandedVideoRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  onTimeUpdate={onTimeUpdate}
                  onLoadedMetadata={onLoadMeta}
                  onEnded={handleEnded}
                  playsInline
                />
              </div>

              <svg
                className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                viewBox="0 0 192 192"
              >
                <circle
                  cx="96" cy="96" r="94"
                  fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-white/50"
                  strokeDasharray={`${progress * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                  strokeLinecap="round"
                />
              </svg>

              {!playing && (
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer"
                  onClick={handleTap}
                >
                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="w-7 h-7 text-black fill-black ml-1" />
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs bg-black/60 text-white">
                {fmtTime(time)}
              </div>

              <input
                type="range"
                min={0}
                max={dur || 1}
                step={0.1}
                value={time}
                onChange={handleSeek}
                className="absolute -bottom-10 left-0 w-full accent-white cursor-pointer"
                aria-label="Перемотка видео"
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
