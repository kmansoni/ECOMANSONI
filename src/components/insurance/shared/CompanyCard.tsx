import { Star, ExternalLink, Shield, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCategoryLabel, formatRating, formatReviewsCount } from "@/lib/insurance/formatters";
import type { InsuranceCompanyFull } from "@/types/insurance";

interface CompanyCardProps {
  company: InsuranceCompanyFull;
  onDetails?: (company: InsuranceCompanyFull) => void;
  onProducts?: (company: InsuranceCompanyFull) => void;
  className?: string;
}

/**
 * Карточка страховой компании
 */
export function CompanyCard({
  company,
  onDetails,
  onProducts,
  className,
}: CompanyCardProps) {
  return (
    <Card
      className={cn(
        "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1] transition-all",
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Лого */}
          <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/5">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <Shield className="w-6 h-6 text-white/30" />
            )}
          </div>

          {/* Информация */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {company.name}
                  </h3>
                  {company.is_partner && (
                    <Badge className="bg-violet-500/20 text-violet-400 text-xs px-1.5 py-0 flex-shrink-0">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Партнёр
                    </Badge>
                  )}
                </div>
                {/* Рейтинг */}
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "w-3 h-3",
                          star <= Math.round(company.rating)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-white/20",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-white/60">
                    {formatRating(company.rating)}
                  </span>
                  <span className="text-xs text-white/30">·</span>
                  <span className="text-xs text-white/40">
                    {formatReviewsCount(company.reviews_count)}
                  </span>
                </div>
              </div>
            </div>

            {/* Описание */}
            {company.description && (
              <p className="text-xs text-white/50 mt-1.5 line-clamp-2">
                {company.description}
              </p>
            )}

            {/* Категории */}
            <div className="flex flex-wrap gap-1 mt-2">
              {company.categories.slice(0, 4).map((cat) => (
                <span
                  key={cat}
                  className="text-xs bg-white/5 text-white/40 px-1.5 py-0.5 rounded-md"
                >
                  {getCategoryLabel(cat)}
                </span>
              ))}
              {company.categories.length > 4 && (
                <span className="text-xs text-white/30 px-1.5 py-0.5">
                  +{company.categories.length - 4}
                </span>
              )}
            </div>

            {/* Кнопки */}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-xs"
                onClick={() => onProducts?.(company)}
              >
                Продукты
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-white/10 text-white/60 hover:bg-white/5 text-xs"
                onClick={() => onDetails?.(company)}
              >
                Подробнее
              </Button>
              {company.website && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-white/60 hover:bg-white/5"
                  asChild
                >
                  <a href={company.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
