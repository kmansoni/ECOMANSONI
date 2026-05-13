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

      {/* Bottom waves - full width, anchored to bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[45%] sm:h-[35%]">
        <svg viewBox="0 0 1440 400" className="w-full h-full" preserveAspectRatio="xMidYMax slice">
          {/* Wave 1 - back, cyan - tallest */}
          <motion.path
            d="M0,250 C360,150 720,300 1080,200 C1260,150 1380,220 1440,200 L1440,400 L0,400 Z"
            fill={tokens.isDark ? "rgba(0,180,216,0.12)" : "rgba(0,180,216,0.08)"}
            animate={{
              d: [
                "M0,250 C360,150 720,300 1080,200 C1260,150 1380,220 1440,200 L1440,400 L0,400 Z",
                "M0,200 C360,280 720,180 1080,280 C1260,320 1380,250 1440,260 L1440,400 L0,400 Z",
                "M0,250 C360,150 720,300 1080,200 C1260,150 1380,220 1440,200 L1440,400 L0,400 Z",
              ],
            }}
            transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
          />

          {/* Wave 2 - middle, teal */}
          <motion.path
            d="M0,320 C400,250 800,350 1200,300 C1320,280 1380,330 1440,320 L1440,400 L0,400 Z"
            fill={tokens.isDark ? "rgba(0,200,150,0.10)" : "rgba(0,200,150,0.07)"}
            animate={{
              d: [
                "M0,320 C400,250 800,350 1200,300 C1320,280 1380,330 1440,320 L1440,400 L0,400 Z",
                "M0,280 C400,340 800,260 1200,350 C1320,380 1380,320 1440,330 L1440,400 L0,400 Z",
                "M0,320 C400,250 800,350 1200,300 C1320,280 1380,330 1440,320 L1440,400 L0,400 Z",
              ],
            }}
            transition={{ duration: 12, ease: "easeInOut", repeat: Infinity, delay: 0.7 }}
          />

          {/* Wave 3 - front, emerald - brightest */}
          <motion.path
            d="M0,380 C500,340 1000,390 1440,360 L1440,400 L0,400 Z"
            fill={tokens.isDark ? "rgba(79,208,128,0.08)" : "rgba(79,208,128,0.05)"}
            animate={{
              d: [
                "M0,380 C500,340 1000,390 1440,360 L1440,400 L0,400 Z",
                "M0,360 C500,400 1000,350 1440,380 L1440,400 L0,400 Z",
                "M0,380 C500,340 1000,390 1440,360 L1440,400 L0,400 Z",
              ],
            }}
            transition={{ duration: 14, ease: "easeInOut", repeat: Infinity, delay: 1.4 }}
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