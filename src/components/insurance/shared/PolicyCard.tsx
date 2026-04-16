import { FileText, RefreshCw, AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getCategoryLabel,
  getCategoryColor,
  getCategoryBgColor,
  formatPolicyPeriod,
  getStatusLabel,
  getStatusColor,
  getPolicyProgressPercent,
  getDaysUntilExpiry,
} from "@/lib/insurance/formatters";
import { formatPremium } from "@/lib/insurance/formatters";
import type { InsurancePolicyFull } from "@/types/insurance";

interface PolicyCardProps {
  policy: InsurancePolicyFull;
  onDetails?: (policy: InsurancePolicyFull) => void;
  onRenew?: (policy: InsurancePolicyFull) => void;
  onClaim?: (policy: InsurancePolicyFull) => void;
  className?: string;
}

/**
 * Карточка страхового полиса для страницы "Мои полисы"
 */
export function PolicyCard({
  policy,
  onDetails,
  onRenew,
  onClaim,
  className,
}: PolicyCardProps) {
  const progressPercent = getPolicyProgressPercent(policy.start_date, policy.end_date);
  const daysLeft = getDaysUntilExpiry(policy.end_date);
  const isExpiringSoon = daysLeft > 0 && daysLeft <= 30;
  const isActive = policy.status === "active";

  return (
    <Card
      className={cn(
        "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] transition-all",
        isExpiringSoon && "border-orange-500/30",
        className,
      )}
    >
      <CardContent className="p-4">
        {/* Заголовок */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                getCategoryBgColor(policy.category),
              )}
            >
              <Shield className={cn("w-4 h-4", getCategoryColor(policy.category))} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {getCategoryLabel(policy.category)}
                </span>
                <Badge className={cn("text-xs px-1.5 py-0", getStatusColor(policy.status))}>
                  {getStatusLabel(policy.status)}
                </Badge>
              </div>
              <p className="text-xs text-white/40 mt-0.5 font-mono">
                № {policy.policy_number}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-white">
              {formatPremium(policy.premium_amount)}
            </div>
            <div className="text-xs text-white/40">/год</div>
          </div>
        </div>

        {/* Компания и объект */}
        <div className="mb-3 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            {policy.company?.logo_url ? (
              <img loading="lazy"
                src={policy.company.logo_url}
                alt={policy.company.name}
                className="w-5 h-5 object-contain rounded"
              />
            ) : null}
            <span className="text-xs text-white/50">{policy.company?.name}</span>
          </div>
          {policy.insured_object && (
            <p className="text-xs text-white/40 mt-1 line-clamp-1">
              {policy.insured_object}
            </p>
          )}
        </div>

        {/* Период и прогресс */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
            <span>{formatPolicyPeriod(policy.start_date, policy.end_date)}</span>
            {isActive && daysLeft > 0 && (
              <span className={cn(isExpiringSoon ? "text-orange-400" : "text-white/40")}>
                {daysLeft} дн.
              </span>
            )}
          </div>
          {isActive && (
            <Progress
              value={progressPercent}
              className={cn(
                "h-1",
                isExpiringSoon ? "bg-orange-500/20" : "bg-white/10",
              )}
            />
          )}
          {isExpiringSoon && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              <span className="text-xs text-orange-400">Истекает скоро</span>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
            onClick={() => onDetails?.(policy)}
          >
            <FileText className="w-3 h-3 mr-1" />
            Подробнее
          </Button>
          {isActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
                onClick={() => onRenew?.(policy)}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Продлить
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs"
                onClick={() => onClaim?.(policy)}
              >
                <AlertTriangle className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
