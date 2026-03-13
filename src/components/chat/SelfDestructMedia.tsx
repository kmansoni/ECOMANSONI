/**
 * SelfDestructMedia — Telegram-style one-time viewable media.
 *
 * Shows blurred preview. On tap: reveals media with countdown timer.
 * After timer expires: media blurs and becomes unviewable locally.
 * Screenshot detection: warns user (best-effort via visibilitychange).
 *
 * SECURITY LIMITATIONS (client-side enforcement):
 * ─────────────────────────────────────────────
 * 1. The mediaUrl is loaded by the browser when the component mounts (even blurred).
 *    A determined user can extract the URL from DevTools / network tab before viewing.
 * 2. Client-side "destruction" only removes the DOM element — it does NOT delete the
 *    actual media file from storage.
 * 3. True one-time access REQUIRES server-side enforcement:
 *    - onViewed() MUST signal the server to either:
 *      a) delete the Storage object, OR
 *      b) revoke/expire the signed URL after first use.
 *    - Server should track view_count per media message and enforce max_views=1 via RLS.
 * 4. Screenshot detection via visibilitychange is best-effort — not reliable.
 *
 * These limitations are inherent to browser-based media loading and cannot be
 * solved purely client-side. Server co-operation is mandatory for real enforcement.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Timer, Flame } from "lucide-react";
import { logger } from "@/lib/logger";

interface SelfDestructMediaProps {
  mediaUrl: string;
  mediaType: "image" | "video";
  /** Seconds to show media before destruction. Default: 10 */
  ttlSeconds?: number;
  /**
   * Called when media is FIRST viewed.
   * MUST trigger server-side URL revocation / storage deletion.
   * Without server action, the media URL remains accessible after "destruction".
   */
  onViewed?: () => void;
  /** Called when media self-destructs locally (client DOM cleared) */
  onDestroyed?: () => void;
  /** Whether this media has already been viewed (server-side flag, not client state) */
  alreadyViewed?: boolean;
}

export function SelfDestructMedia({
  mediaUrl,
  mediaType,
  ttlSeconds = 10,
  onViewed,
  onDestroyed,
  alreadyViewed = false,
}: SelfDestructMediaProps) {
  const [revealed, setRevealed] = useState(false);
  const [destroyed, setDestroyed] = useState(alreadyViewed);
  const [countdown, setCountdown] = useState(ttlSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback(() => {
    if (destroyed || revealed) return; // idempotent: prevent double-view
    setRevealed(true);
    // SECURITY: onViewed() MUST trigger server-side URL revocation.
    // Called before timeout to ensure server is notified even if user closes tab immediately.
    onViewed?.();

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setRevealed(false);
          setDestroyed(true);
          onDestroyed?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [destroyed, revealed, onViewed, onDestroyed]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Screenshot detection (best-effort)
  useEffect(() => {
    if (!revealed) return;
    const handler = () => {
      if (document.visibilityState === "hidden" && revealed) {
        // User switched away — could be screenshot
        logger.warn("self-destruct-media: tab hidden during reveal", {
          mediaType,
          ttlSeconds,
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [revealed]);

  if (destroyed) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 text-white/40">
        <Flame className="w-4 h-4" />
        <span className="text-sm">Медиа просмотрено</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Blurred preview or revealed media */}
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="blurred"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative cursor-pointer"
            onClick={startCountdown}
          >
            {mediaType === "image" ? (
              <img
                src={mediaUrl}
                alt="self-destruct"
                className="w-full max-w-[280px] max-h-[280px] object-cover blur-xl brightness-50 rounded-xl"
              />
            ) : (
              <div className="w-[280px] h-[200px] bg-black/40 blur-xl rounded-xl" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-white/70 font-medium">
                Нажмите для просмотра
              </span>
              <span className="text-[10px] text-white/40 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {ttlSeconds}с
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative"
          >
            {mediaType === "image" ? (
              <img
                src={mediaUrl}
                alt="self-destruct"
                className="w-full max-w-[280px] max-h-[280px] object-cover rounded-xl"
              />
            ) : (
              <video
                src={mediaUrl}
                autoPlay
                playsInline
                className="w-full max-w-[280px] max-h-[280px] rounded-xl"
              />
            )}
            {/* Countdown overlay */}
            <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
              <Timer className="w-3 h-3 text-white/80" />
              <span className="text-xs text-white font-mono">{countdown}с</span>
            </div>
            {/* Circular progress */}
            <div className="absolute bottom-2 right-2">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                <circle
                  cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2"
                  strokeDasharray={`${2 * Math.PI * 10}`}
                  strokeDashoffset={`${2 * Math.PI * 10 * (1 - countdown / ttlSeconds)}`}
                  transform="rotate(-90 12 12)"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
