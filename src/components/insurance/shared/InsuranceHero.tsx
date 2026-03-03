import { motion } from "framer-motion";
import { Shield, Car, Plane, Heart, Home, Stethoscope, ArrowRight, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InsuranceCategory } from "@/types/insurance";

interface QuickLink {
  category: InsuranceCategory;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    category: "osago",
    label: "ОСАГО",
    icon: <Car className="w-5 h-5" />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
  },
  {
    category: "kasko",
    label: "КАСКО",
    icon: <Shield className="w-5 h-5" />,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
  },
  {
    category: "dms",
    label: "ДМС",
    icon: <Stethoscope className="w-5 h-5" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
  },
  {
    category: "travel",
    label: "Путешествия",
    icon: <Plane className="w-5 h-5" />,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 hover:bg-sky-500/20",
  },
  {
    category: "property",
    label: "Имущество",
    icon: <Home className="w-5 h-5" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
  },
  {
    category: "life",
    label: "Жизнь",
    icon: <Heart className="w-5 h-5" />,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
  },
];

interface InsuranceHeroProps {
  onCategoryClick?: (category: InsuranceCategory) => void;
  onCalculatorClick?: () => void;
  className?: string;
}

/**
 * Hero-секция для главной страницы модуля страхования
 */
export function InsuranceHero({
  onCategoryClick,
  onCalculatorClick,
  className,
}: InsuranceHeroProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {/* Фоновый градиент */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-blue-900/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.15),transparent_70%)]" />

      <div className="relative z-10 p-6 md:p-8">
        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xs text-violet-400 font-medium uppercase tracking-wider">
              Страхование
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Страховка для вас
          </h1>
          <p className="text-sm md:text-base text-white/60 mt-2 max-w-lg">
            Рассчитайте стоимость страховки за 2 минуты. Сравните предложения от
            ведущих страховых компаний и оформите онлайн.
          </p>
        </motion.div>

        {/* Быстрые ссылки */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6"
        >
          {QUICK_LINKS.map((link, i) => (
            <motion.button
              key={link.category}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              type="button"
              onClick={() => onCategoryClick?.(link.category)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all",
                link.bgColor,
              )}
            >
              <span className={link.color}>{link.icon}</span>
              <span className="text-xs text-white/70 font-medium">
                {link.label}
              </span>
            </motion.button>
          ))}
        </motion.div>

        {/* Кнопка действия */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex gap-3"
        >
          <Button
            className="bg-violet-600 hover:bg-violet-500 text-white"
            onClick={onCalculatorClick}
          >
            <Calculator className="w-4 h-4 mr-2" />
            Рассчитать стоимость
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>

        {/* Статистика */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex gap-6 mt-6 pt-6 border-t border-white/5"
        >
          {[
            { label: "Страховых компаний", value: "50+" },
            { label: "Оформлено полисов", value: "10 000+" },
            { label: "Экономия в среднем", value: "15%" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-lg font-bold text-white">{stat.value}</div>
              <div className="text-xs text-white/40">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

