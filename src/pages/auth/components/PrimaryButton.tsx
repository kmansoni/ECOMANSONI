import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { PrimaryButtonProps } from "../types";

export function PrimaryButton({ onClick, disabled, loading, children, icon, type = "button" }: PrimaryButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 18 });
  const sy = useSpring(my, { stiffness: 220, damping: 18 });
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left - r.width / 2) * 0.25);
    my.set((e.clientY - r.top - r.height / 2) * 0.35);
  };
  const handleLeave = () => { mx.set(0); my.set(0); };
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const id = Date.now();
      setRipples((prev) => [...prev, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      window.setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== id)), 650);
    }
    onClick?.();
  };

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.97 }}
      className="relative group h-14 w-full rounded-2xl overflow-hidden font-semibold text-white
                 disabled:opacity-60 disabled:cursor-not-allowed
                 shadow-[0_12px_40px_-8px_rgba(0,180,216,0.45)]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg,#0096c7 0%,#00b4d8 40%,#00c896 100%)" }}
      />
      <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent" />
      <motion.span
        className="absolute -inset-y-4 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
        animate={{ x: ["0%", "450%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
      />
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="absolute rounded-full bg-white/40 pointer-events-none"
          style={{ left: r.x, top: r.y, translateX: "-50%", translateY: "-50%" }}
          initial={{ width: 0, height: 0, opacity: 0.6 }}
          animate={{ width: 520, height: 520, opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      ))}
      <span className="relative flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        {children}
      </span>
    </motion.button>
  );
}
