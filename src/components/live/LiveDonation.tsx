/**
 * LiveDonation — донаты на прямом эфире
 */
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


interface Donation {
  id: string;
  donor_id: string;
  amount: number;
  currency: string;
  message?: string;
  created_at: string;
  // joined
  donor_name?: string;
  donor_avatar?: string;
}

const AMOUNTS = [10, 50, 100, 250, 500, 1000];

interface Props {
  sessionId: string;
  streamerId: string;
  isStreamer?: boolean;
}

export function LiveDonation({ sessionId, streamerId, isStreamer = false }: Props) {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [showDonate, setShowDonate] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [liveAnimation, setLiveAnimation] = useState<Donation | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("live_donations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);
    setDonations((data || []) as Donation[]);
  }, [sessionId]);

  useEffect(() => {
    void load();
    const sub = supabase
      .channel(`live_donations:${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_donations", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const d = payload.new as Donation;
          setDonations((prev) => [d, ...prev].slice(0, 20));
          setLiveAnimation(d);
          setTimeout(() => setLiveAnimation(null), 4000);
        })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [sessionId, load]);

  const donate = async () => {
    if (sending) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Войдите для доната"); return; }
      const { error } = await supabase.from("live_donations").insert({
        session_id: sessionId,
        donor_id: user.id,
        streamer_id: streamerId,
        amount: selectedAmount,
        currency: "stars",
        message: message.trim() || null,
      });
      if (error) throw error;
      setShowDonate(false);
      setMessage("");
      toast.success(`Донат ${selectedAmount} ⭐ отправлен!`);
    } catch { toast.error("Ошибка отправки доната"); }
    finally { setSending(false); }
  };

  return (
    <div className="relative">
      {/* Анимация нового доната */}
      <AnimatePresence>
        {liveAnimation && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 whitespace-nowrap"
          >
            <Star className="w-5 h-5 fill-white" />
            <span className="font-bold">{liveAnimation.amount} Stars</span>
            {liveAnimation.message && <span className="text-sm opacity-90">«{liveAnimation.message}»</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Кнопка доната */}
      {!isStreamer && (
        <button
          onClick={() => setShowDonate(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg"
        >
          <Star className="w-4 h-4 fill-white" />
          Поддержать
        </button>
      )}

      {/* Последние донаты */}
      {isStreamer && donations.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {donations.slice(0, 5).map((d) => (
            <div key={d.id} className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1">
              <Star className="w-3 h-3 text-yellow-400 flex-shrink-0" />
              <span className="text-xs text-yellow-400 font-medium">{d.amount}</span>
              {d.message && <span className="text-xs text-white/70 truncate">{d.message}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Окно доната */}
      <AnimatePresence>
        {showDonate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setShowDonate(false)}
          >
            <motion.div
              initial={{ y: 200 }}
              animate={{ y: 0 }}
              exit={{ y: 200 }}
              className="w-full max-w-md bg-zinc-900 rounded-t-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold text-base flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500" />
                Поддержать стримера
              </h3>

              {/* Суммы */}
              <div className="grid grid-cols-3 gap-2">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setSelectedAmount(a)}
                    className={cn(
                      "py-2 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1",
                      selectedAmount === a
                        ? "bg-yellow-500 border-yellow-500 text-black"
                        : "bg-transparent border-white/20 text-white/70 hover:border-yellow-500/50",
                    )}
                  >
                    <Star className="w-3.5 h-3.5" fill={selectedAmount === a ? "black" : "none"} />
                    {a}
                  </button>
                ))}
              </div>

              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Добавить сообщение (необязательно)"
                maxLength={100}
                className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:border-yellow-500 outline-none"
              />

              <button
                onClick={donate}
                disabled={sending}
                className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Star className="w-5 h-5 fill-black" />
                Отправить {selectedAmount} Stars
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
