import { useMemo } from "react";
import { motion } from "framer-motion";
import { FileText, DollarSign, BarChart2, TrendingUp, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentTransactions } from "@/hooks/insurance/useInsuranceAgent";
import { formatCurrency } from "@/lib/insurance/loyalty";
import { CRMLib, type CRMTask } from "@/lib/crm";

const crmInsurance = new CRMLib("insurance");

const priorityColors: Record<string, string> = {
  high: "text-red-400",
  medium: "text-orange-400",
  low: "text-muted-foreground",
};

export function AgentDashboard() {
  const { data, isLoading, error } = useAgentTransactions("month");

  // CRM задачи
  const { data: crmTasks = [], isLoading: tasksLoading } = useQuery<CRMTask[]>({
    queryKey: ["crm-agent-tasks"],
    queryFn: async () => {
      try {
        const tasks = await crmInsurance.getTasks("pending");
        const inProgress = await crmInsurance.getTasks("in_progress");
        return [...tasks, ...inProgress].sort((a: CRMTask, b: CRMTask) => {
          const pa = a.priority === "high" ? 0 : a.priority === "medium" ? 1 : 2;
          const pb = b.priority === "high" ? 0 : b.priority === "medium" ? 1 : 2;
          return pa - pb;
        });
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!data?.items?.length) return null;
    const commissions = data.items.filter(t => t.kind === "commission");
    const totalComm = commissions.reduce((s, t) => s + t.amount, 0);
    const count = commissions.length;
    const avgCheck = count > 0 ? Math.round(totalComm / count) : 0;
    return { count, totalComm, avgCheck, total: data.total };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Не удалось загрузить статистику
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <div className="space-y-4">
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <BarChart2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Оформите первый полис для начала статистики</p>
          </CardContent>
        </Card>
        <CRMTasksSection tasks={crmTasks} isLoading={tasksLoading} />
      </div>
    );
  }

  const kpi = [
    { label: "Полисов за месяц", value: String(metrics.count), icon: FileText, color: "text-blue-400" },
    { label: "Комиссия (\u20bd)", value: formatCurrency(metrics.totalComm), icon: DollarSign, color: "text-green-400" },
    { label: "Средний чек", value: formatCurrency(metrics.avgCheck), icon: BarChart2, color: "text-purple-400" },
    { label: "Транзакций", value: String(metrics.total), icon: TrendingUp, color: "text-orange-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {kpi.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <Icon className={`w-4 h-4 mb-2 ${card.color}`} />
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {data?.items?.length ? (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Последние операции</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.slice(0, 5).map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {tx.kind === "commission" ? "Комиссия" : "Выплата"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                  <Badge
                    variant={tx.status === "confirmed" || tx.status === "completed" ? "default" : "secondary"}
                    className="text-[10px] h-4 px-1 mt-0.5"
                  >
                    {tx.status === "confirmed" || tx.status === "completed" ? "Выполнено" : "Ожидание"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <CRMTasksSection tasks={crmTasks} isLoading={tasksLoading} />
    </div>
  );
}

function CRMTasksSection({ tasks, isLoading }: { tasks: CRMTask[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          CRM Задачи
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{tasks.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Нет активных задач</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                  {task.due_date && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(task.due_date).toLocaleDateString("ru-RU")}
                      {new Date(task.due_date) < new Date() && (
                        <AlertCircle className="w-3 h-3 text-red-400" />
                      )}
                    </p>
                  )}
                </div>
                <Badge
                  variant={task.priority === "high" ? "destructive" : "secondary"}
                  className="text-[10px] h-4 px-1 ml-2"
                >
                  {task.priority === "high" ? "Срочно" : task.priority === "medium" ? "Средний" : "Низкий"}
                </Badge>
              </div>
            ))}
            {tasks.length > 5 && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                +{tasks.length - 5} ещё
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
