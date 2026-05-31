/**
 * AuthPrototypesPage — галерея прототипов auth-дизайна
 * Маршрут: /auth/prototypes
 *
 * Поведение:
 * - Отображает сетку прототипов с превью и описанием
 * - При клике открывает прототип в модалке/превью
 * - Поддерживает фильтрацию по категориям (glass, minimal, dark, vibrant)
 * - Навигация «Назад» ведёт на /auth/showcase
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { PremiumAuthLayout } from "@/pages/auth/components/PremiumAuthLayout";
import { useTheme } from "@/pages/auth/theme";

interface PrototypeMeta {
  id: string;
  title: string;
  description: string;
  category: "glass" | "minimal" | "dark" | "vibrant";
  status: "draft" | "review" | "approved";
  updatedAt: string;
  accent: string;
}

const PROTOTYPES: PrototypeMeta[] = [
  {
    id: "glass-signup",
    title: "Glass Signup",
    description: "Регистрация с glassmorphism-картой, анимированными инпутами и волновым бэкграундом.",
    category: "glass",
    status: "approved",
    updatedAt: "2025-05-20",
    accent: "from-cyan-500/30 to-blue-600/30",
  },
  {
    id: "minimal-login",
    title: "Minimal Login",
    description: "Минималистичный вход без отвлекающих элементов: только email/password и CTA.",
    category: "minimal",
    status: "review",
    updatedAt: "2025-05-18",
    accent: "from-slate-200/30 to-slate-400/30",
  },
  {
    id: "dark-oauth",
    title: "Dark OAuth",
    description: "OAuth-поток в тёмной теме с акцентами фиолетового.",
    category: "dark",
    status: "draft",
    updatedAt: "2025-05-15",
    accent: "from-violet-600/30 to-fuchsia-600/30",
  },
  {
    id: "vibrant-onboard",
    title: "Vibrant Onboard",
    description: "Онбординг с яркими градиентами, каскадными анимациями и геймификацией.",
    category: "vibrant",
    status: "approved",
    updatedAt: "2025-05-22",
    accent: "from-orange-500/30 to-pink-600/30",
  },
  {
    id: "glass-recovery",
    title: "Glass Recovery",
    description: "Восстановление пароля с прозрачными карточками, стадиями и таймером.",
    category: "glass",
    status: "review",
    updatedAt: "2025-05-19",
    accent: "from-teal-400/30 to-emerald-600/30",
  },
  {
    id: "minimal-2fa",
    title: "Minimal 2FA",
    description: "Двухфакторная аутентификация в минималистичном стиле с OEM-кодом.",
    category: "minimal",
    status: "approved",
    updatedAt: "2025-05-21",
    accent: "from-zinc-200/30 to-zinc-400/30",
  },
  {
    id: "dark-magic-link",
    title: "Dark Magic Link",
    description: "Magic-link вход: форма запроса + статус отправки в тёмной теме.",
    category: "dark",
    status: "draft",
    updatedAt: "2025-05-17",
    accent: "from-indigo-600/30 to-blue-800/30",
  },
  {
    id: "vibrant-social",
    title: "Vibrant Social",
    description: "Социальный вход с анимированными бейджами платформ и стеклянными кнопками.",
    category: "vibrant",
    status: "review",
    updatedAt: "2025-05-23",
    accent: "from-amber-500/30 to-rose-600/30",
  },
] as const;

const CATEGORIES = ["all", "glass", "minimal", "dark", "vibrant"] as const;
const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  review: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  draft: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export function AuthPrototypesPage() {
  const navigate = useNavigate();
  const { theme } = useTheme("dark");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedPrototype, setSelectedPrototype] = useState<PrototypeMeta | null>(null);

  const filtered = useMemo(
    () =>
      activeCategory === "all"
        ? PROTOTYPES
        : PROTOTYPES.filter((p) => p.category === activeCategory),
    [activeCategory]
  );

  return (
    <PremiumAuthLayout tokens={{}}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-white/90">
            Auth Prototypes
          </h1>
          <p className="mt-2 text-white/50 text-sm">
            Галерея экспериментальных auth-решений. Статусы: draft → review →
            approved.
          </p>
        </header>

        {/* Filters */}
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Категории прототипов">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const label = cat === "all" ? "Все" : cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={[
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                  isActive
                    ? "bg-white/15 text-white border border-white/25"
                    : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((proto) => (
            <button
              key={proto.id}
              type="button"
              onClick={() => setSelectedPrototype(proto)}
              className={[
                "group flex flex-col gap-3 rounded-2xl border p-4 text-left transition",
                "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${STATUS_STYLES[proto.status]}`}
                >
                  {proto.status}
                </span>
                <span className="text-[10px] text-white/40">
                  {new Date(proto.updatedAt).toLocaleDateString("ru-RU")}
                </span>
              </div>

              <div
                className={`h-24 rounded-xl bg-gradient-to-br ${proto.accent} border border-white/10`}
              />

              <div>
                <h3 className="text-sm font-semibold text-white/90 group-hover:text-white">
                  {proto.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">
                  {proto.description}
                </p>
              </div>

              <span className="text-[10px] uppercase tracking-widest text-white/30">
                {proto.category}
              </span>
            </button>
          ))}
        </section>

        {filtered.length === 0 && (
          <p className="mt-8 text-center text-sm text-white/40">
            Нет прототипов в выбранной категории.
          </p>
        )}
      </div>

      {/* Prototype preview modal */}
      {selectedPrototype && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Прототип ${selectedPrototype.title}`}
          onClick={() => setSelectedPrototype(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/50 p-6 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white/90">
                  {selectedPrototype.title}
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Категория: {selectedPrototype.category} •{" "}
                  {selectedPrototype.status.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPrototype(null)}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/20"
              >
                Закрыть
              </button>
            </div>

            <div
              className={`mt-5 h-40 rounded-xl bg-gradient-to-br ${selectedPrototype.accent} border border-white/10`}
            />

            <p className="mt-4 text-sm leading-relaxed text-white/60">
              {selectedPrototype.description}
            </p>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPrototype(null)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/20"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </PremiumAuthLayout>
  );
}
