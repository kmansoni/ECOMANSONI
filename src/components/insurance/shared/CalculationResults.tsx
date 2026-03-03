import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ExternalLink, GitCompare, ChevronDown, ChevronUp, Award, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPremium, formatCoverage, formatRating } from "@/lib/insurance/formatters";
import type { CalculationResult, CalculationResponse } from "@/types/insurance";

interface CalculationResultsProps {
  response: CalculationResponse;
  onSelect?: (result: CalculationResult) => void;
  onCompare?: (result: CalculationResult) => void;
  comparingIds?: string[];
}

type SortKey = "price" | "rating";

/**
 * Компонент для отображения результатов расчёта страховки
 */
export function CalculationResults({
  response,
  onSelect,
  onCompare,
  comparingIds = [],
}: CalculationResultsProps) {
  const [sortBy, setSortBy] = useState<SortKey>("price");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...response.results].sort((a, b) => {
    if (sortBy === "price") return a.premium_amount - b.premium_amount;
    return b.provider_rating - a.provider_rating;
  });

  const minPrice = Math.min(...response.results.map((r) => r.premium_amount));

  return (
    <div className="space-y-4">
      {/* Заголовок и сортировка */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">
            Найдено {response.results.length} предложений
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={sortBy === "price" ? "default" : "outline"}
            className={cn(
              "text-xs",
              sortBy === "price"
                ? "bg-violet-600 hover:bg-violet-500"
                : "border-white/10 text-white/60 hover:bg-white/5",
            )}
            onClick={() => setSortBy("price")}
          >
            По цене
          </Button>
          <Button
            size="sm"
            variant={sortBy === "rating" ? "default" : "outline"}
            className={cn(
              "text-xs",
              sortBy === "rating"
                ? "bg-violet-600 hover:bg-violet-500"
                : "border-white/10 text-white/60 hover:bg-white/5",
            )}
            onClick={() => setSortBy("rating")}
          >
            По рейтингу
          </Button>
        </div>
      </div>

      {/* Карточки результатов */}
      <div className="space-y-3">
        {sorted.map((result, index) => {
          const isBestPrice = result.premium_amount === minPrice;
          const isExpanded = expandedId === result.id;
          const isComparing = comparingIds.includes(result.id);

          return (
            <motion.div
              key={result.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className={cn(
                  "bg-white/[0.02] border-white/[0.06] transition-all",
                  isComparing && "border-violet-500/40 bg-violet-500/5",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Лого */}
                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {result.provider_logo ? (
                        <img
                          src={result.provider_logo}
                          alt={result.provider_name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-xs text-white/40 text-center leading-tight px-1">
                          {result.provider_name.charAt(0)}
                        </span>
                      )}
                    </div>

                    {/* Основная информация */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">
                              {result.provider_name}
                            </span>
                            {isBestPrice && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 text-xs px-1.5 py-0">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                Лучшая цена
                              </Badge>
                            )}
                            {result.provider_rating >= 4.5 && (
                              <Badge className="bg-violet-500/20 text-violet-400 text-xs px-1.5 py-0">
                                <Award className="w-3 h-3 mr-1" />
                                Рекомендуем
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-xs text-white/60">
                              {formatRating(result.provider_rating)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-white">
                            {formatPremium(result.premium_amount)}
                          </div>
                          {result.premium_monthly && (
                            <div className="text-xs text-white/40">
                              {formatPremium(result.premium_monthly)}/мес
                            </div>
                          )}
                          <div className="text-xs text-white/40 mt-0.5">
                            Покрытие: {formatCoverage(result.coverage_amount)}
                          </div>
                        </div>
                      </div>

                      {/* Features (первые 3) */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {result.features.slice(0, 3).map((feature, i) => (
                          <span
                            key={i}
                            className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>

                      {/* Развернуть/свернуть */}
                      {result.features.length > 3 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-violet-400 mt-2 hover:text-violet-300"
                          onClick={() => setExpandedId(isExpanded ? null : result.id)}
                        >
                          {isExpanded ? (
                            <>Свернуть <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>Подробнее <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      )}

                      {/* Расширенная информация */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-2 pt-2 border-t border-white/5"
                        >
                          <p className="text-xs text-white/50 mb-1">Все включения:</p>
                          <div className="flex flex-wrap gap-1">
                            {result.features.map((f, i) => (
                              <span key={i} className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                                {f}
                              </span>
                            ))}
                          </div>
                          {result.exclusions.length > 0 && (
                            <>
                              <p className="text-xs text-white/50 mb-1 mt-2">Исключения:</p>
                              <div className="flex flex-wrap gap-1">
                                {result.exclusions.map((e, i) => (
                                  <span key={i} className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
                                    {e}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                        </motion.div>
                      )}

                      {/* Кнопки действий */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-xs"
                          onClick={() => onSelect?.(result)}
                        >
                          Оформить
                        </Button>
                        {onCompare && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "border-white/10 text-white/60 hover:bg-white/5 text-xs",
                              isComparing && "border-violet-500/40 text-violet-400",
                            )}
                            onClick={() => onCompare(result)}
                          >
                            <GitCompare className="w-3 h-3 mr-1" />
                            {isComparing ? "В сравнении" : "Сравнить"}
                          </Button>
                        )}
                        {result.purchase_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/10 text-white/60 hover:bg-white/5"
                            asChild
                          >
                            <a href={result.purchase_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Подпись */}
      <p className="text-xs text-white/30 text-center">
        Расчёт предварительный. Окончательная стоимость может отличаться.
      </p>
    </div>
  );
}
