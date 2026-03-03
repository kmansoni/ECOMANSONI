import { motion } from "framer-motion";
import { TrendingUp, FileText, DollarSign, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const kpiCards = [
  { label: "Полисов за месяц", value: "47", icon: FileText, trend: "+12%", color: "text-blue-400" },
  { label: "Комиссия (₽)", value: "184 200", icon: DollarSign, trend: "+8%", color: "text-green-400" },
  { label: "Средний чек", value: "12 430 ₽", icon: BarChart2, trend: "+3%", color: "text-purple-400" },
  { label: "Конверсия", value: "34%", icon: TrendingUp, trend: "+5%", color: "text-orange-400" },
];

const salesData = [
  { month: "Окт", value: 32 },
  { month: "Ноя", value: 38 },
  { month: "Дек", value: 41 },
  { month: "Янв", value: 29 },
  { month: "Фев", value: 44 },
  { month: "Мар", value: 47 },
];

const topProducts = [
  { name: "ОСАГО", count: 18, percent: 38 },
  { name: "КАСКО", count: 12, percent: 26 },
  { name: "ДМС", count: 9, percent: 19 },
  { name: "Travel", count: 5, percent: 11 },
  { name: "Ипотечное", count: 3, percent: 6 },
];

const recentApplications = [
  { id: "П-1247", client: "Иванов А.В.", type: "ОСАГО", amount: "8 420 ₽", status: "active", date: "02.03.2026" },
  { id: "П-1246", client: "Смирнова Е.П.", type: "КАСКО", amount: "34 100 ₽", status: "pending", date: "01.03.2026" },
  { id: "П-1245", client: "Козлов Д.И.", type: "ДМС", amount: "18 600 ₽", status: "active", date: "28.02.2026" },
  { id: "П-1244", client: "Петрова М.С.", type: "Travel", amount: "4 200 ₽", status: "active", date: "27.02.2026" },
  { id: "П-1243", client: "Сидоров К.Н.", type: "ОСАГО", amount: "7 780 ₽", status: "cancelled", date: "25.02.2026" },
];

type StatusKey = "active" | "pending" | "cancelled";
const statusConfig: Record<StatusKey, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  active: { label: "Активен", variant: "default" },
  pending: { label: "Ожидание", variant: "secondary" },
  cancelled: { label: "Отменён", variant: "destructive" },
};

const maxValue = Math.max(...salesData.map((d) => d.value));

export function AgentDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${card.color}`} />
                    <span className="text-xs text-green-400 font-medium">{card.trend}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Продажи за 6 месяцев</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2" style={{ height: "96px" }}>
            {salesData.map((item, i) => (
              <div key={item.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] text-muted-foreground">{item.value}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(item.value / maxValue) * 72}px` }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="w-full bg-primary/70 rounded-t-sm"
                />
                <span className="text-[10px] text-muted-foreground">{item.month}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Топ продукты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProducts.map((product) => (
              <div key={product.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground">{product.name}</span>
                  <span className="text-muted-foreground">{product.count} шт.</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${product.percent}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Последние заявки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentApplications.map((app) => {
              const status = statusConfig[app.status as StatusKey] ?? statusConfig.pending;
              return (
                <div key={app.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-foreground">{app.client}</p>
                    <p className="text-[11px] text-muted-foreground">{app.id} · {app.type} · {app.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground">{app.amount}</p>
                    <Badge variant={status.variant} className="text-[10px] h-4 px-1 mt-0.5">{status.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
