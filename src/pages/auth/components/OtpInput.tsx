import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function OtpInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const chars = useMemo(() => {
    const a = value.split("");
    while (a.length < length) a.push("");
    return a.slice(0, length);
  }, [value, length]);

  const set = (i: number, ch: string) => {
    const digit = ch.replace(/\D/g, "").slice(-1);
    const next = chars.slice();
    next[i] = digit;
    onChange(next.join(""));
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
      {chars.map((ch, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="relative flex-1"
        >
          <input
            ref={(el) => { refs.current[i] = el; }}
            value={ch}
            inputMode="numeric"
            maxLength={1}
            onPaste={onPaste}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            className={cn(
              "w-full aspect-square rounded-2xl text-center text-xl sm:text-2xl font-semibold",
              "border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl",
              "text-white",
              "outline-none transition-all",
              "hover:border-white/15",
              "focus:border-white/20"
            )}
          />
          {ch && (
            <motion.span
              layoutId={`otp-dot-${i}`}
              className="absolute inset-x-3 sm:inset-x-4 bottom-2 h-[3px] rounded-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400"
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}