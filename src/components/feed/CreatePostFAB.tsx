import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ThemeTokens } from "@/pages/auth/types";

export function CreatePostFAB({ tokens }: { tokens: ThemeTokens }) {
  const navigate = useNavigate();

  return (
    <motion.button
      onClick={() => navigate("/create")}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05, y: -2 }}
      className="group fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0096c7 0%, #00b4d8 40%, #00c896 100%)",
        boxShadow: "0 8px 32px rgba(0,180,216,0.35), 0 2px 8px rgba(0,0,0,0.2)",
      }}
      aria-label="Создать публикацию"
    >
      <motion.span
        className="absolute -inset-y-6 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
        animate={{ x: ["0%", "450%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
      />
      <motion.span
        className="relative flex items-center justify-center"
        whileHover={{ rotate: 90 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <Plus className="w-6 h-6 text-white stroke-[2.5]" />
      </motion.span>

      {/* Tooltip */}
      <motion.div
        className="absolute right-full mr-3 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{
          background: tokens.isDark ? "rgba(10,14,26,0.95)" : "rgba(255,255,255,0.95)",
          color: tokens.textPrimary,
          border: `1px solid ${tokens.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}
        initial={{ opacity: 0, x: 8 }}
        whileHover={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        Новая публикация
      </motion.div>
    </motion.button>
  );
}