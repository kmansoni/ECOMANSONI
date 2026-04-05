import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Shield, Calendar, Download, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useInsurancePolicy } from "@/hooks/insurance/useInsurancePolicies";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "destructive" | "secondary" }> = {
  active: { label: "Активен", variant: "default" },
  expired: { label: "Истёк", variant: "destructive" },
  pending: { label: "Ожидает", variant: "secondary" },
};

export default function InsurancePolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: policy, isLoading } = useInsurancePolicy(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Полис не найден</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Назад</Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[policy.status] ?? STATUS_CONFIG.pending;
  const startDate = policy.start_date ? new Date(policy.start_date) : null;
  const endDate = policy.end_date ? new Date(policy.end_date) : null;
  const now = new Date();
  const totalDays = startDate && endDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000)) : 365;
  const daysLeft = endDate ? Math.max(0, Math.round((endDate.getTime() - now.getTime()) / 86400000)) : 0;
  const progressPercent = Math.round((daysLeft / totalDays) * 100);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Мои полисы</p>
            <h1 className="text-base font-semibold">{policy.policy_number || id}</h1>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Main info */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{policy.category}</CardTitle>
                <p className="text-sm text-muted-foreground">{policy.company?.name ?? '—'}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Осталось дней</span>
                <span className="font-medium">{daysLeft} из {totalDays}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Начало</p>
                <p className="text-sm font-medium flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {startDate ? startDate.toLocaleDateString("ru-RU") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Окончание</p>
                <p className="text-sm font-medium flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {endDate ? endDate.toLocaleDateString("ru-RU") : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial info */}
        <Card className="border-border/50">
          <CardContent className="pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Страховая премия</p>
              <p className="text-sm font-semibold">{(policy.premium_amount ?? 0).toLocaleString("ru-RU")} ₽</p>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Страховое покрытие</p>
              <p className="text-sm font-semibold text-emerald-400">
                {(policy.coverage_amount ?? 0).toLocaleString("ru-RU")} ₽
              </p>
            </div>
            {policy.insured_object && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Объект страхования</p>
                  <p className="text-sm">{policy.insured_object}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button className="w-full" variant="default">
            <RotateCcw className="w-4 h-4 mr-2" />
            Продлить полис
          </Button>
          <Button className="w-full" variant="outline" onClick={() => navigate(`/insurance/claims/new?policy=${id}`)}>
            <AlertCircle className="w-4 h-4 mr-2" />
            Заявить о страховом случае
          </Button>
          <Button className="w-full" variant="ghost">
            <Download className="w-4 h-4 mr-2" />
            Скачать PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
