import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Trash2, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInsuranceDrafts, useDeleteDraft } from "@/hooks/insurance/useInsuranceDraft";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  osago: "ОСАГО", kasko: "КАСКО", dms: "ДМС", travel: "ВЗР",
  property: "Имущество", mortgage: "Ипотечное", life: "Жизнь",
};

const TYPE_ROUTES: Record<string, string> = {
  osago: "/insurance/osago", kasko: "/insurance/kasko", dms: "/insurance/dms",
  travel: "/insurance/travel", property: "/insurance/property",
  mortgage: "/insurance/mortgage", life: "/insurance/life",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} д назад`;
}

export function DraftsList() {
  const { data: drafts, isLoading } = useInsuranceDrafts();
  const deleteMut = useDeleteDraft();

  if (isLoading) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3">Незавершённые расчёты</h2>
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </section>
    );
  }

  if (!drafts?.length) return null;

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMut.mutate(id, {
      onSuccess: () => toast.success("Черновик удалён"),
      onError: () => toast.error("Не удалось удалить"),
    });
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Незавершённые расчёты</h2>
      <div className="space-y-2">
        {drafts.map((draft, idx) => {
          const route = TYPE_ROUTES[draft.product_type] ?? "/insurance";
          const label = TYPE_LABELS[draft.product_type] ?? draft.product_type;

          return (
            <motion.div
              key={draft.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Link to={route}>
                <Card className="border-border/50 bg-card hover:bg-card/80 active:scale-[0.98] transition-all">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {draft.title || label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(draft.updated_at)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">
                          шаг {draft.step}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => handleDelete(draft.id, e)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
