import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface CommissionRow {
  id: string;
  policy: string;
  client: string;
  company: string;
  premium: number;
  rate: number;
  commission: number;
  payStatus: "paid" | "pending" | "processing";
  date: string;
}

const mockCommissions: CommissionRow[] = [
  { id: "k1", policy: "П-1247", client: "Иванов А.В.", company: "Ингосстрах", premium: 8420, rate: 15, commission: 1263, payStatus: "paid", date: "02.03.2026" },
  { id: "k2", policy: "П-1246", client: "Смирнова Е.П.", company: "СОГАЗ", premium: 34100, rate: 12, commission: 4092, payStatus: "processing", date: "01.03.2026" },
  { id: "k3", policy: "П-1245", client: "Козлов Д.И.", company: "АльфаСтрахование", premium: 18600, rate: 18, commission: 3348, payStatus: "paid", date: "28.02.2026" },
  { id: "k4", policy: "П-1244", client: "Петрова М.С.", company: "Ренессанс", premium: 4200, rate: 20, commission: 840, payStatus: "pending", date: "27.02.2026" },
  { id: "k5", policy: "П-1243", client: "Сидоров К.Н.", company: "РОСГОССТРАХ", premium: 7780, rate: 15, commission: 1167, payStatus: "paid", date: "25.02.2026" },
  { id: "k6", policy: "П-1240", client: "Федорова О.А.", company: "СОГАЗ", premium: 42000, rate: 12, commission: 5040, payStatus: "paid", date: "20.02.2026" },
];

const payStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  paid: { label: "Выплачено", variant: "default" },
  processing: { label: "В обработке", variant: "secondary" },
  pending: { label: "Ожидается", variant: "outline" },
};

const periods = [
  { value: "march2026", label: "Март 2026" },
  { value: "february2026", label: "Февраль 2026" },
  { value: "january2026", label: "Январь 2026" },
];

export function AgentCommissions() {
  const [period, setPeriod] = useState("march2026");

  const totalPremium = mockCommissions.reduce((s, r) => s + r.premium, 0);
  const totalCommission = mockCommissions.reduce((s, r) => s + r.commission, 0);
  const paidCommission = mockCommissions.filter((r) => r.payStatus === "paid").reduce((s, r) => s + r.commission, 0);
  const pendingCommission = mockCommissions.filter((r) => r.payStatus !== "paid").reduce((s, r) => s + r.commission, 0);

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
                {mockCommissions.map((row, i) => {
                  const status = payStatusConfig[row.payStatus];
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3">
                        <p className="font-medium text-foreground">{row.policy}</p>
                        <p className="text-muted-foreground">{row.client}</p>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{row.company}</td>
                      <td className="p-3 text-right text-foreground">{fmt(row.premium)}</td>
                      <td className="p-3 text-right text-muted-foreground">{row.rate}%</td>
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
    </div>
  );
}
