import { Link } from "react-router-dom";
import { useTheme } from "@/pages/auth/theme";
import { cn } from "@/lib/utils";
import {
  ScrollText, UserCheck, ShieldCheck, Ban, FileText,
  AlertTriangle, Scale, CreditCard, RefreshCw, ArrowLeft,
} from "lucide-react";

const SECTIONS = [
  {
    icon: ScrollText,
    title: "1. Предмет и акцепт",
    items: [
      "Настоящие условия регулируют доступ ко всем сервисам Mansoni: мессенджер, навигация, маркетплейс, соцсеть, звонки, страхование и другие модули",
      "Начало использования любого модуля платформы считается полным и безоговорочным акцептом оферты",
      "Mansoni вправе обновлять условия с уведомлением за 14 дней через push-уведомление и email",
      "Продолжение использования после уведомления означает согласие с обновлёнными условиями",
    ],
  },
  {
    icon: UserCheck,
    title: "2. Аккаунт и безопасность",
    items: [
      "Регистрация по номеру телефона с подтверждением через OTP-код",
      "Пользователь обязан сохранять контроль над устройствами и методами входа",
      "При компрометации устройства — незамедлительно завершить все сессии и уведомить поддержку",
      "Один аккаунт на пользователя. Мультиаккаунт запрещён без согласия администрации",
      "Передача аккаунта третьим лицам запрещена",
    ],
  },
  {
    icon: Ban,
    title: "3. Допустимое использование",
    items: [
      "Запрещены: фишинг, спам, вредоносная активность, обход ограничений платформы",
      "Запрещены: несанкционированный сбор персональных данных других пользователей",
      "Запрещены: публикация противоправного контента, пропаганда насилия и дискриминации",
      "Запрещены: автоматизированный доступ (боты, скраперы) без письменного разрешения",
      "Нарушение правил влечёт предупреждение, ограничение функций или блокировку аккаунта",
    ],
  },
  {
    icon: FileText,
    title: "4. Контент и интеллектуальная собственность",
    items: [
      "Пользователь сохраняет все права на свой контент (тексты, фото, видео, голосовые сообщения)",
      "Платформе предоставляется неисключительная лицензия для технического предоставления функций сервиса",
      "При удалении контента лицензия прекращается, данные удаляются в течение 30 дней",
      "Торговые марки, дизайн и код Mansoni принадлежат оператору платформы",
      "Обратная связь и предложения могут быть использованы для улучшения сервиса",
    ],
  },
  {
    icon: CreditCard,
    title: "5. Платные услуги и подписки",
    items: [
      "Базовые функции платформы бесплатны и не ограничены по времени",
      "Premium-подписка и дополнительные услуги оплачиваются через App Store, Google Play или внутренний биллинг",
      "Возврат средств осуществляется согласно политике соответствующего магазина приложений",
      "Mansoni вправе изменять цены с уведомлением за 30 дней до окончания текущего периода подписки",
      "Все подписки видны в настройках. Отменить — одним касанием",
    ],
  },
  {
    icon: ShieldCheck,
    title: "6. Защита данных и E2EE",
    items: [
      "Личные чаты и звонки защищены сквозным шифрованием (E2EE) — ключи только на устройствах",
      "Платформа технически не может читать содержимое E2EE-переписки",
      "Обработка данных регулируется Политикой конфиденциальности",
      "Пользователь вправе экспортировать или удалить свои данные в любой момент",
    ],
  },
  {
    icon: AlertTriangle,
    title: "7. Ограничение ответственности",
    items: [
      "Платформа применяет меры защиты и отказоустойчивости, но не гарантирует абсолютную непрерывность работы",
      "Mansoni не отвечает за последствия компрометации пользовательского устройства",
      "Mansoni не несёт ответственности за контент, публикуемый пользователями",
      "Максимальная ответственность ограничена суммой, уплаченной пользователем за последние 12 месяцев",
    ],
  },
  {
    icon: RefreshCw,
    title: "8. Прекращение использования",
    items: [
      "Пользователь может удалить аккаунт в любой момент через Настройки → Конфиденциальность",
      "При удалении все данные уничтожаются в течение 30 дней, резервные копии — в течение 90 дней",
      "Mansoni вправе заблокировать аккаунт при грубом нарушении условий с уведомлением и правом апелляции",
    ],
  },
  {
    icon: Scale,
    title: "9. Споры и применимое право",
    items: [
      "Претензии принимаются по адресу: legal@mansoni.ru",
      "Срок рассмотрения обращений: 30 календарных дней",
      "Применимое право: законодательство Российской Федерации",
      "Досудебный порядок урегулирования споров обязателен",
    ],
  },
] as const;

function SectionCard({ icon: Icon, title, items, isDark }: {
  icon: typeof ScrollText;
  title: string;
  items: readonly string[];
  isDark: boolean;
}) {
  return (
    <div className={cn(
      "backdrop-blur-xl rounded-2xl border overflow-hidden transition-colors",
      isDark
        ? "bg-white/[0.06] border-white/[0.12] hover:bg-white/[0.08]"
        : "bg-white/60 border-white/30 hover:bg-white/70"
    )}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            isDark ? "bg-cyan-400/10" : "bg-teal-500/10"
          )}>
            <Icon className={cn("w-[18px] h-[18px]", isDark ? "text-cyan-300" : "text-teal-600")} />
          </div>
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
        </div>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span className={cn(
                "mt-2 w-1 h-1 rounded-full shrink-0",
                isDark ? "bg-cyan-300/60" : "bg-teal-500/60"
              )} />
              <span className={isDark ? "text-white/75" : "text-gray-700"}>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TermsOfServicePage() {
  const { theme } = useTheme("dark");
  const isDark = theme === "dark";

  return (
    <main className={cn(
      "min-h-screen pb-12",
      isDark
        ? "bg-gradient-to-b from-[#0a0e1a] via-[#0d1225] to-[#080c18] text-white"
        : "bg-gradient-to-b from-slate-50 via-white to-blue-50/30 text-gray-900"
    )}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
        <div className="flex items-center gap-3 mb-8">
          <Link
            to="/auth/showcase"
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center border transition-colors",
              isDark
                ? "bg-white/5 border-white/10 hover:bg-white/10"
                : "bg-white/60 border-white/30 hover:bg-white/80"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <ScrollText className={cn("w-6 h-6", isDark ? "text-cyan-300" : "text-teal-600")} />
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Условия использования</h1>
          </div>
        </div>

        <div className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8",
          isDark ? "bg-cyan-400/10 text-cyan-300" : "bg-teal-50 text-teal-700"
        )}>
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            isDark ? "bg-cyan-400" : "bg-teal-500"
          )} />
          Версия 1.0 · Вступает в силу: 01.06.2026
        </div>

        <p className={cn(
          "text-sm leading-relaxed mb-6",
          isDark ? "text-white/60" : "text-gray-600"
        )}>
          Добро пожаловать в Mansoni. Используя платформу, вы соглашаетесь с настоящими условиями.
          Мы стремимся к прозрачности — ниже подробно описаны ваши права и обязанности.
        </p>

        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <SectionCard
              key={section.title}
              icon={section.icon}
              title={section.title}
              items={section.items}
              isDark={isDark}
            />
          ))}
        </div>

        <div className={cn(
          "mt-8 text-center text-xs leading-relaxed",
          isDark ? "text-white/40" : "text-gray-400"
        )}>
          <p>© 2026 Mansoni. Все права защищены.</p>
          <p className="mt-1">Последнее обновление: 09.05.2026</p>
        </div>
      </div>
    </main>
  );
}
