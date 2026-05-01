import { forwardRef, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_GRADIENT } from "./glassTokens";

export interface GlassSecondaryButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  type?: "button" | "submit";
  /** sm = h-11, md = h-12, lg = h-14 (auth-эталон). */
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}

/**
 * Ghost-секундарная кнопка — ghost, hover bg-white/10.
 */
export const GlassSecondaryButton = forwardRef<
  HTMLButtonElement,
  GlassSecondaryButtonProps
>(function GlassSecondaryButton(
  { onClick, disabled, loading, children, icon, type = "button", size = "lg", className, ariaLabel },
  ref,
) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const setRef = (el: HTMLButtonElement | null) => {
    localRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
  };
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 18 });
  const sy = useSpring(my, { stiffness: 220, damping: 18 });

  const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
    const r = localRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left - r.width / 2) * 0.2);
    my.set((e.clientY - r.top - r.height / 2) * 0.3);
  };
  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.();
  };

  const sizeClass = size === "sm" ? "h-11" : size === "md" ? "h-12" : "h-14";

  return (
    <motion.button
      ref={setRef}
      type={type}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative group w-full rounded-2xl overflow-hidden font-semibold border backdrop-blur-xl transition",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        "bg-white/5 hover:bg-white/10 border-white/20 text-white",
        sizeClass,
        className,
      )}
    >
      {/* Subtle gradient overlay on hover */}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: BRAND_GRADIENT }} />
      <span className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
      <span className="relative flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        {children}
      </span>
    </motion.button>
  );
});
