/**
 * Карточка предложения страховой компании
 * @component OfferCard
 */

import React, { useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { InsuranceCompanyFull } from "@/types/insurance";

/**
 * Бейдж предложения
 */
export type OfferBadge = "best_price" | "recommended" | "popular";

/**
 * Интерфейс предложения от страховой компании
 */
export interface Offer {
  id: string;
  companyId: string;
  price: number;
  coverage: string;
  badge?: OfferBadge;
  features: string[];
}

/**
 * Props для компонента OfferCard
 */
export interface OfferCardProps {
  /** Данные предложения */
  offer: Offer;
  /** Информация о компании */
  company: InsuranceCompanyFull;
  /** Выбрано ли предложение */
  selected: boolean;
  /** Callback при выборе */
  onSelect: () => void;
  /** Классы для контейнера */
  className?: string;
}

/**
 * Маппинг типов бейджей на лейблы
 */
const BADGE_LABELS: Record<OfferBadge, string> = {
  best_price: "Лучшая цена",
  recommended: "Рекомендуем",
  popular: "Популярный",
};

/**
 * Карточка предложения страховой компании
 * 
 * @example
 * ```tsx
 * <OfferCard
 *   offer={offer}
 *   company={company}
 *   selected={true}
 *   onSelect={() => handleSelect()}
 * />
 * ```
 */
export const OfferCard: React.FC<OfferCardProps> = memo(({
  offer,
  company,
  selected,
  onSelect,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);

  /** Обработчик сворачивания/разворачивания */
  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <Card
      className={cn(
        "transition-all cursor-pointer",
        selected && "ring-2 ring-primary",
        className
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
    >
      <CardContent className="p-4">
        {/* Основная информация */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Логотип компании (заглушка) */}
            <div className="text-2xl" aria-hidden="true">
              {company.logo_url ? (
                <img loading="lazy"
                  src={company.logo_url}
                  alt={company.name}
                  className="w-10 h-10 object-contain"
                />
              ) : (
                company.name.charAt(0)
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{company.name}</p>
                {offer.badge && (
                  <Badge
                    variant={offer.badge === "best_price" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {BADGE_LABELS[offer.badge]}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {company.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({company.reviews_count.toLocaleString()} отзывов)
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">
              {offer.price.toLocaleString("ru-RU")} ₽
            </p>
            <p className="text-xs text-muted-foreground">в год</p>
          </div>
        </div>

        {/* Расширенная информация */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 space-y-2"
          >
            <Separator />
            <p className="text-xs text-muted-foreground">
              Покрытие: {offer.coverage}
            </p>
            <ul className="space-y-1" aria-label="Преимущества">
              {offer.features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span className="text-green-500 shrink-0" aria-hidden="true">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Среднее время выплаты: {company.avg_claim_days} дней
            </p>
            <p className="text-xs text-muted-foreground">
              Процент одобрений: {company.claim_approval_rate}%
            </p>
          </motion.div>
        )}

        {/* Кнопки действий */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="flex-1"
            aria-label={selected ? "Выбрано" : "Выбрать"}
          >
            {selected ? "Выбрано" : "Выбрать"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand();
            }}
            aria-expanded={expanded}
            aria-label={expanded ? "Свернуть" : "Подробнее"}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

OfferCard.displayName = "OfferCard";

export default OfferCard;
