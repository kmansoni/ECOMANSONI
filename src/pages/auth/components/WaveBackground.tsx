import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function WaveBackground({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Top glow */}
      <motion.div
        className="absolute top-0 left-1/4 w-[500px] h-[300px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)" }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      />

      {/* Animated grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Bottom waves */}
      <div className="absolute bottom-0 left-0 right-0 h-[350px]">
        <svg viewBox="0 0 1440 350" className="w-full h-full" preserveAspectRatio="none">
          {/* Wave 1 - back, cyan */}
          <motion.path
            d="M0,200 C240,150 480,250 720,180 C960,110 1200,200 1440,160 L1440,350 L0,350 Z"
            fill={tokens.isDark ? "rgba(0,180,216,0.08)" : "rgba(0,180,216,0.06)"}
            animate={{
              d: [
                "M0,200 C240,150 480,250 720,180 C960,110 1200,200 1440,160 L1440,350 L0,350 Z",
                "M0,160 C240,220 480,140 720,200 C960,260 1200,180 1440,220 L1440,350 L0,350 Z",
                "M0,200 C240,150 480,250 720,180 C960,110 1200,200 1440,160 L1440,350 L0,350 Z",
              ],
            }}
            transition={{ duration: 8, ease: "easeInOut", repeat: Infinity }}
          />

          {/* Wave 2 - middle, teal */}
          <motion.path
            d="M0,240 C300,190 600,270 900,210 C1100,170 1300,250 1440,220 L1440,350 L0,350 Z"
            fill={tokens.isDark ? "rgba(0,200,150,0.06)" : "rgba(0,200,150,0.05)"}
            animate={{
              d: [
                "M0,240 C300,190 600,270 900,210 C1100,170 1300,250 1440,220 L1440,350 L0,350 Z",
                "M0,220 C300,280 600,200 900,260 C1100,300 1300,220 1440,260 L1440,350 L0,350 Z",
                "M0,240 C300,190 600,270 900,210 C1100,170 1300,250 1440,220 L1440,350 L0,350 Z",
              ],
            }}
            transition={{ duration: 10, ease: "easeInOut", repeat: Infinity, delay: 0.5 }}
          />

          {/* Wave 3 - front, emerald glow */}
          <motion.path
            d="M0,280 C400,230 800,300 1200,250 C1320,230 1380,270 1440,260 L1440,350 L0,350 Z"
            fill={tokens.isDark ? "rgba(79,208,128,0.05)" : "rgba(79,208,128,0.04)"}
            animate={{
              d: [
                "M0,280 C400,230 800,300 1200,250 C1320,230 1380,270 1440,260 L1440,350 L0,350 Z",
                "M0,260 C400,310 800,240 1200,290 C1320,310 1380,270 1440,280 L1440,350 L0,350 Z",
                "M0,280 C400,230 800,300 1200,250 C1320,230 1380,270 1440,260 L1440,350 L0,350 Z",
              ],
            }}
            transition={{ duration: 12, ease: "easeInOut", repeat: Infinity, delay: 1 }}
          />
        </svg>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: i % 2 === 0 ? "rgba(0,180,216,0.6)" : "rgba(0,200,150,0.5)",
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 4 + i,
              ease: "easeInOut",
              repeat: Infinity,
              delay: i * 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}