import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Gift, TrendingUp, Clock, Zap } from "lucide-react";
import { useStars, StarTransaction } from "@/hooks/useStars";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface StarsSheetProps {
  open: boolean;
  onClose: () => void;
}

function CountdownTimer({ target }: { target: Date }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Доступно!");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}ч ${m}м ${s}с`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [target]);

  return <span>{remaining}</span>;
}

function TxIcon({ type }: { type: string }) {
  if (type === "gift_sent") return <span className="text-lg">🎁</span>;
  if (type === "gift_received") return <span className="text-lg">🎀</span>;
  if (type === "daily_bonus") return <span className="text-lg">🎯</span>;
  if (type === "purchase") return <span className="text-lg">💳</span>;
  if (type === "achievement") return <span className="text-lg">🏆</span>;
  return <span className="text-lg">⭐</span>;
}

export function StarsSheet({ open, onClose }: StarsSheetProps) {
  const { balance, loading, transactions, canClaimDaily, dailyNextAt, addStars, claimDailyBonus } = useStars();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[301] rounded-t-3xl overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ maxHeight: "85vh" }}
          >
            {/* Gradient header */}
            <div className="relative" style={{ background: "linear-gradient(135deg, #F59E0B 0%, #D97706 40%, #B45309 100%)" }}>
              <div className="px-5 pt-5 pb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-bold text-lg">Звёзды</h2>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>

                {/* Balance */}
                <div className="text-center">
                  <motion.div
                    key={balance}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-6xl font-black text-white mb-1"
                  >
                    {balance}
                  </motion.div>
                  <p className="text-amber-100 text-sm">⭐ звёзд на балансе</p>
                </div>
              </div>
              {/* Wave */}
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-[#0f0f14] rounded-t-3xl" />
            </div>

            {/* Content */}
            <div className="bg-[#0f0f14] overflow-y-auto" style={{ maxHeight: "60vh" }}>
              <div className="px-4 pt-2 pb-6 space-y-4">

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Get Stars */}
                  <button
                    onClick={() => addStars(100, "Пополнение через приложение")}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/15 active:scale-95 transition-all"
                  >
                    <TrendingUp className="w-6 h-6 text-amber-400" />
                    <span className="text-white text-sm font-medium">Получить</span>
                    <span className="text-amber-300 text-xs">+100 ⭐</span>
                  </button>

                  {/* Daily Bonus */}
                  <button
                    onClick={canClaimDaily ? claimDailyBonus : undefined}
                    disabled={!canClaimDaily}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-95 ${
                      canClaimDaily
                        ? "bg-green-400/10 border-green-400/30 hover:bg-green-400/15"
                        : "bg-white/5 border-white/10 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <Zap className={`w-6 h-6 ${canClaimDaily ? "text-green-400" : "text-white/40"}`} />
                    <span className="text-white text-sm font-medium">Бонус дня</span>
                    {canClaimDaily ? (
                      <span className="text-green-300 text-xs">+10 ⭐ забрать</span>
                    ) : dailyNextAt ? (
                      <span className="text-white/40 text-xs">
                        <CountdownTimer target={dailyNextAt} />
                      </span>
                    ) : null}
                  </button>
                </div>

                {/* Transactions */}
                <div>
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider px-1 mb-3 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    История транзакций
                  </p>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <p className="text-center text-white/30 text-sm py-8">Транзакций пока нет</p>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
                        >
                          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                            <TxIcon type={tx.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{tx.description ?? tx.type}</p>
                            <p className="text-white/40 text-xs">
                              {format(new Date(tx.created_at), "d MMM, HH:mm", { locale: ru })}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-bold shrink-0 ${
                              tx.amount > 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {tx.amount > 0 ? "+" : ""}{tx.amount} ⭐
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
