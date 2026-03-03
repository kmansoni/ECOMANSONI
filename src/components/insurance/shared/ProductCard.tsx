import { Check, GitCompare, Calculator, Info, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getCategoryLabel,
  getCategoryColor,
  getCategoryBgColor,
  formatPremium,
  formatCoverage,
  formatRating,
} from "@/lib/insurance/formatters";
import type { InsuranceProductFull } from "@/types/insurance";

interface ProductCardProps {
  product: InsuranceProductFull;
  onCalculate?: (product: InsuranceProductFull) => void;
  onCompare?: (product: InsuranceProductFull) => void;
  onDetails?: (product: InsuranceProductFull) => void;
  isComparing?: boolean;
  className?: string;
}

/**
 * Карточка страхового продукта
 */
export function ProductCard({
  product,
  onCalculate,
  onCompare,
  onDetails,
  isComparing = false,
  className,
}: ProductCardProps) {
  return (
    <Card
      className={cn(
        "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] transition-all",
        isComparing && "border-violet-500/40 bg-violet-500/5",
        className,
      )}
    >
      <CardContent className="p-4">
        {/* Категория и бейджи */}
        <div className="flex items-center justify-between mb-3">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              getCategoryBgColor(product.category),
              getCategoryColor(product.category),
            )}
          >
            {getCategoryLabel(product.category)}
          </span>
          <div className="flex gap-1">
            {product.is_popular && (
              <Badge className="bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0">
                <TrendingUp className="w-3 h-3 mr-1" />
                Популярный
              </Badge>
            )}
            {product.is_recommended && (
              <Badge className="bg-emerald-500/20 text-emerald-400 text-xs px-1.5 py-0">
                Рекомендуем
              </Badge>
            )}
          </div>
        </div>

        {/* Название и компания */}
        <h3 className="text-sm font-semibold text-white mb-0.5 line-clamp-1">
          {product.name}
        </h3>
        <p className="text-xs text-white/50 mb-2">{product.company?.name}</p>

        {/* Рейтинг */}
        <div className="flex items-center gap-1.5 mb-3">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-xs text-white/60">{formatRating(product.rating)}</span>
          {product.reviews_count > 0 && (
            <span className="text-xs text-white/30">
              ({product.reviews_count})
            </span>
          )}
        </div>

        {/* Цена и покрытие */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-white/40">от</div>
            <div className="text-lg font-bold text-white">
              {formatPremium(product.premium_from)}
            </div>
          </div>
          {product.coverage_amount > 0 && (
            <div className="text-right">
              <div className="text-xs text-white/40">Покрытие</div>
              <div className="text-sm font-medium text-emerald-400">
                {formatCoverage(product.coverage_amount)}
              </div>
            </div>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-1 mb-3">
          {product.features.slice(0, 4).map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-white/50 line-clamp-1">{feature}</span>
            </li>
          ))}
          {product.features.length > 4 && (
            <li className="text-xs text-white/30 pl-5">
              +{product.features.length - 4} ещё
            </li>
          )}
        </ul>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-xs"
            onClick={() => onCalculate?.(product)}
          >
            <Calculator className="w-3 h-3 mr-1" />
            Рассчитать
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "border-white/10 text-white/60 hover:bg-white/5",
              isComparing && "border-violet-500/40 text-violet-400",
            )}
            onClick={() => onCompare?.(product)}
          >
            <GitCompare className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/10 text-white/60 hover:bg-white/5"
            onClick={() => onDetails?.(product)}
          >
            <Info className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
