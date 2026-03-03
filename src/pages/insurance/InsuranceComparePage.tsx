import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, GitCompare, Check, X, Star, ShoppingCart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InsuranceCategoryTabs } from "@/components/insurance/shared/InsuranceCategoryTabs";
import { formatPremium, formatCoverage, formatRating } from "@/lib/insurance/formatters";
import type { InsuranceCategory } from "@/types/insurance";
import { cn } from "@/lib/utils";

const MOCK_PRODUCTS = [
  {
    id: "1",
    name: "ОСАГО Стандарт",
    category: "osago" as InsuranceCategory,
    companyName: "Ингосстрах",
    premium: 8500,
    coverage: 400000,
    companyRating: 4.5,
    claimDays: 12,
    approvalRate: 91,
    deductible: 0,
    features: ["Онлайн оформление", "Электронный полис", "Круглосуточная поддержка", "Мобильное приложение"],
  },
  {
    id: "2",
    name: "ОСАГО Онлайн",
    category: "osago" as InsuranceCategory,
    companyName: "Тинькофф Страхование",
    premium: 7800,
    coverage: 400000,
    companyRating: 4.7,
    claimDays: 8,
    approvalRate: 95,
    deductible: 0,
    features: ["Онлайн оформление", "Моментальная выдача", "Партнёрские СТО", "Помощь на дороге"],
  },
  {
    id: "3",
    name: "ОСАГО Классик",
    category: "osago" as InsuranceCategory,
    companyName: "РЕСО-Гарантия",
    premium: 9200,
    coverage: 400000,
    companyRating: 4.3,
    claimDays: 15,
    approvalRate: 88,
    deductible: 5000,
    features: ["Широкая сеть офисов", "Личный менеджер", "PDF-полис"],
  },
];

type ProductRow = (typeof MOCK_PRODUCTS)[number];
type NumericKey = "premium" | "coverage" | "companyRating" | "claimDays" | "approvalRate" | "deductible";

interface Criterion {
  key: NumericKey;
  label: string;
  format: (v: number) => string;
  bestIsMin?: boolean;
}

const CRITERIA: Criterion[] = [
  { key: "premium", label: "Стоимость (₽/год)", format: formatPremium, bestIsMin: true },
  { key: "coverage", label: "Покрытие", format: formatCoverage },
  { key: "companyRating", label: "Рейтинг компании", format: (v) => `${formatRating(v)} / 5.0` },
  { key: "claimDays", label: "Срок выплат (дней)", format: (v) => `${v} дн.`, bestIsMin: true },
  { key: "approvalRate", label: "Одобрение выплат", format: (v) => `${v}%` },
  { key: "deductible", label: "Франшиза", format: (v) => (v === 0 ? "Нет" : formatPremium(v)), bestIsMin: true },
];

function getBestWorst(products: ProductRow[], key: NumericKey, bestIsMin?: boolean) {
  const values = products.map((p) => p[key]);
  const best = bestIsMin ? Math.min(...values) : Math.max(...values);
  const worst = bestIsMin ? Math.max(...values) : Math.min(...values);
  return { best, worst };
}

