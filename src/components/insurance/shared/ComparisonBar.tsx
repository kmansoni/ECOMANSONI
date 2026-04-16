import { AnimatePresence, motion } from "framer-motion";
import { X, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComparisonItem } from "@/types/insurance";

interface ComparisonBarProps {
  items: ComparisonItem[];
  onRemove: (productId: string) => void;
  onCompare: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * Плавающая нижняя панель для сравнения страховых продуктов
 */
export function ComparisonBar({
  items,
  onRemove,
  onCompare,
  onClear,
  className,
}: ComparisonBarProps) {
  const hasItems = items.length > 0;

  return (
    <AnimatePresence>
      {hasItems && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={cn(
            "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
            "w-full max-w-2xl px-4",
            className,
          )}
        >
          <div className="bg-[#1a1a2e]/95 border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              {/* Иконки выбранных продуктов */}
              <div className="flex gap-2 flex-1 min-w-0 overflow-hidden">
                {items.map((item) => (
                  <motion.div
                    key={item.product.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="relative flex-shrink-0"
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                      {item.product.company?.logo_url ? (
                        <img loading="lazy"
                          src={item.product.company.logo_url}
                          alt={item.product.company.name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-xs text-white/40 text-center">
                          {item.product.company?.name?.charAt(0) ?? "?"}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                      onClick={() => onRemove(item.product.id)}
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </motion.div>
                ))}

                {/* Слоты для оставшихся */}
                {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="w-10 h-10 rounded-lg border border-dashed border-white/20 flex items-center justify-center"
                  >
                    <span className="text-white/20 text-lg">+</span>
                  </div>
                ))}
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/40 hover:text-white/60 text-xs px-2"
                  onClick={onClear}
                >
                  Очистить
                </Button>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-500 text-white text-xs"
                  onClick={onCompare}
                  disabled={items.length < 2}
                >
                  <GitCompare className="w-3.5 h-3.5 mr-1.5" />
                  Сравнить ({items.length})
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
