import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function WaveBackground({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 h-[300px]">
        <svg viewBox="0 0 1440 300" className="w-full h-full" preserveAspectRatio="none">
          <motion.path
            d="M0,160 C360,100 720,220 1080,160 C1260,130 1380,160 1440,150 L1440,300 L0,300 Z"
            fill={tokens.isDark ? "rgba(0,180,216,0.03)" : "rgba(0,180,216,0.04)"}
            initial={{ d: "M0,280 C360,250 720,290 1080,260 C1260,240 1380,270 1440,260 L1440,300 L0,300 Z" }}
            animate={{ d: "M0,160 C360,100 720,220 1080,160 C1260,130 1380,160 1440,150 L1440,300 L0,300 Z" }}
            transition={{ duration: 3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
          />
          <motion.path
            d="M0,200 C300,150 600,240 900,180 C1100,150 1300,200 1440,170 L1440,300 L0,300 Z"
            fill={tokens.isDark ? "rgba(0,200,150,0.02)" : "rgba(0,200,150,0.03)"}
            initial={{ d: "M0,280 C300,260 600,290 900,270 C1100,250 1300,280 1440,270 L1440,300 L0,300 Z" }}
            animate={{ d: "M0,200 C300,150 600,240 900,180 C1100,150 1300,200 1440,170 L1440,300 L0,300 Z" }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 1 }}
          />
        </svg>
      </div>
    </div>
  );
}