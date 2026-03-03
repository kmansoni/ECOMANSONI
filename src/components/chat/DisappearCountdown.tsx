import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DisappearCountdownProps {
  disappearAt: string; // ISO timestamp
  disappearInSeconds: number;
  onExpired?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0с";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS > 0 ? `${m}:${String(remS).padStart(2, "0")}` : `${m}м`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч`;
  const d = Math.floor(h / 24);
  return `${d}д`;
}

export function DisappearCountdown({
  disappearAt,
  disappearInSeconds,
  onExpired,
}: DisappearCountdownProps) {
  const expireTime = new Date(disappearAt).getTime();
  const totalMs = disappearInSeconds * 1000;

  const [remaining, setRemaining] = useState(() => Math.max(0, expireTime - Date.now()));
  const [expired, setExpired] = useState(remaining <= 0);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (expired) return;
    const tick = () => {
      const rem = Math.max(0, expireTime - Date.now());
      setRemaining(rem);
      if (rem <= 0) {
        setExpired(true);
        onExpiredRef.current?.();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expireTime, expired]);

  const progress = totalMs > 0 ? remaining / totalMs : 0;
  const isCritical = progress < 0.1;

  // SVG ring parameters
  const size = 20;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <AnimatePresence>
      {!expired ? (
        <motion.div
          className="inline-flex items-center gap-0.5 ml-1 align-middle"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2 }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="shrink-0"
          >
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={2}
            />
            {/* Progress ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={isCritical ? "#ef4444" : "#f97316"}
              strokeWidth={2}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span
            className={`text-[10px] font-medium leading-none ${isCritical ? "text-red-400" : "text-orange-400"}`}
            style={{ minWidth: "16px" }}
          >
            {formatRemaining(remaining)}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
