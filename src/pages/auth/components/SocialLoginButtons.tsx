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
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

export function SocialLoginButtons({ tokens }: { tokens: ThemeTokens }) {
  const buttons = [
    {
      icon: <GoogleIcon className="w-5 h-5" />,
      label: "Google",
      onClick: () => signInWith("google"),
    },
    {
      icon: <TelegramIcon className="w-5 h-5" />,
      label: "Telegram",
      onClick: openTelegramLogin,
    },
    {
      icon: <AppleIcon className="w-5 h-5" />,
      label: "Apple",
      onClick: () => signInWith("apple"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="space-y-3"
    >
      <p className="text-center text-xs uppercase tracking-[0.18em] text-white/50 mb-3">
        или войти через
      </p>

      <div className="flex gap-3">
        {buttons.map((btn) => (
          <motion.button
            key={btn.label}
            type="button"
            onClick={btn.onClick}
            whileTap={{ scale: 0.96 }}
            className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl backdrop-blur-xl transition-all duration-200 text-white/70 hover:text-white text-sm font-medium border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] active:bg-white/[0.08]"
          >
            {btn.icon}
            <span className="hidden sm:inline">{btn.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