export default function InsuranceComparePage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<InsuranceCategory | "all">("osago");

  const products = MOCK_PRODUCTS;
  const isEmpty = products.length === 0;
  const colTemplate = `160px repeat(${products.length}, 1fr)`;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-white/40">Страхование → Сравнение</p>
            <h1 className="text-base font-semibold text-white">Сравнение страховых продуктов</h1>
          </div>
          <Badge className="bg-violet-500/20 text-violet-400 gap-1">
            <GitCompare className="w-3 h-3" />
            {products.length}
          </Badge>
        </div>
        <div className="px-4 pb-3">
          <InsuranceCategoryTabs selected={category} onChange={setCategory} showAll />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center px-4 pt-24 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center mb-6">
              <GitCompare className="w-10 h-10 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Нет продуктов для сравнения</h2>
            <p className="text-sm text-white/50 mb-8 max-w-xs">
              Добавьте страховые продукты из каталога, чтобы сравнить их по ключевым параметрам
            </p>
            <Button className="bg-violet-600 hover:bg-violet-500 gap-2" onClick={() => navigate("/insurance")}>
              <Plus className="w-4 h-4" />
              Выбрать продукты
            </Button>
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pt-4">
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${products.length * 180 + 160}px` }}>
                {/* Product headers */}
                <div className="grid" style={{ gridTemplateColumns: colTemplate }}>
                  <div className="p-3" />
                  {products.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl mx-1 text-center"
                    >
                      <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-2">
                        <Star className="w-6 h-6 text-violet-400" />
                      </div>
                      <p className="text-xs text-white/50 mb-0.5">{product.companyName}</p>
                      <p className="text-sm font-semibold text-white mb-1">{product.name}</p>
                      <p className="text-base font-bold text-violet-400">{formatPremium(product.premium)}</p>
                      <p className="text-xs text-white/40">/год</p>
                      <Button
                        size="sm"
                        className="mt-3 w-full bg-violet-600 hover:bg-violet-500 text-xs"
                        onClick={() => navigate("/insurance")}
                      >
                        <ShoppingCart className="w-3 h-3 mr-1" />
                        Оформить
                      </Button>
                    </motion.div>
                  ))}
                </div>

                {/* Criteria rows */}
                {CRITERIA.map((criterion, rowIdx) => {
                  const { best, worst } = getBestWorst(products, criterion.key, criterion.bestIsMin);
                  return (
                    <motion.div
                      key={criterion.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: rowIdx * 0.05 }}
                      className="grid mt-2"
                      style={{ gridTemplateColumns: colTemplate }}
                    >
                      <div className="flex items-center px-3 py-3 bg-white/[0.02] rounded-xl border border-white/[0.06] mr-1">
                        <span className="text-xs text-white/60 font-medium">{criterion.label}</span>
                      </div>
                      {products.map((product) => {
                        const value = product[criterion.key];
                        const isBest = value === best;
                        const isWorst = value === worst && best !== worst;
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              "flex items-center justify-center gap-1 px-3 py-3 rounded-xl border mx-1 text-sm font-medium",
                              isBest
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : isWorst
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : "bg-white/[0.02] border-white/[0.06] text-white/70",
                            )}
                          >
                            {criterion.key === "companyRating" ? (
                              <>
                                <Star className="w-3 h-3 fill-current" />
                                {formatRating(value)}
                              </>
                            ) : (
                              criterion.format(value)
                            )}
                            {isBest && products.length > 1 && <Check className="w-3 h-3" />}
                          </div>
                        );
                      })}
                    </motion.div>
                  );
                })}

                {/* Features */}
                <div className="mt-4 mb-2">
                  <p className="text-xs text-white/40 px-2">Возможности</p>
                </div>
                {Array.from({ length: Math.max(...products.map((p) => p.features.length)) }, (_, i) => (
                  <div key={i} className="grid mt-1" style={{ gridTemplateColumns: colTemplate }}>
                    <div className="flex items-center px-3 py-2 bg-white/[0.01] rounded-xl mr-1">
                      <span className="text-xs text-white/30">Опция {i + 1}</span>
                    </div>
                    {products.map((product) => {
                      const feature = product.features[i];
                      return (
                        <div
                          key={product.id}
                          className="flex items-center justify-center px-2 py-2 rounded-xl bg-white/[0.01] border border-white/[0.04] mx-1 min-h-[36px]"
                        >
                          {feature ? (
                            <span className="text-xs text-white/60 text-center">{feature}</span>
                          ) : (
                            <X className="w-3 h-3 text-white/20" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-6 px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
                <span className="text-xs text-white/40">Лучшее значение</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500/30" />
                <span className="text-xs text-white/40">Худшее значение</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
