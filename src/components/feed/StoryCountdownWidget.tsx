import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StoryCountdown {
  id: string;
  story_id: string;
  title: string;
  end_time: string;
}

interface StoryCountdownWidgetProps {
  countdown: StoryCountdown;
  className?: string;
}

function useCountdown(endTime: string) {
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return timeLeft;
}

export function StoryCountdownWidget({ countdown, className }: StoryCountdownWidgetProps) {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeLeft = useCountdown(countdown.end_time);

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || loading) return;
    setLoading(true);
    if (!subscribed) {
      const { error } = await (supabase as any)
        .from('story_countdown_subscribers')
        .insert({ countdown_id: countdown.id, user_id: user.id });
      if (!error) setSubscribed(true);
    } else {
      const { error } = await (supabase as any)
        .from('story_countdown_subscribers')
        .delete()
        .eq('countdown_id', countdown.id)
        .eq('user_id', user.id);
      if (!error) setSubscribed(false);
    }
    setLoading(false);
  };

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const isExpired = timeLeft.d === 0 && timeLeft.h === 0 && timeLeft.m === 0 && timeLeft.s === 0;

  return (
    <div className={cn("bg-gradient-to-br from-yellow-500/80 to-orange-500/80 backdrop-blur-md rounded-2xl p-4 text-center", className)}>
      <p className="text-white/80 text-xs mb-1">⏰ Обратный отсчёт</p>
      <p className="text-white font-bold text-base mb-3">{countdown.title}</p>

      {isExpired ? (
        <motion.p
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-white font-bold text-lg"
        >
          🎉 Уже началось!
        </motion.p>
      ) : (
        <div className="flex items-center justify-center gap-2 mb-3">
          {timeLeft.d > 0 && (
            <TimeUnit value={pad(timeLeft.d)} label="дн" />
          )}
          <TimeUnit value={pad(timeLeft.h)} label="ч" />
          <span className="text-white/80 text-lg font-bold">:</span>
          <TimeUnit value={pad(timeLeft.m)} label="мин" />
          <span className="text-white/80 text-lg font-bold">:</span>
          <TimeUnit value={pad(timeLeft.s)} label="сек" />
        </div>
      )}

      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 mx-auto rounded-full py-1.5 px-4 text-sm font-medium transition-all",
          subscribed
            ? "bg-white/20 text-white/80 hover:bg-white/10"
            : "bg-white text-orange-600 hover:bg-white/90"
        )}
      >
        {subscribed ? (
          <><BellOff className="w-3.5 h-3.5" /> Отписаться</>
        ) : (
          <><Bell className="w-3.5 h-3.5" /> Напомнить</>
        )}
      </button>
    </div>
  );
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <motion.span
        key={value}
        initial={{ y: -4, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-white font-bold text-xl leading-none"
      >
        {value}
      </motion.span>
      <span className="text-white/60 text-xs">{label}</span>
    </div>
  );
}
