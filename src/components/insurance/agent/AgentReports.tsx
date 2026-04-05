import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAgentTransactions } from "@/hooks/insurance/useInsuranceAgent";
import { formatCurrency } from "@/lib/insurance/loyalty";

const periods = [
  { value: "month", label: "Последний месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
  { value: "all", label: "За всё время" },
];

export function AgentReports() {
  const [period, setPeriod] = useState("month");
  const { data, isLoading, error } = useAgentTransactions(period);

  const metrics = useMemo(() => {
    if (!data?.items?.length) return null;
    const commissions = data.items.filter(t => t.kind === "commission");
    const totalPremium = commissions.reduce((s, t) => s + (t.amount / (t.rate ?? 0.1)), 0);
    const totalComm = commissions.reduce((s, t) => s + t.amount, 0);
    const count = commissions.length;
    const avgCheck = count > 0 ? Math.round(totalPremium / count) : 0;
    // конверсия: полисы / все транзакции
    const convPct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
    return { count, totalPremium: Math.round(totalPremium), totalComm, avgCheck, convPct };
  }, [data]);

  function exportCsv() {
    if (!data?.items?.length) return;
    const header = "ID;Сумма;Тип;Статус;Дата\n";
    const rows = data.items
      .map(t => `${t.id};${t.amount};${t.kind};${t.status};${t.created_at}`)
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${period}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Отчёты</h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Card className="bg-card border-border">
          <CardContent className="p-6 text-center text-sm text-destructive">
            Не удалось загрузить данные
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-3/4" />)}
          </CardContent>
        </Card>
      ) : !metrics ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <FileBarChart className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">За выбранный период данных нет</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {periods.find(p => p.value === period)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Полисов оформлено" value={String(metrics.count)} />
              <Row label="Общая премия" value={formatCurrency(metrics.totalPremium)} />
              <Row label="Комиссия" value={formatCurrency(metrics.totalComm)} />
              <Row label="Средний чек" value={formatCurrency(metrics.avgCheck)} />
              <Row label="Конверсия" value={`${metrics.convPct}%`} />
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full mt-3" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1.5" />
            Экспорт в CSV
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
