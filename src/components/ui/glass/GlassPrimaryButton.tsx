import { forwardRef, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_GRADIENT } from "./glassTokens";

export interface GlassPrimaryButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  type?: "button" | "submit";
  /** sm = h-11, md = h-12, lg = h-14 (auth-эталон). */
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "default";
  className?: string;
  ariaLabel?: string;
}

/**
 * Primary-кнопка в стиле AuthPage:
 *  - cyan→teal→emerald градиент,
 *  - стеклянный блик сверху,
 *  - перемещающийся shimmer,
 *  - ripple по клику,
 *  - magnet-эффект по mouse move.
 */
export const GlassPrimaryButton = forwardRef<
  HTMLButtonElement,
  GlassPrimaryButtonProps
>(
  function GlassPrimaryButton(
    { onClick, disabled, loading, children, icon, type = "button", size = "lg", variant = "default", className, ariaLabel },
    ref,
  ) {
    const localRef = useRef<HTMLButtonElement | null>(null);
    const prefersReducedMotion = useReducedMotion();
    const isMotionEnabled = !prefersReducedMotion;
    const setRef = (el: HTMLButtonElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
    };
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const sx = useSpring(mx, { stiffness: 220, damping: 18 });
    const sy = useSpring(my, { stiffness: 220, damping: 18 });
    const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

    const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
      if (!isMotionEnabled) return;
      const r = localRef.current?.getBoundingClientRect();
      if (!r) return;
      mx.set((e.clientX - r.left - r.width / 2) * 0.2);
      my.set((e.clientY - r.top - r.height / 2) * 0.3);
    };
    const handleLeave = () => {
      if (!isMotionEnabled) return;
      mx.set(0);
      my.set(0);
    };
    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (isMotionEnabled) {
        const r = localRef.current?.getBoundingClientRect();
        if (r) {
          const id = Date.now();
          setRipples((prev) => [...prev, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
          window.setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== id)), 650);
        }
      }
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
        style={isMotionEnabled ? { x: sx, y: sy } : undefined}
        whileTap={isMotionEnabled ? { scale: 0.97 } : undefined}
        className={cn(
          "relative group w-full rounded-2xl overflow-hidden font-semibold text-white",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          "shadow-[0_12px_40px_-8px_rgba(0,180,216,0.45)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          sizeClass,
          className,
        )}
      >
        {variant === "brand" ? (
          <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: BRAND_GRADIENT }} />
        ) : (
          <span className="absolute inset-0" style={{ background: BRAND_GRADIENT }} />
        )}
        <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent" />
        {variant !== "brand" && isMotionEnabled && (
          <motion.span
            className="absolute -inset-y-4 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
            animate={{ x: ["0%", "450%"] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
          />
        )}
        {isMotionEnabled && ripples.map((r) => (
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
  },
);
