import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase, dbLoose } from "@/lib/supabase";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  confirmed: { label: "Подтверждена", variant: "default" },
  paid: { label: "Выплачено", variant: "default" },
  pending: { label: "Ожидается", variant: "secondary" },
  cancelled: { label: "Отменена", variant: "destructive" },
};

const periods = [
  { value: "all", label: "Все время" },
  { value: "30d", label: "Последние 30 дней" },
  { value: "90d", label: "Последние 90 дней" },
];

const statusFilters = [
  { value: "all", label: "Все статусы" },
  { value: "pending", label: "Ожидается" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "paid", label: "Выплачено" },
  { value: "cancelled", label: "Отменена" },
];

type SortField = "date" | "amount";
type SortDir = "asc" | "desc";

export function AgentCommissions() {
  const [period, setPeriod] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ["agent-commissions-real", period],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Получаем agent_id
      const { data: profile } = await dbLoose
        .from("agent_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return [];

      const agentId = (profile as any).id;

      let query = dbLoose
        .from("insurance_commissions")
        .select("*, insurance_policies(policy_number, premium, insurance_companies(name), insurance_products(name))")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (period === "30d") {
        const d = new Date(); d.setDate(d.getDate() - 30);
        query = query.gte("created_at", d.toISOString());
      } else if (period === "90d") {
        const d = new Date(); d.setDate(d.getDate() - 90);
        query = query.gte("created_at", d.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Фильтрация по статусу
  const filtered = commissions.filter((c: any) =>
    statusFilter === "all" || c.status === statusFilter
  );

  // Сортировка
  const sorted = [...filtered].sort((a: any, b: any) => {
    if (sortField === "date") {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? diff : -diff;
    }
    const diff = a.amount - b.amount;
    return sortDir === "asc" ? diff : -diff;
  });

  const totalCommission = filtered.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const paidCommission = filtered
    .filter((r: any) => r.status === "paid" || r.status === "confirmed")
    .reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const pendingCommission = filtered
    .filter((r: any) => r.status === "pending")
    .reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  const fmt = (v: number) => v.toLocaleString("ru-RU") + " \u20bd";

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-foreground">Комиссии</h3>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFilters.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Итого комиссий", value: fmt(totalCommission), color: "text-foreground" },
          { label: "Выплачено", value: fmt(paidCommission), color: "text-green-400" },
          { label: "Ожидается", value: fmt(pendingCommission), color: "text-orange-400" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="bg-card border-border">
              <CardContent className="p-3">
                <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Комиссий пока нет</p>
          <p className="text-xs mt-1">Они появятся после первых оформленных полисов</p>
        </div>
      ) : (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Детали комиссий</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-medium">Полис</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">Компания</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Премия</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Ставка</th>
                  <th className="p-3 text-muted-foreground font-medium text-right">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("amount")}>
                      Комиссия <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="p-3 text-muted-foreground font-medium text-center">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("date")}>
                      Дата <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center p-3 text-muted-foreground font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row: any, i: number) => {
                  const st = statusConfig[row.status] ?? { label: row.status, variant: "outline" as const };
                  const policy = row.insurance_policies;
                  const policyNumber = policy?.policy_number ?? "—";
                  const companyName = policy?.insurance_companies?.name ?? "—";
                  const premium = policy?.premium ?? 0;
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3">
                        <p className="font-medium text-foreground">{policyNumber}</p>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{companyName}</td>
                      <td className="p-3 text-right text-foreground">{fmt(premium)}</td>
                      <td className="p-3 text-right text-muted-foreground">{Math.round(row.rate * 100)}%</td>
                      <td className="p-3 text-right font-semibold text-green-400">{fmt(row.amount)}</td>
                      <td className="p-3 text-center text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={st.variant} className="text-[10px] h-4 px-1">{st.label}</Badge>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Separator />
          <div className="flex justify-between items-center p-3">
            <span className="text-sm font-medium text-muted-foreground">Итого комиссия:</span>
            <span className="text-sm font-bold text-green-400">{fmt(totalCommission)}</span>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
