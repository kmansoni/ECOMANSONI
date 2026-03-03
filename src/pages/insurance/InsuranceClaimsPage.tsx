import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft, Plus, FileText, Clock, CheckCircle2,
  XCircle, CreditCard, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClaimStatus } from "@/types/insurance";
import { cn } from "@/lib/utils";

interface MockClaim {
  id: string;
  policyNumber: string;
  companyName: string;
  category: string;
  status: ClaimStatus;
  date: string;
  incidentDate: string;
  description: string;
  amount: number;
  approvedAmount?: number;
}

const MOCK_CLAIMS: MockClaim[] = [
  {
    id: "c1",
    policyNumber: "ОСАГО-2025-001234",
    companyName: "Тинькофф Страхование",
    category: "ОСАГО",
    status: "under_review",
    date: "20 фев 2026",
    incidentDate: "18 фев 2026",
    description: "Столкновение на перекрёстке Ленина / Мира. Повреждён левый передний бампер.",
    amount: 45000,
  },
  {
    id: "c2",
    policyNumber: "КАСКО-2024-005678",
    companyName: "Ингосстрах",
    category: "КАСКО",
    status: "approved",
    date: "05 янв 2026",
    incidentDate: "03 янв 2026",
    description: "Повреждение лобового стекла от камня на трассе М4.",
    amount: 18500,
    approvedAmount: 18500,
  },
  {
    id: "c3",
    policyNumber: "ДМС-2025-009012",
    companyName: "СОГАЗ",
    category: "ДМС",
    status: "paid",
    date: "12 дек 2025",
    incidentDate: "10 дек 2025",
    description: "Госпитализация, лечение острого бронхита.",
    amount: 32000,
    approvedAmount: 30000,
  },
  {
    id: "c4",
    policyNumber: "КАСКО-2025-003344",
    companyName: "РЕСО-Гарантия",
    category: "КАСКО",
    status: "rejected",
    date: "01 ноя 2025",
    incidentDate: "30 окт 2025",
    description: "Царапины на дверях — не признано страховым случаем.",
    amount: 12000,
  },
];

const STATUS_CONFIG: Record<ClaimStatus, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  submitted: { label: "Подано", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/20" },
  under_review: { label: "На рассмотрении", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20" },
  approved: { label: "Одобрено", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  rejected: { label: "Отклонено", icon: XCircle, color: "text-red-400", bg: "bg-red-500/20" },
  paid: { label: "Выплачено", icon: CreditCard, color: "text-violet-400", bg: "bg-violet-500/20" },
};

type TabFilter = "all" | ClaimStatus;

const TABS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "under_review", label: "На рассмотрении" },
  { key: "approved", label: "Одобрено" },
  { key: "rejected", label: "Отклонено" },
  { key: "paid", label: "Выплачено" },
];

export default function InsuranceClaimsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabFilter>("all");

  const claims = tab === "all" ? MOCK_CLAIMS : MOCK_CLAIMS.filter((c) => c.status === tab);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-white/40">
              <Link to="/insurance" className="hover:text-white/60">Страхование</Link>
              {" → "}
              Страховые случаи
            </p>
            <h1 className="text-base font-semibold text-white">Мои страховые случаи</h1>
          </div>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-xs gap-1"
            onClick={() => navigate("/insurance/claims/new")}
          >
            <Plus className="w-3 h-3" />
            Заявить
          </Button>
        </div>

        {/* Status tabs */}
        <div className="px-4 pb-3 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none" as React.CSSProperties["scrollbarWidth"] }}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
            <TabsList className="bg-white/5 h-8">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="text-xs px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {claims.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-sm font-medium text-white/60 mb-1">У вас нет страховых случаев</p>
            <p className="text-xs text-white/30 mb-6">Здесь будут отображаться ваши заявления</p>
            <Button
              className="bg-violet-600 hover:bg-violet-500 gap-2 text-sm"
              onClick={() => navigate("/insurance/claims/new")}
            >
              <Plus className="w-4 h-4" />
              Заявить о страховом случае
            </Button>
          </motion.div>
        ) : (
          claims.map((claim, idx) => {
            const cfg = STATUS_CONFIG[claim.status];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={claim.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
              >
                <Card className="bg-white/[0.02] border-white/[0.06] hover:border-white/[0.10] transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">{claim.companyName}</p>
                        <p className="text-sm font-semibold text-white">{claim.policyNumber}</p>
                        <p className="text-xs text-violet-400">{claim.category}</p>
                      </div>
                      <Badge className={cn("gap-1 text-xs", cfg.bg, cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </Badge>
                    </div>

                    <p className="text-xs text-white/50 mb-3 line-clamp-2">{claim.description}</p>

                    <div className="flex items-center justify-between text-xs text-white/40">
                      <span>Случай: {claim.incidentDate}</span>
                      <span>Подано: {claim.date}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/40">Заявленная сумма</p>
                        <p className="text-sm font-bold text-white">
                          {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(claim.amount)}
                        </p>
                      </div>
                      {claim.approvedAmount !== undefined && (
                        <div className="text-right">
                          <p className="text-xs text-white/40">Одобрено</p>
                          <p className={cn("text-sm font-bold", claim.status === "paid" ? "text-violet-400" : "text-emerald-400")}>
                            {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(claim.approvedAmount)}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
