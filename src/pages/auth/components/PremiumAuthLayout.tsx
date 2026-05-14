import { motion, AnimatePresence } from "framer-motion";
import type { ThemeTokens } from "../types";

export function PremiumAuthLayout({
  children,
  tokens,
}: {
  children: React.ReactNode;
  tokens: ThemeTokens;
}) {
  return (
    <div
      className={`relative flex min-h-[100dvh] w-full items-center justify-center px-4 py-6 sm:px-5 sm:py-7 md:px-6 md:py-8 ${tokens.textPrimary}`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        // Типографическая шкала (все размеры кратны 4px)
        "--text-xs": "11px",
        "--text-sm": "13px",
        "--text-base": "15px",
        "--text-lg": "18px",
        "--text-xl": "22px",
        "--text-2xl": "28px",
        "--text-3xl": "36px",
      } as React.CSSProperties}
    >
      {/* Ambient background */}
      <div className="absolute inset-0">
        <div
          className={`absolute inset-0 transition-colors duration-700 ${
            tokens.isDark
              ? "bg-[radial-gradient(120%_80%_at_50%_0%,#0a1628_0%,#071420_60%,#020309_100%)]"
              : "bg-[radial-gradient(120%_80%_at_50%_0%,#f0fdfa_0%,#ecfeff_55%,#f0f9ff_100%)]"
          }`}
        />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(${tokens.isDark ? "#ffffff" : "#000000"} 1px, transparent 1px), linear-gradient(90deg, ${tokens.isDark ? "#ffffff" : "#000000"} 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 70%)",
          }}
        />
      </div>

      {/* Mobile edge effect */}
      <div
        className="pointer-events-none absolute inset-0 sm:hidden z-20"
        style={{
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.4), inset 0 0 8px rgba(0,0,0,0.3)",
        }}
      />

      {/* Main content — flex container with smooth transitions */}
      <div className="relative z-10 flex w-full max-w-5xl items-stretch gap-4 md:gap-6">
        {children}
      </div>
    </div>
  );
}

export function PremiumGlassCard({
  children,
  tokens,
  className = "",
}: {
  children: React.ReactNode;
  tokens: ThemeTokens;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full max-w-[440px] overflow-hidden rounded-lg sm:rounded-2xl md:rounded-[2rem] transition-all duration-300 ease-out ${className}`}
      style={{
        background: tokens.isDark
          ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.04) 100%)"
          : "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.92) 100%)",
        backdropFilter: "blur(50px) saturate(200%)",
        WebkitBackdropFilter: "blur(50px) saturate(200%)",
        border: tokens.isDark
          ? "1px solid rgba(255,255,255,0.1)"
          : "1px solid rgba(0,0,0,0.06)",
        boxShadow: tokens.isDark
          ? "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.2), 0 0 1px rgba(0,188,212,0.3)"
          : "0 20px 60px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05)",
      }}
    >
      {/* Subtle top highlight */}
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
        }}
      />
      {/* Left edge light refraction */}
      <div
        className="pointer-events-none absolute inset-y-4 left-0 w-px"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.08) 100%)",
        }}
      />
      {children}
    </div>
  );
}

export function AnimatedCard({
  children,
  direction = "right",
}: {
  children: React.ReactNode;
  direction?: "right" | "left";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: direction === "right" ? 24 : -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: direction === "right" ? -24 : 24 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function StepTransition({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      {children}
    </AnimatePresence>
  );
}