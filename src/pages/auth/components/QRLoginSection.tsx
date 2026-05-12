import { motion } from "framer-motion";
import { QrCode, Smartphone } from "lucide-react";
import type { ThemeTokens } from "../types";
import { QRCodeLogin } from "./QRCodeLogin";

export function QRLoginSection({ tokens }: { tokens: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px" style={{ background: tokens.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
        <span className={`text-[11px] uppercase tracking-[0.15em] ${tokens.textFaint}`}>или</span>
        <div className="flex-1 h-px" style={{ background: tokens.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          const el = document.getElementById("qr-section");
          el?.scrollIntoView({ behavior: "smooth" });
        }}
        className={`w-full h-12 rounded-2xl border backdrop-blur-xl flex items-center justify-center gap-2 transition-all duration-300 ${tokens.pillSurface} ${tokens.textSecondary} hover:scale-[1.02]`}
      >
        <QrCode className="w-5 h-5" />
        <span className="text-sm font-medium">Войти по QR-коду</span>
        <Smartphone className="w-4 h-4 opacity-50" />
      </motion.button>
    </motion.div>
  );
}