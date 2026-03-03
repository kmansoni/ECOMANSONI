import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, Heart, MessageCircle, Bookmark, Share2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface InsightMetric {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

interface ReelInsightsProps {
  reelId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReelInsights({ reelId, isOpen, onClose }: ReelInsightsProps) {
  const [metrics, setMetrics] = useState<InsightMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !reelId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("reels")
        .select("views_count, likes_count, comments_count, saves_count, shares_count")
        .eq("id", reelId)
        .single();
      if (data) {
        setMetrics([
          { label: "Просмотры", value: data.views_count ?? 0, icon: <Eye className="w-5 h-5" />, color: "text-blue-400" },
          { label: "Лайки", value: data.likes_count ?? 0, icon: <Heart className="w-5 h-5" />, color: "text-red-400" },
          { label: "Комментарии", value: data.comments_count ?? 0, icon: <MessageCircle className="w-5 h-5" />, color: "text-green-400" },
          { label: "Сохранения", value: data.saves_count ?? 0, icon: <Bookmark className="w-5 h-5" />, color: "text-yellow-400" },
          { label: "Репосты", value: data.shares_count ?? 0, icon: <Share2 className="w-5 h-5" />, color: "text-purple-400" },
          { label: "Охват", value: Math.round((data.views_count ?? 0) * 0.7), icon: <Users className="w-5 h-5" />, color: "text-orange-400" },
        ]);
      }
      setLoading(false);
    })();
  }, [reelId, isOpen]);

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  };

  const maxVal = Math.max(...metrics.map((m) => m.value), 1);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25 }}
          className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-lg">Аналитика</h2>
            <button onClick={onClose} className="text-zinc-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {metrics.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={m.color}>{m.icon}</span>
                      <span className="text-white text-sm">{m.label}</span>
                    </div>
                    <span className="text-white font-semibold">{formatNum(m.value)}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(m.value / maxVal) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
