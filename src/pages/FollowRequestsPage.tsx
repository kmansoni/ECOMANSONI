import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getRequests, acceptRequest, rejectRequest } from "@/hooks/useFollowRequests";
import type { FollowRequest } from "@/hooks/useFollowRequests";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function FollowRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const data = await getRequests(user.id);
        setRequests(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleAccept = async (req: FollowRequest) => {
    setProcessing(req.id);
    try {
      await acceptRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast.success(`@${req.requester?.username} теперь подписан(а)`);
    } catch (_err) {
      toast.error("Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (req: FollowRequest) => {
    setProcessing(req.id);
    try {
      await rejectRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast.success("Запрос отклонён");
    } catch (_err) {
      toast.error("Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-foreground font-semibold">Запросы на подписку</h1>
        {requests.length > 0 && (
          <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {requests.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Check className="w-12 h-12" />
          <p className="text-sm">Нет новых запросов</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          <AnimatePresence>
            {requests.map(req => (
              <motion.div
                key={req.id}
                initial={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-3"
              >
                {/* Avatar */}
                <button onClick={() => navigate(`/user/${req.requester_id}`)}>
                  {req.requester?.avatar_url ? (
                    <img src={req.requester.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold">
                      {req.requester?.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">
                    {req.requester?.full_name || req.requester?.username}
                  </p>
                  <p className="text-muted-foreground text-xs">@{req.requester?.username}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(req)}
                    disabled={processing === req.id}
                    className="px-4 py-1.5 bg-primary rounded-lg text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                  >
                    {processing === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Подтвердить
                  </button>
                  <button
                    onClick={() => handleReject(req)}
                    disabled={processing === req.id}
                    className="px-3 py-1.5 bg-muted rounded-lg text-foreground text-sm font-semibold disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
