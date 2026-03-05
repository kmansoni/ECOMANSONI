/**
 * LiveLocationMessage — renders a live location sharing message.
 *
 * Shows a map tile with the user's current position.
 * Sender: updates position via Supabase upsert on watchPosition callback.
 * Receiver: subscribes to Supabase realtime channel for position updates.
 * Shows remaining time and stop button for sender.
 *
 * Security notes:
 * - isSender is determined server-side by comparing current user ID to message sender.
 * - Position updates are scoped to messageId — cross-message leakage is not possible.
 * - Server-side RLS on live_locations enforces: only sender can write, room members can read.
 */

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation, Timer, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LiveLocationMessageProps {
  /** Message ID for realtime subscription */
  messageId: string;
  /** Initial latitude */
  lat: number;
  /** Initial longitude */
  lng: number;
  /** TTL in seconds (e.g. 900 = 15 min) */
  ttlSeconds: number;
  /** When sharing started (ISO) */
  startedAt: string;
  /** Whether current user is the sender */
  isSender: boolean;
  /** Called when sender stops sharing */
  onStop?: () => void;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "Завершено";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveLocationMessage({
  messageId,
  lat,
  lng,
  ttlSeconds,
  startedAt,
  isSender,
  onStop,
}: LiveLocationMessageProps) {
  const [currentLat, setCurrentLat] = useState(lat);
  const [currentLng, setCurrentLng] = useState(lng);
  const [remaining, setRemaining] = useState(ttlSeconds);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    const startTime = new Date(startedAt).getTime();

    const update = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rem = Math.max(0, ttlSeconds - elapsed);
      setRemaining(rem);
      if (rem <= 0) {
        setExpired(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt, ttlSeconds]);

  // Sender: watch own position and push updates to Supabase
  useEffect(() => {
    if (!isSender || expired) return;

    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          setCurrentLat(newLat);
          setCurrentLng(newLng);

          // Push position update to server — receivers subscribe via realtime channel.
          // Server-side RLS on live_locations ensures only the authenticated sender
          // can upsert their own record (checked against auth.uid()).
          try {
            await (supabase as any)
              .from("live_locations")
              .upsert({
                message_id: messageId,
                lat: newLat,
                lng: newLng,
                updated_at: new Date().toISOString(),
              });
          } catch (err) {
            console.warn("[LiveLocationMessage] Failed to push position update:", err);
          }
        },
        (err) => {
          console.warn("[LiveLocationMessage] Geolocation error:", err.message);
          // Keep last known position — do not crash
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isSender, expired, messageId]);

  // Receiver: subscribe to realtime position updates from sender
  useEffect(() => {
    if (isSender || expired) return;

    // Subscribe to INSERT/UPDATE on live_locations filtered by message_id.
    // Server RLS ensures subscription only delivers records the user is authorized to see.
    const channel = (supabase as any)
      .channel(`live_location:${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_locations",
          filter: `message_id=eq.${messageId}`,
        },
        (payload: { new?: { lat?: number; lng?: number } }) => {
          const row = payload.new;
          if (row && typeof row.lat === "number" && typeof row.lng === "number") {
            setCurrentLat(row.lat);
            setCurrentLng(row.lng);
          }
        }
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [isSender, expired, messageId]);

  const osmUrl = `https://www.openstreetmap.org/?mlat=${currentLat}&mlon=${currentLng}#map=15/${currentLat}/${currentLng}`;

  return (
    <div className="space-y-1">
      {/* Map preview */}
      <a
        href={osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl overflow-hidden relative"
      >
        <div className="w-[260px] h-[160px] bg-[#1a2332] flex items-center justify-center relative">
          {/* Fallback map visualization */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-green-900/20" />
          <div className="relative z-10 flex flex-col items-center gap-1">
            <motion.div
              animate={!expired ? { y: [0, -4, 0] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <MapPin className="w-8 h-8 text-red-400" fill="currentColor" />
            </motion.div>
            <span className="text-[10px] text-white/50 font-mono">
              {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
            </span>
          </div>

          {/* Live indicator */}
          {!expired && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400 font-medium">LIVE</span>
            </div>
          )}

          {/* Timer */}
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40">
            <Timer className="w-3 h-3 text-white/60" />
            <span className="text-[10px] text-white/60 font-mono">{formatRemaining(remaining)}</span>
          </div>
        </div>
      </a>

      {/* Stop button for sender */}
      {isSender && !expired && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
        >
          <Square className="w-3 h-3" />
          Остановить
        </motion.button>
      )}

      {expired && (
        <p className="text-[10px] text-white/30 flex items-center gap-1">
          <Navigation className="w-3 h-3" />
          Трансляция завершена
        </p>
      )}
    </div>
  );
}
