import { Link } from "react-router-dom";
import { useThemeStore } from "@/hooks/useThemeStore";
import { cn } from "@/lib/utils";
import { KindTipsTicker } from "@/pages/auth/components/KindTipsTicker";
import {
  Shield, Eye, Lock, Globe, UserCheck, Mail,
  Server, Database, Fingerprint, Heart, ArrowLeft,
} from "lucide-react";

const SECTIONS = [
  {
    icon: Database,
    title: "1. Какие данные обрабатываются",
    items: [
      "Данные аккаунта: номер телефона, отображаемое имя, аватар",
      "Технические данные: IP-адрес, модель устройства, версия ОС, идентификатор сессии",
      "Контент: сообщения, медиа-файлы, публикации — хранятся в зашифрованном виде",
      "Метаданные: временные метки событий, статистика использования функций",
      "Данные геолокации — только при явном согласии, для функций навигации и «Люди рядом»",
    ],
  },
  {
    icon: Eye,
    title: "2. Цели обработки",
    items: [
      "Аутентификация и управление сессиями",
      "Предоставление функций мессенджера, соцсети, маркетплейса и навигации",
      "Предотвращение фрода и злоупотреблений",
      "Модерация контента с помощью AI-классификатора",
      "Поддержка пользователей и обработка обращений",
      "Выполнение требований законодательства РФ (152-ФЗ)",
    ],
  },
  {
    icon: Lock,
    title: "3. Техническая защита",
    items: [
      "E2E-шифрование личных чатов и звонков — ключи хранятся только на устройствах",
      "TLS 1.3 для транспортного шифрования",
      "Row Level Security (RLS) на каждой таблице базы данных",
      "PBKDF2-хеширование паролей и кодов доступа",
      "Ролевая модель доступа (RBAC) для административных функций",
      "Регулярный аудит безопасности и penetration testing",
    ],
  },
  {
    icon: Globe,
    title: "4. Трансграничная обработка",
    items: [
      "Основная инфраструктура размещена в юрисдикции, обеспечивающей защиту данных",
      "При трансграничной передаче применяются стандартные договорные положения",
      "Пользователь уведомляется о странах обработки в настройках аккаунта",
    ],
  },
  {
    icon: UserCheck,
    title: "5. Права пользователя",
    items: [
      "Доступ — запрос всех хранимых данных через функцию GDPR-экспорта",
      "Исправление — редактирование профиля и персональных данных",
      "Удаление — полное удаление аккаунта и всех связанных данных",
      "Ограничение обработки — гранулярные настройки конфиденциальности",
      "Портирование — экспорт данных в машиночитаемом формате (JSON)",
      "Отзыв согласия — в любой момент через настройки приложения",
    ],
  },
  {
    icon: Server,
    title: "6. Хранение и удаление",
    items: [
      "Данные аккаунта — до момента удаления аккаунта пользователем",
      "Сообщения — согласно настройке автоудаления (1 день / 1 неделя / 1 месяц / без лимита)",
      "Логи безопасности — 90 дней",
      "Резервные копии — 30 дней после удаления, затем полное уничтожение",
      "Автоудаление неактивного аккаунта: 1 / 6 / 12 месяцев (настраивается)",
    ],
  },
  {
    icon: Fingerprint,
    title: "7. Файлы cookie и аналитика",
    items: [
      "Функциональные cookie — только для работы аутентификации и сессий",
      "Аналитика — анонимизированная, без передачи третьим лицам",
      "Рекламная слежка отсутствует. Мы не продаём данные и не показываем таргетированную рекламу",
    ],
  },
  {
    icon: Mail,
    title: "8. Контакты",
    items: [
      "Оператор: ООО «Мансони» (ИНН уточняется)",
      "Email для обращений по персональным данным: privacy@mansoni.ru",
      "Срок ответа на запросы: 30 календарных дней",
      "Ответственный за обработку ПДн: указывается при регистрации оператора",
    ],
  },
] as const;

function SectionCard({ icon: Icon, title, items, isDark }: {
  icon: typeof Shield;
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

export default function PrivacyPolicyPage() {
  const isDark = useThemeStore((s) => s.theme) === "dark";
  const tokens = {
    isDark,
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-white/60" : "text-gray-500",
  };

  return (
    <main className={cn(
      "min-h-screen pb-12",
      isDark
        ? "bg-gradient-to-b from-[#0a0e1a] via-[#0d1225] to-[#080c18] text-white"
        : "bg-gradient-to-b from-slate-50 via-white to-blue-50/30 text-gray-900"
    )}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
        {/* Header */}
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
            <Shield className={cn("w-6 h-6", isDark ? "text-cyan-300" : "text-teal-600")} />
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Политика конфиденциальности</h1>
          </div>
        </div>

        {/* Version badge */}
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

        {/* Kind Tips section */}
        <div className={cn(
          "backdrop-blur-xl rounded-2xl border p-5 mb-6",
          isDark
            ? "bg-white/[0.04] border-white/[0.08]"
            : "bg-white/40 border-white/20"
        )}>
          <div className="flex items-center gap-2.5 mb-4">
            <Heart className={cn("w-5 h-5", isDark ? "text-cyan-300" : "text-teal-600")} />
            <span className={cn("text-sm font-semibold", isDark ? "text-white/80" : "text-gray-700")}>
              Добрые мысли
            </span>
          </div>
          <KindTipsTicker tokens={tokens} />
        </div>

        {/* Intro */}
        <p className={cn(
          "text-sm leading-relaxed mb-6",
          isDark ? "text-white/60" : "text-gray-600"
        )}>
          Mansoni уважает вашу приватность. Мы собираем только те данные, которые необходимы
          для работы платформы, и никогда не продаём их третьим лицам. Ниже подробно описано,
          какие данные обрабатываются и какие права у вас есть.
        </p>

        {/* Policy sections */}
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

        {/* Footer */}
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
