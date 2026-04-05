import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabase as SupabaseClient<any>;

const COMMISSION_RATE = 0.1;

const payStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Выплачено", variant: "default" },
  pending: { label: "Ожидается", variant: "outline" },
  expired: { label: "Выплачено", variant: "default" },
  cancelled: { label: "Отменено", variant: "outline" },
};

const periods = [
  { value: "all", label: "Все время" },
  { value: "30d", label: "Последние 30 дней" },
  { value: "90d", label: "Последние 90 дней" },
];

export function AgentCommissions() {
  const [period, setPeriod] = useState("all");

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["agent-commissions", period],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = db
        .from("insurance_policies")
        .select("id, policy_number, premium, status, start_date, insurance_companies(name), insurance_products(name)")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(50);

      if (period === "30d") {
        const d = new Date(); d.setDate(d.getDate() - 30);
        query = query.gte("start_date", d.toISOString());
      } else if (period === "90d") {
        const d = new Date(); d.setDate(d.getDate() - 90);
        query = query.gte("start_date", d.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = policies.map((p: any) => ({
    ...p,
    commission: Math.round((p.premium ?? 0) * COMMISSION_RATE),
    companyName: p.insurance_companies?.name ?? "—",
    productName: p.insurance_products?.name ?? p.policy_number ?? "—",
  }));

  const totalPremium = rows.reduce((s: number, r: any) => s + (r.premium ?? 0), 0);
  const totalCommission = rows.reduce((s: number, r: any) => s + r.commission, 0);
  const paidCommission = rows.filter((r: any) => r.status === "active" || r.status === "expired").reduce((s: number, r: any) => s + r.commission, 0);
  const pendingCommission = totalCommission - paidCommission;

  const fmt = (v: number) => v.toLocaleString("ru-RU") + " \u20bd";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Комиссии</h3>
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
      ) : rows.length === 0 ? (
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
                  <th className="text-right p-3 text-muted-foreground font-medium">Комиссия</th>
                  <th className="text-center p-3 text-muted-foreground font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, i: number) => {
                  const status = payStatusConfig[row.status] ?? { label: row.status, variant: "outline" as const };
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3">
                        <p className="font-medium text-foreground">{row.policy_number || row.id.slice(0, 8)}</p>
                        <p className="text-muted-foreground">{row.productName}</p>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{row.companyName}</td>
                      <td className="p-3 text-right text-foreground">{fmt(row.premium ?? 0)}</td>
                      <td className="p-3 text-right text-muted-foreground">{Math.round(COMMISSION_RATE * 100)}%</td>
                      <td className="p-3 text-right font-semibold text-green-400">{fmt(row.commission)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={status.variant} className="text-[10px] h-4 px-1">{status.label}</Badge>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Separator />
          <div className="flex justify-between items-center p-3">
            <span className="text-sm font-medium text-muted-foreground">Итого сумма страховых премий:</span>
            <span className="text-sm font-bold text-foreground">{fmt(totalPremium)}</span>
          </div>
          <div className="flex justify-between items-center px-3 pb-3">
            <span className="text-sm font-medium text-muted-foreground">Итого комиссия:</span>
            <span className="text-sm font-bold text-green-400">{fmt(totalCommission)}</span>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
