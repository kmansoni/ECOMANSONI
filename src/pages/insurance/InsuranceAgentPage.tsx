import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, LayoutDashboard, Users, FileText, DollarSign,
  Settings, Shield, Star, Wallet, Link2, BarChart3,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AgentDashboard, AgentClients, AgentCommissions,
  AgentBalance, AgentLoyalty, AgentPayouts, AgentReferrals, AgentReports,
} from "@/components/insurance/agent";

const db = supabase as SupabaseClient<any>;

const specializations = ["ОСАГО", "КАСКО", "ДМС", "Travel", "Имущество", "Ипотечное", "Жизнь"];

const fmt = (v: number) => v.toLocaleString("ru-RU") + " ₽";

function AgentPolicies() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: policies = [], isLoading, isError } = useQuery({
    queryKey: ["agent-policies"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await db
        .from("insurance_policies")
        .select("id, policy_number, type, status, premium, coverage_amount, start_date, product_id, company_id, user_id, insurance_companies(name), insurance_products(name)")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = policies.filter((p: any) => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchCategory = categoryFilter === "all" || p.type === categoryFilter;
    return matchStatus && matchCategory;
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Не удалось загрузить полисы</p>
      </div>
    );
  }

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
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">У вас пока нет полисов</p>
          </div>
        ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-muted-foreground font-medium">Полис</th>
              <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">Компания</th>
              <th className="text-left p-3 text-muted-foreground font-medium">Тип</th>
              <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Премия</th>
              <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Покрытие</th>
              <th className="text-center p-3 text-muted-foreground font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((policy: any, i: number) => {
              const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
                active: { label: "Активен", variant: "default" },
                pending: { label: "Ожидание", variant: "secondary" },
                expired: { label: "Истёк", variant: "outline" },
                cancelled: { label: "Отменён", variant: "destructive" },
              };
              const st = statusMap[policy.status] ?? { label: policy.status, variant: "outline" as const };
              const companyName = policy.insurance_companies?.name ?? "—";
              return (
                <motion.tr
                  key={policy.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="p-3">
                    <p className="font-medium text-foreground">{policy.policy_number || policy.id.slice(0, 8)}</p>
                    <p className="text-muted-foreground">{new Date(policy.start_date).toLocaleDateString("ru-RU")}</p>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{companyName}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{policy.type}</Badge>
                  </td>
                  <td className="p-3 text-right text-foreground hidden md:table-cell">{fmt(policy.premium ?? 0)}</td>
                  <td className="p-3 text-right text-green-400 font-semibold hidden md:table-cell">{fmt(policy.coverage_amount ?? 0)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={st.variant} className="text-[10px] h-4 px-1">{st.label}</Badge>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        )}
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
            <div className="overflow-x-auto -mx-4 px-4 mb-6">
              <TabsList className="inline-flex h-auto p-1 min-w-max">
                <TabsTrigger value="dashboard" className="text-[11px] py-2 px-3 gap-1">
                  <LayoutDashboard className="w-3 h-3" />
                  Дашборд
                </TabsTrigger>
                <TabsTrigger value="clients" className="text-[11px] py-2 px-3 gap-1">
                  <Users className="w-3 h-3" />
                  Клиенты
                </TabsTrigger>
                <TabsTrigger value="policies" className="text-[11px] py-2 px-3 gap-1">
                  <FileText className="w-3 h-3" />
                  Полисы
                </TabsTrigger>
                <TabsTrigger value="finance" className="text-[11px] py-2 px-3 gap-1">
                  <Wallet className="w-3 h-3" />
                  Финансы
                </TabsTrigger>
                <TabsTrigger value="referrals" className="text-[11px] py-2 px-3 gap-1">
                  <Link2 className="w-3 h-3" />
                  Рефералы
                </TabsTrigger>
                <TabsTrigger value="reports" className="text-[11px] py-2 px-3 gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Отчёты
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-[11px] py-2 px-3 gap-1">
                  <Settings className="w-3 h-3" />
                  Настройки
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="dashboard">
              <div className="space-y-6">
                <AgentBalance onWithdrawClick={() => setActiveTab("finance")} />
                <AgentLoyalty />
                <AgentDashboard />
              </div>
            </TabsContent>
            <TabsContent value="clients">
              <AgentClients />
            </TabsContent>
            <TabsContent value="policies">
              <AgentPolicies />
            </TabsContent>
            <TabsContent value="finance">
              <div className="space-y-6">
                <AgentBalance />
                <AgentCommissions />
                <AgentPayouts />
              </div>
            </TabsContent>
            <TabsContent value="referrals">
              <AgentReferrals />
            </TabsContent>
            <TabsContent value="reports">
              <AgentReports />
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
