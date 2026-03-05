/**
 * BusinessAccountPage — stub for Telegram Business, Passport, and Bot Payments.
 *
 * Shows feature cards with "Coming Soon" badges.
 * These features require significant server-side infrastructure.
 */

import { useNavigate } from "react-router-dom";
import { ArrowLeft, Briefcase, ShieldCheck, CreditCard, Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface FeatureCardProps {
  icon: typeof Briefcase;
  title: string;
  description: string;
  features: string[];
  color: string;
}

function FeatureCard({ icon: Icon, title, description, features, color }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/40 dark:border-white/10 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground dark:text-white">{title}</h3>
            <p className="text-xs text-muted-foreground dark:text-white/40">{description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Скоро
        </span>
      </div>

      <ul className="space-y-1.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground dark:text-white/50">
            <Sparkles className="w-3 h-3 text-amber-400/50 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function BusinessAccountPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-background dark:bg-[#0e1621]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 dark:border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground dark:text-white" />
        </button>
        <h1 className="font-semibold text-foreground dark:text-white">Бизнес-инструменты</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <p className="text-sm text-muted-foreground dark:text-white/50">
          Расширенные возможности для бизнеса и разработчиков. Эти функции находятся в разработке.
        </p>

        <FeatureCard
          icon={Briefcase}
          title="Бизнес-аккаунт"
          description="Профессиональные инструменты для бизнеса"
          color="bg-blue-500"
          features={[
            "Приветственные сообщения для новых клиентов",
            "Автоответчик и режим «Не в сети»",
            "Быстрые ответы и шаблоны",
            "Бизнес-часы работы",
            "Метки и категории чатов",
            "Статистика сообщений",
          ]}
        />

        <FeatureCard
          icon={ShieldCheck}
          title="Верификация личности"
          description="Безопасная проверка документов"
          color="bg-green-500"
          features={[
            "Загрузка и верификация документов",
            "Криптографическая подпись данных",
            "Одноразовая передача данных сервисам",
            "Контроль доступа к персональным данным",
            "Соответствие GDPR и KYC",
          ]}
        />

        <FeatureCard
          icon={CreditCard}
          title="Платежи через ботов"
          description="Приём платежей прямо в чате"
          color="bg-purple-500"
          features={[
            "Интеграция с платёжными провайдерами",
            "Invoice-сообщения с кнопкой оплаты",
            "Подтверждения и чеки",
            "Подписки и рекуррентные платежи",
            "Возвраты и споры",
          ]}
        />
      </div>
    </div>
  );
}

export default BusinessAccountPage;
