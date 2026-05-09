import { forwardRef } from "react";
import { motion } from "framer-motion";
import type { ThemeTokens } from "@/pages/auth/types";

export function PremiumFeedLayout({ children, tokens }: { children: React.ReactNode; tokens: ThemeTokens }) {
  return (
    <div className="relative flex min-h-[100dvh] w-full items-start justify-center px-3 py-6 sm:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Ambient background */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 transition-colors duration-700 ${
          tokens.isDark
            ? "bg-[radial-gradient(120%_80%_at_50%_0%,#0a1628_0%,#071420_60%,#020309_100%)]"
            : "bg-[radial-gradient(120%_80%_at_50%_0%,#f0fdfa_0%,#ecfeff_55%,#f0f9ff_100%)]"
        }`} />
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(${tokens.isDark ? "#ffffff" : "#000000"} 1px, transparent 1px), linear-gradient(90deg, ${tokens.isDark ? "#ffffff" : "#000000"} 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 70%)",
          }}
        />
      </div>
      <div className="relative z-10 flex w-full max-w-7xl items-start">
        {children}
      </div>
    </div>
  );
}

export function PremiumGlassCard({ children, tokens, className = "" }: { children: React.ReactNode; tokens: ThemeTokens; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border backdrop-blur-2xl ${tokens.glassCard} ${tokens.glassCardShadow} ${className}`}>
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {children}
    </div>
  );
}

export const FeedLayout = PremiumFeedLayout;

export const FeedTransition = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function FeedTransition({ children }, ref) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    );
  }
);