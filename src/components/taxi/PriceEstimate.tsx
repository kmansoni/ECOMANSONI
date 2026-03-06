import { CreditCard, Tag, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { TariffEstimate, PaymentMethod, PromoCode } from '@/types/taxi';
import { formatTripPrice, formatDistance, formatEta, formatPaymentMethod, formatSurge } from '@/lib/taxi/formatters';

interface PriceEstimateProps {
  estimate: TariffEstimate;
  paymentMethod: PaymentMethod;
  promoCode?: PromoCode | null;
  className?: string;
}

export function PriceEstimate({
  estimate,
  paymentMethod,
  promoCode,
  className,
}: PriceEstimateProps) {
  const [expanded, setExpanded] = useState(false);

  const isSurge = estimate.surgeMultiplier > 1.0;
  const discount = promoCode?.isValid
    ? promoCode.discountPercent
      ? Math.round(estimate.estimatedPrice * promoCode.discountPercent / 100)
      : (promoCode.discount ?? 0)
    : 0;
  const finalPrice = Math.max(0, estimate.estimatedPrice - discount);

  // Детализация стоимости
  const baseFare = estimate.basePrice;
  const distanceFare = estimate.estimatedDistance * estimate.pricePerKm;
  const durationFare = estimate.estimatedDuration * estimate.pricePerMin;
  const subTotal = baseFare + distanceFare + durationFare;
  const surgeAmount = isSurge ? subTotal * (estimate.surgeMultiplier - 1) : 0;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Основная строка цены */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-foreground">
            {formatTripPrice(finalPrice)}
          </span>
          {discount > 0 && (
            <span className="text-sm line-through text-muted-foreground">
              {formatTripPrice(estimate.estimatedPrice)}
            </span>
          )}
        </div>

        {/* Кнопка детализации */}
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Детали
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Маршрут + время */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{formatDistance(estimate.estimatedDistance)}</span>
        <span>·</span>
        <span>~{formatEta(estimate.estimatedDuration)}</span>
      </div>

      {/* Surge-предупреждение */}
      {isSurge && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-orange-50 border border-orange-100">
          <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-orange-700">
            <span className="font-semibold">Повышенный спрос {formatSurge(estimate.surgeMultiplier)}</span>
            <span className="ml-1">— цены временно выше обычного</span>
          </div>
        </div>
      )}

      {/* Детализация (раскрываемая) */}
      {expanded && (
        <div className="rounded-xl bg-muted/50 p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Посадка</span>
            <span>{formatTripPrice(baseFare)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {formatDistance(estimate.estimatedDistance)} × {estimate.pricePerKm} ₽
            </span>
            <span>{formatTripPrice(distanceFare)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {formatEta(estimate.estimatedDuration)} × {estimate.pricePerMin} ₽/мин
            </span>
            <span>{formatTripPrice(durationFare)}</span>
          </div>
          {isSurge && (
            <div className="flex justify-between text-orange-600">
              <span>Надбавка surge {formatSurge(estimate.surgeMultiplier)}</span>
              <span>+{formatTripPrice(surgeAmount)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Промокод {promoCode?.code}</span>
              <span>−{formatTripPrice(discount)}</span>
            </div>
          )}
          <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
            <span>Итого</span>
            <span>{formatTripPrice(finalPrice)}</span>
          </div>
        </div>
      )}

      {/* Способ оплаты */}
      <div className="flex items-center gap-2 py-2 px-3 rounded-xl border border-border bg-background">
        <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm flex-1">{formatPaymentMethod(paymentMethod)}</span>
      </div>

      {/* Промокод */}
      {promoCode?.isValid && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <Tag className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm text-emerald-700 flex-1">
            {promoCode.code} — {promoCode.description}
          </span>
          <span className="text-sm font-semibold text-emerald-700">
            −{formatTripPrice(discount)}
          </span>
        </div>
      )}
    </div>
  );
}
