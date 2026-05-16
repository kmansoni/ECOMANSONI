import { motion } from "framer-motion";
import { Chrome, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { ThemeTokens } from "../types";

async function signInWith(provider: "google" | "apple") {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) {
    logger.error("[SocialLogin] OAuth error", { provider, error });
    toast.error("Не удалось войти", { description: error.message });
  }
}

function openTelegramLogin() {
  const botId = import.meta.env.VITE_TELEGRAM_BOT_ID;
  if (!botId) {
    toast.error("Telegram-бот не настроен");
    return;
  }
  const redirectUrl = encodeURIComponent(`${window.location.origin}/auth/telegram-callback`);
  window.location.href = `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(window.location.origin)}&request_access=write&return_to=${redirectUrl}`;
}

const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor"/>
  </svg>
);

export function SocialLoginButtons({ tokens }: { tokens: ThemeTokens }) {
  const buttons = [
    {
      icon: <Chrome className="w-5 h-5" />,
      label: "Google",
      onClick: () => signInWith("google"),
    },
    {
      icon: <Send className="w-5 h-5" />,
      label: "Telegram",
      onClick: openTelegramLogin,
    },
    {
      icon: <AppleIcon className="w-5 h-5" />,
      label: "iCloud",
      onClick: () => signInWith("apple"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-3" aria-hidden="true">
        <span className={`h-px flex-1 ${tokens.isDark ? "bg-white/[0.08]" : "bg-slate-300/70"}`} />
        <span className={`text-[10px] uppercase tracking-[0.2em] ${tokens.textMuted}`}>или</span>
        <span className={`h-px flex-1 ${tokens.isDark ? "bg-white/[0.08]" : "bg-slate-300/70"}`} />
      </div>

      <div className="flex gap-3">
        {buttons.map((btn) => (
          <motion.button
            key={btn.label}
            type="button"
            onClick={btn.onClick}
            whileTap={{ scale: 0.96 }}
            className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl backdrop-blur-xl transition-all duration-200 text-sm font-medium border ${
              tokens.isDark
                ? "text-white/70 hover:text-white border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05]"
                : "text-slate-700 hover:text-slate-900 bg-white/70 border-slate-300 hover:border-slate-400 hover:bg-white"
            }`}
          >
            {btn.icon}
            <span>{btn.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
