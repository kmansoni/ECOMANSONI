import { motion, AnimatePresence } from "framer-motion";
import type { ThemeTokens } from "../types";
import { WaveBackground } from "./WaveBackground";

export function PremiumAuthLayout({
  children,
  tokens,
}: {
  children: React.ReactNode;
  tokens: ThemeTokens;
}) {
  return (
    <div
      className={`relative flex min-h-[100dvh] w-full items-stretch sm:items-center sm:justify-center overflow-hidden sm:px-6 sm:py-8 ${tokens.textPrimary}`}
    >
      {/* Ambient background */}
      <div className="absolute inset-0">
        <div
          className={`absolute inset-0 transition-colors duration-700 ${
            tokens.isDark
              ? "bg-[radial-gradient(circle_at_16%_8%,rgba(0,180,216,0.28)_0%,rgba(0,180,216,0)_38%),radial-gradient(circle_at_86%_12%,rgba(139,92,246,0.24)_0%,rgba(139,92,246,0)_40%),radial-gradient(circle_at_70%_86%,rgba(0,200,150,0.20)_0%,rgba(0,200,150,0)_44%),linear-gradient(180deg,#050816_0%,#07111f_48%,#030611_100%)]"
              : "bg-[radial-gradient(circle_at_14%_4%,rgba(125,211,252,0.58)_0%,rgba(125,211,252,0)_34%),radial-gradient(circle_at_88%_12%,rgba(94,234,212,0.48)_0%,rgba(94,234,212,0)_36%),radial-gradient(circle_at_72%_88%,rgba(196,181,253,0.42)_0%,rgba(196,181,253,0)_42%),linear-gradient(135deg,#f8fbff_0%,#edf7ff_44%,#f7f4ff_100%)]"
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
        <WaveBackground tokens={tokens} />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex w-full sm:max-w-5xl items-stretch">
        {children}
      </div>
    </div>
  );
}

export function PremiumGlassCard({
  children,
  tokens,
  className = "",
  style,
}: {
  children: React.ReactNode;
  tokens: ThemeTokens;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`liquid-glass-surface relative overflow-hidden rounded-none sm:rounded-[2rem] ${tokens.glassCardShadow} ${className}`}
      style={{
        background: tokens.isDark
          ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.04) 100%)"
          : "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.92) 100%)",
        backdropFilter: "blur(40px) saturate(180%)",
        border: tokens.isDark
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.05)",
        boxShadow: tokens.isDark
          ? "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1)"
          : "0 8px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
        ...style,
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