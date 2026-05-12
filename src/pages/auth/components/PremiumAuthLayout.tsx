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
      className={`relative flex min-h-[100dvh] w-full items-center justify-center px-3 py-6 sm:px-6 sm:py-8 ${tokens.textPrimary}`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
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

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-5xl items-center">
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
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border backdrop-blur-2xl ${tokens.glassCard} ${tokens.glassCardShadow} ${className}`}
    >
      {/* Subtle top highlight */}
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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