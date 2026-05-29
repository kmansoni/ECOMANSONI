import { forwardRef } from "react";
import { motion } from "framer-motion";
import type { ThemeTokens } from "@/pages/auth/types";

export function PremiumFeedLayout({ children }: { children: React.ReactNode; tokens?: ThemeTokens }) {
  return (
    <div className="relative flex min-h-[100dvh] w-full items-start justify-center px-3 py-6 sm:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
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