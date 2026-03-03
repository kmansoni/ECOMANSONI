import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, Users, FileText, DollarSign, Settings, Shield, Star } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AgentDashboard, AgentClients, AgentCommissions } from "@/components/insurance/agent";

// Policies tab mock data
interface Policy {
  id: string;
  client: string;
  company: string;
  category: string;
  amount: string;
  commission: string;
  status: "active" | "pending" | "expired" | "cancelled";
  date: string;
}

const mockPolicies: Policy[] = [
  { id: "П-1247", client: "Иванов А.В.", company: "Ингосстрах", category: "ОСАГО", amount: "8 420 \u20bd", commission: "1 263 \u20bd", status: "active", date: "02.03.2026" },
  { id: "П-1246", client: "Смирнова Е.П.", company: "СОГАЗ", category: "КАСКО", amount: "34 100 \u20bd", commission: "4 092 \u20bd", status: "pending", date: "01.03.2026" },
  { id: "П-1245", client: "Козлов Д.И.", company: "АльфаСтрахование", category: "ДМС", amount: "18 600 \u20bd", commission: "3 348 \u20bd", status: "active", date: "28.02.2026" },
  { id: "П-1244", client: "Петрова М.С.", company: "Ренессанс", category: "Travel", amount: "4 200 \u20bd", commission: "840 \u20bd", status: "active", date: "27.02.2026" },
  { id: "П-1243", client: "Сидоров К.Н.", company: "РОСГОССТРАХ", category: "ОСАГО", amount: "7 780 \u20bd", commission: "1 167 \u20bd", status: "cancelled", date: "25.02.2026" },
  { id: "П-1240", client: "Федорова О.А.", company: "СОГАЗ", category: "Ипотечное", amount: "42 000 \u20bd", commission: "5 040 \u20bd", status: "active", date: "20.02.2026" },
];

const policyStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Активен", variant: "default" },
  pending: { label: "Ожидание", variant: "secondary" },
  expired: { label: "Истёк", variant: "outline" },
  cancelled: { label: "Отменён", variant: "destructive" },
};

// Settings tab
const specializations = ["ОСАГО", "КАСКО", "ДМС", "Travel", "Имущество", "Ипотечное", "Жизнь"];

function AgentPolicies() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = mockPolicies.filter((p) => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
    return matchStatus && matchCategory;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="pending">Ожидание</SelectItem>
            <SelectItem value="expired">Истёкшие</SelectItem>
            <SelectItem value="cancelled">Отменённые</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {specializations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-muted-foreground font-medium">Полис</th>
              <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">Компания</th>
              <th className="text-left p-3 text-muted-foreground font-medium">Категория</th>
              <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Сумма</th>
              <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Комиссия</th>
              <th className="text-center p-3 text-muted-foreground font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((policy, i) => {
              const status = policyStatusConfig[policy.status];
              return (
                <motion.tr
                  key={policy.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="p-3">
                    <p className="font-medium text-foreground">{policy.id}</p>
                    <p className="text-muted-foreground">{policy.client}</p>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{policy.company}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{policy.category}</Badge>
                  </td>
                  <td className="p-3 text-right text-foreground hidden md:table-cell">{policy.amount}</td>
                  <td className="p-3 text-right text-green-400 font-semibold hidden md:table-cell">{policy.commission}</td>
                  <td className="p-3 text-center">
                    <Badge variant={status.variant} className="text-[10px] h-4 px-1">{status.label}</Badge>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentSettings() {
  const [selectedSpecs, setSelectedSpecs] = useState(["ОСАГО", "КАСКО", "ДМС"]);

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-foreground">Профиль агента</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Лицензия агента</label>
            <Input defaultValue="АГ-2024-12345" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
            <Input defaultValue="Агентов Иван Сергеевич" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
            <Input defaultValue="+7 (999) 123-45-67" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <Input defaultValue="agent@insurance.ru" type="email" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Специализации</label>
            <div className="flex flex-wrap gap-2">
              {specializations.map((spec) => (
                <button
                  key={spec}
                  onClick={() => toggleSpec(spec)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    selectedSpecs.includes(spec)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {spec}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-foreground">Банковские реквизиты</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название банка</label>
            <Input defaultValue="Сбербанк" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Расчётный счёт</label>
            <Input defaultValue="40817810000000000000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">БИК</label>
            <Input defaultValue="044525225" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ИНН</label>
            <Input defaultValue="770112345678" />
          </div>
          <Button className="w-full">Сохранить реквизиты</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InsuranceAgentPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/insurance")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground">Панель агента</h1>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          <span className="text-xs text-muted-foreground">4.8</span>
        </div>
      </div>

      <div className="p-4 pb-24">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-5 h-auto p-1 mb-6 overflow-x-auto">
              <TabsTrigger value="dashboard" className="text-[11px] py-2 gap-1">
                <LayoutDashboard className="w-3 h-3" />
                <span className="hidden xs:inline">Дашборд</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="text-[11px] py-2 gap-1">
                <Users className="w-3 h-3" />
                <span className="hidden xs:inline">Клиенты</span>
              </TabsTrigger>
              <TabsTrigger value="policies" className="text-[11px] py-2 gap-1">
                <FileText className="w-3 h-3" />
                <span className="hidden xs:inline">Полисы</span>
              </TabsTrigger>
              <TabsTrigger value="commissions" className="text-[11px] py-2 gap-1">
                <DollarSign className="w-3 h-3" />
                <span className="hidden xs:inline">Комиссии</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-[11px] py-2 gap-1">
                <Settings className="w-3 h-3" />
                <span className="hidden xs:inline">Настройки</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <AgentDashboard />
            </TabsContent>
            <TabsContent value="clients">
              <AgentClients />
            </TabsContent>
            <TabsContent value="policies">
              <AgentPolicies />
            </TabsContent>
            <TabsContent value="commissions">
              <AgentCommissions />
            </TabsContent>
            <TabsContent value="settings">
              <AgentSettings />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
