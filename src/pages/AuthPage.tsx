/**
 * AuthPage — production auth screen (liquid-glass showcase design).
 *
 * Real Supabase phone → email-OTP flow. Mounted at /auth.
 *
 * Flow:
 *   phone → (server lookup) → if found: OTP; if 404: register → OTP → success
 *   QR login: inline step using QRCodeLogin component.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
  UserPlus,
} from "lucide-react";

import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeLogin } from "@/components/auth/QRCodeLogin";
import { RecommendedUsersModal } from "@/components/profile/RecommendedUsersModal";

import { supabase } from "@/lib/supabase";
import { sleep } from "@/lib/utils/sleep";
import { setGuestMode } from "@/lib/demo/demoMode";
import { getVerifyEmailOtpUrls, getSendEmailOtpUrls, getAnonHeaders } from "@/lib/auth/backendEndpoints";
import { logger } from "@/lib/logger";

/* ========================================================================
 * Backend helpers (moved verbatim from previous AuthPage — do not alter).
 * ====================================================================== */

const OTP_RESEND_COOLDOWN_SEC = 60;
const AUTH_TIMEOUT_MS = 10_000;
const AUTH_RETRY_ATTEMPTS = 1;
const AUTH_RETRY_DELAY_MS = 700;

type ApiPayload = Record<string, unknown>;

function asApiPayload(value: unknown): ApiPayload | null {
  return value && typeof value === "object" ? (value as ApiPayload) : null;
}

function payloadString(payload: ApiPayload | null, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" ? value : undefined;
}

function payloadBoolean(payload: ApiPayload | null, key: string): boolean {
  return Boolean(payload?.[key]);
}

async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: ApiPayload | null }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: ApiPayload | null = null;
    try {
      data = asApiPayload(text ? JSON.parse(text) : null);
    } catch (_parseError) {
      data = null;
    }
    return { response, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`timeout:${label}`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isRetryableAuthTransportError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    normalized.startsWith("timeout:") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("load failed")
  );
}

async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: ApiPayload | null }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= AUTH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonWithTimeout(input, init, timeoutMs, `${label}:attempt-${attempt}`);
    } catch (err) {
      lastError = err;
      if (!isRetryableAuthTransportError(err) || attempt >= AUTH_RETRY_ATTEMPTS) {
        throw err;
      }
      await sleep(AUTH_RETRY_DELAY_MS * attempt);
    }
  }
  throw (lastError || new Error(`Failed to fetch ${label}`));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

function getReadableAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset")
  ) {
    return "Сетевой сбой при обращении к серверу подтверждения. Проверьте интернет/VPN и повторите.";
  }
  if (normalized.startsWith("timeout:")) {
    return "Сервер отвечает слишком долго. Повторите попытку.";
  }
  return raw;
}

function isTransientSupabaseAvailabilityError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    error instanceof TypeError ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.startsWith("timeout:")
  );
}

function toVerifyOtpUrl(sendOtpUrl: string): string {
  return sendOtpUrl.replace(/\/send-email-otp$/i, "/verify-email-otp");
}

function pushUniqueUrl(list: string[], url: string) {
  if (!url) return;
  if (!list.includes(url)) list.push(url);
}

/* ========================================================================
 * Showcase design primitives
 * ====================================================================== */

type Theme = "dark" | "light";

function useTheme(initial: Theme = "dark") {
  const [theme, setTheme] = useState<Theme>(initial);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

function useThemeTokens(theme: Theme) {
  const isDark = theme === "dark";
  return useMemo(
    () => ({
      isDark,
      textPrimary: isDark ? "text-white" : "text-slate-900",
      textSecondary: isDark ? "text-white/70" : "text-slate-700",
      textMuted: isDark ? "text-white/55" : "text-slate-500",
      textFaint: isDark ? "text-white/40" : "text-slate-400",
      glassCard: isDark
        ? "bg-[linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] border-white/20"
        : "bg-[linear-gradient(140deg,rgba(255,255,255,0.85),rgba(255,255,255,0.55))] border-white/70",
      glassCardShadow: isDark
        ? "shadow-[0_30px_80px_-20px_rgba(10,8,40,0.6)]"
        : "shadow-[0_30px_80px_-20px_rgba(79,70,229,0.25)]",
      pillSurface: isDark
        ? "bg-white/[0.06] border-white/15 hover:bg-white/[0.12]"
        : "bg-white/70 border-slate-900/10 hover:bg-white",
      pillActive: isDark
        ? "bg-white/[0.14] border-white/40 shadow-[0_10px_40px_-10px_rgba(124,92,255,0.6)]"
        : "bg-white border-indigo-500/40 shadow-[0_10px_40px_-10px_rgba(79,70,229,0.45)]",
      inputSurface: isDark
        ? "bg-white/[0.06] border-white/15"
        : "bg-white/85 border-slate-900/10",
      inputFocusRing: isDark
        ? "shadow-[0_0_0_3px_rgba(124,92,255,0.35)] border-white/40"
        : "shadow-[0_0_0_3px_rgba(79,70,229,0.25)] border-indigo-500/60",
      divider: isDark ? "bg-white/15" : "bg-slate-900/10",
      iconBtn: isDark
        ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
        : "border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white",
      progressDotActive: isDark ? "bg-white" : "bg-indigo-600",
      progressDotIdle: isDark ? "bg-white/25" : "bg-slate-900/15",
      badgeChip: isDark
        ? "border-white/15 text-white/50"
        : "border-slate-900/10 text-slate-500 bg-white/60",
    }),
    [isDark],
  );
}
type ThemeTokens = ReturnType<typeof useThemeTokens>;

const KIND_TIPS: { title: string; body: string }[] = [
  { title: "Ты достоин лучшего", body: "Твои усилия важны, даже если результат приходит не сразу." },
  { title: "Ты уже молодец", body: "Ты проходишь через сложное и всё равно двигаешься вперёд." },
  { title: "Шаг за шагом", body: "Большие перемены начинаются с одного маленького действия сегодня." },
  { title: "У тебя получится", body: "Не идеально, но по-настоящему. Этого уже достаточно для старта." },
  { title: "Сравнивай с собой", body: "Смотри не на чужой темп, а на свой прогресс по сравнению со вчера." },
  { title: "Ты не обязан всё сразу", body: "Можно идти медленно. Главное — не предавать себя на пути." },
  { title: "Сила в мягкости", body: "Доброе сердце и спокойный голос — тоже форма внутренней силы." },
  { title: "Отпусти лишнее", body: "Ты имеешь право не нести то, что давно перестало быть твоим." },
  { title: "Ошибки — это опыт", body: "Каждая ошибка делает тебя точнее, глубже и мудрее." },
  { title: "Ты важен", body: "Твоё присутствие уже меняет мир близких людей к лучшему." },
  { title: "Выбери себя", body: "Забота о себе — не эгоизм, а уважение к своей жизни." },
  { title: "Сегодня тоже день", body: "Даже один завершённый пункт — это победа, а не мелочь." },
  { title: "Ты не один", body: "Просить поддержку нормально. Сильные люди тоже опираются на других." },
  { title: "Береги границы", body: "\"Нет\" — это тоже забота, когда ты выбираешь себя и свои силы." },
  { title: "Будь к себе добрее", body: "Говори с собой так, как говорил бы с любимым человеком." },
  { title: "Позвони родителям", body: "Даже короткое \"как вы?\" может сделать чей-то вечер спокойнее." },
  { title: "Проверь бабушку и дедушку", body: "Одно доброе сообщение сегодня важнее идеального поста." },
  { title: "Скажи спасибо", body: "Водителю, курьеру, коллеге. Простая благодарность греет надолго." },
  { title: "Напиши тому, кто молчит", body: "Иногда человеку нужен не совет, а просто \"я рядом\"." },
  { title: "Сделай паузу", body: "Три глубоких вдоха и стакан воды часто решают больше, чем спор." },
  { title: "Не откладывай добро", body: "Если можно помочь сейчас, лучше сделать маленький шаг сразу." },
  { title: "Держи слово", body: "Надёжность строится из мелочей: пообещал — напомни и сделай." },
  { title: "Береги сон", body: "Усталость усиливает тревогу. Иногда лучший ответ — выспаться." },
  { title: "Спроси: чем помочь?", body: "Не \"держись\", а конкретно: \"что я могу сделать для тебя?\"." },
  { title: "Обними близких", body: "Тепло важнее аргументов. Дом начинается с простого участия." },
  { title: "Помни о соседях", body: "Иногда пакет из магазина или пять минут помощи меняют день." },
  { title: "Начни с доброго слова", body: "Мягкий тон решает конфликты быстрее, чем правота." },
  { title: "Здесь безопасно", body: "Разговоры с близкими остаются вашими. Ключ живёт на устройстве." },
  { title: "Сохрани общение с близкими", body: "Архив чатов переезжает с вами — даже при смене телефона." },
  { title: "Один аккаунт — вся среда", body: "Чат, карта, магазин и истории работают под одной подписью." },
  { title: "Без паролей", body: "Passkey и биометрия — быстрее и надёжнее обычного входа." },
  { title: "Тихий режим", body: "Можно выключить уведомления, но не связь. Мы уважаем тишину." },
  { title: "Вы не товар", body: "Никакой рекламной слежки по умолчанию. Никогда." },
  { title: "Память важна", body: "Важные моменты можно закрепить — они не потеряются в ленте." },
  { title: "Поделись теплом", body: "Голосовая открытка доходит быстрее, чем кажется." },
  { title: "Место встречи", body: "Отметь точку на карте — друзья увидят, как добраться." },
  { title: "Контроль в ваших руках", body: "В любой момент можно скрыть профиль, статус и геометку." },
  { title: "Шифрование — по умолчанию", body: "E2E включено для всех личных чатов. Без галочек и «премиум»." },
  { title: "Гостевой режим", body: "Можно зайти без регистрации и просто посмотреть." },
  { title: "Истории без давления", body: "Публикуйте, когда хочется. Удаляйте, когда нужно." },
  { title: "Родные — ближе", body: "Семейный круг с общим альбомом и календарём событий." },
  { title: "Соседи рядом", body: "Местные события и помощь поблизости — без чужих глаз." },
  { title: "Деньги — прозрачно", body: "Покупки и страховки в одном месте, с понятной историей." },
  { title: "Ни одного лишнего клика", body: "Вход — одним касанием. Выход — так же спокойно." },
  { title: "Данные — ваши", body: "Их всегда можно скачать или удалить. Одной кнопкой." },
  { title: "Отдых важнее ленты", body: "Напомним сделать паузу, если засиделись." },
  { title: "Ребёнок под защитой", body: "Детский режим прячет лишнее и держит круг друзей." },
  { title: "Учиться вместе", body: "Курсы и гиды — от соседей и авторов, которым доверяете." },
  { title: "Работа без суеты", body: "Рабочие чаты не мешают личным. И наоборот." },
  { title: "Творчество — бесплатно", body: "Камера, редактор и музыка без водяных знаков." },
  { title: "Добро поблизости", body: "Волонтёрство, потеряшки и помощь — на одной карте." },
  { title: "Поддержка на русском", body: "Живые люди отвечают понятно, без шаблонов." },
  { title: "Путь домой", body: "Навигация помнит любимые места и не продаёт маршруты." },
  { title: "Уют в деталях", body: "Тёмная тема, крупный шрифт, спокойные цвета — как вам удобно." },
  { title: "Личное — значит личное", body: "Папки, закладки и черновики видите только вы." },
  { title: "Правда дороже хайпа", body: "Лента показывает источники и даты — без обмана." },
  { title: "Резервная копия", body: "Переписка и фото сохраняются зашифровано, рядом с вами." },
  { title: "Без токсичности", body: "Умная фильтрация лишнего — можно донастроить под себя." },
  { title: "Соединение — честное", body: "Работает на слабом интернете и в поезде. И в тоннеле." },
  { title: "Подарки близким", body: "Открытки, видео-письма и денежные переводы в один клик." },
  { title: "Локальные мастера", body: "Репетиторы, врачи, ремонт — с отзывами соседей." },
  { title: "Экстренная связь", body: "SOS-режим соединит с близкими, даже без сети." },
  { title: "Деньги — под контролем", body: "Подписки видны списком. Отменить — одним касанием." },
  { title: "Ваш голос важен", body: "Каждый отзыв читают. Лучшие идеи становятся функциями." },
  { title: "Простор для творчества", body: "Свой канал, магазин и клуб — без комиссий за старт." },
  { title: "Право на тишину", body: "Можно исчезнуть на выходные. Мы не скажем, что вы онлайн." },
  { title: "Добро пожаловать домой", body: "mansoni — это среда, где приятно быть собой." },
];

function useRotatingTip(intervalMs = 5000) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * KIND_TIPS.length));
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReduced(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => {
      setIndex((prev) => {
        if (KIND_TIPS.length <= 1) return prev;
        let next = prev;
        while (next === prev) {
          next = Math.floor(Math.random() * KIND_TIPS.length);
        }
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, reduced]);
  return { tip: KIND_TIPS[index], index, total: KIND_TIPS.length };
}

function KindTipsTicker({ tokens }: { tokens: ThemeTokens }) {
  const { tip, index, total } = useRotatingTip(5200);
  return (
    <div className="min-h-[96px] sm:min-h-[108px]">
      <div
        className={`mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] ${
          tokens.isDark ? "text-white/45" : "text-slate-500"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-1 w-1 rounded-full ${
            tokens.isDark ? "bg-emerald-300" : "bg-emerald-500"
          }`}
          style={{ boxShadow: "0 0 8px currentColor" }}
        />
        добрые мысли · эфир
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className={`text-[22px] sm:text-[26px] leading-[1.12] font-bold tracking-tight ${tokens.textPrimary}`}>
            {tip.title}
            <span className={`ml-1 ${tokens.isDark ? "text-fuchsia-300/90" : "text-fuchsia-600/90"}`}>·</span>
          </h1>
          <p className={`mt-1.5 text-[13px] sm:text-sm leading-snug ${tokens.textMuted}`}>
            {tip.body}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="mt-2 flex items-center gap-1">
        {Array.from({ length: Math.min(6, total) }).map((_, i) => {
          const active = i === index % 6;
          return (
            <span
              key={i}
              className={`h-[3px] rounded-full transition-all duration-500 ${
                active
                  ? tokens.isDark
                    ? "w-5 bg-white/70"
                    : "w-5 bg-slate-700/80"
                  : tokens.isDark
                  ? "w-1.5 bg-white/20"
                  : "w-1.5 bg-slate-400/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function AuroraBackground({ theme }: { theme: Theme }) {
  const dark = theme === "dark";
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: dark
            ? "radial-gradient(120% 80% at 50% 0%, #0b1020 0%, #05060d 60%, #020309 100%)"
            : "radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #eef1ff 55%, #fdf4ff 100%)",
        }}
      />
      {(dark
        ? [
            { x: "-10%", y: "-20%", c1: "#7c5cff", c2: "#22d3ee", s: 620, d: 18, delay: 0 },
            { x: "60%", y: "10%", c1: "#ff5cf3", c2: "#ffb066", s: 560, d: 22, delay: 3 },
            { x: "20%", y: "70%", c1: "#22d3ee", c2: "#7c5cff", s: 700, d: 26, delay: 6 },
          ]
        : [
            { x: "-10%", y: "-20%", c1: "#a5b4fc", c2: "#67e8f9", s: 620, d: 18, delay: 0 },
            { x: "60%", y: "10%", c1: "#f9a8d4", c2: "#fdba74", s: 560, d: 22, delay: 3 },
            { x: "20%", y: "70%", c1: "#67e8f9", c2: "#c4b5fd", s: 700, d: 26, delay: 6 },
          ]
      ).map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl will-change-transform ${
            dark ? "mix-blend-screen" : "mix-blend-multiply"
          }`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: dark ? 0.55 : 0.75,
            x: ["0%", "6%", "-4%", "0%"],
            y: ["0%", "-5%", "4%", "0%"],
            scale: [1, 1.08, 0.96, 1],
          }}
          transition={{ duration: b.d, delay: b.delay, repeat: Infinity, ease: "easeInOut" }}
          style={{
            left: b.x,
            top: b.y,
            width: b.s,
            height: b.s,
            background: `radial-gradient(circle at 30% 30%, ${b.c1}, ${b.c2} 55%, transparent 70%)`,
          }}
        />
      ))}
      <div
        className={`absolute inset-0 pointer-events-none ${
          dark ? "opacity-[0.06] mix-blend-overlay" : "opacity-[0.04] mix-blend-multiply"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.9'/></svg>\")",
        }}
      />
    </div>
  );
}

interface PrimaryButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  type?: "button" | "submit";
}

function PrimaryButton({ onClick, disabled, loading, children, icon, type = "button" }: PrimaryButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 18 });
  const sy = useSpring(my, { stiffness: 220, damping: 18 });
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left - r.width / 2) * 0.25);
    my.set((e.clientY - r.top - r.height / 2) * 0.35);
  };
  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const id = Date.now();
      setRipples((prev) => [...prev, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      window.setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== id)), 650);
    }
    onClick?.();
  };

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.97 }}
      className="relative group h-14 w-full rounded-2xl overflow-hidden font-semibold text-white
                 disabled:opacity-60 disabled:cursor-not-allowed
                 shadow-[0_12px_40px_-8px_rgba(124,92,255,0.55)]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg,#7c5cff 0%,#4f46e5 40%,#22d3ee 100%)" }}
      />
      <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent" />
      <motion.span
        className="absolute -inset-y-4 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
        animate={{ x: ["0%", "450%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
      />
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="absolute rounded-full bg-white/40 pointer-events-none"
          style={{ left: r.x, top: r.y, translateX: "-50%", translateY: "-50%" }}
          initial={{ width: 0, height: 0, opacity: 0.6 }}
          animate={{ width: 520, height: 520, opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      ))}
      <span className="relative flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        {children}
      </span>
    </motion.button>
  );
}

interface GlassInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  tokens: ThemeTokens;
}

function GlassInput({ id, label, value, onChange, type = "text", autoComplete, icon, inputMode, tokens }: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  return (
    <div className="relative">
      <div
        className={`relative flex items-center gap-3 h-14 px-4 rounded-2xl border backdrop-blur-xl transition-all
          ${tokens.inputSurface}
          ${focused ? tokens.inputFocusRing : ""}`}
      >
        {icon && <span className={`${tokens.textSecondary} shrink-0`}>{icon}</span>}
        <div className="relative flex-1">
          <label
            htmlFor={id}
            className={`absolute left-0 pointer-events-none transition-all duration-200
              ${active ? "top-0 text-[10px] tracking-[0.18em] uppercase opacity-80" : "top-1/2 -translate-y-1/2 text-sm opacity-90"}
              ${tokens.textSecondary}`}
          >
            {label}
          </label>
          <input
            id={id}
            type={type}
            value={value}
            inputMode={inputMode}
            autoComplete={autoComplete}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-transparent outline-none placeholder-transparent
              ${tokens.textPrimary}
              ${active ? "pt-4 pb-0" : "pt-0 pb-0"} text-[15px]`}
          />
        </div>
      </div>
    </div>
  );
}

function OtpInput({ value, onChange, length = 6, tokens }: { value: string; onChange: (v: string) => void; length?: number; tokens: ThemeTokens }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  const chars = useMemo(() => {
    const a = value.split("");
    while (a.length < length) a.push("");
    return a.slice(0, length);
  }, [value, length]);

  const set = (i: number, ch: string) => {
    const digit = ch.replace(/\D/g, "").slice(-1);
    const next = chars.slice();
    next[i] = digit;
    const joined = next.join("");
    onChange(joined);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      const idx = Math.min(pasted.length, length - 1);
      refs.current[idx]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
      {chars.map((ch, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="relative flex-1"
        >
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={ch}
            inputMode="numeric"
            maxLength={1}
            onPaste={onPaste}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            className={`w-full aspect-square rounded-2xl text-center text-xl sm:text-2xl font-semibold
                       border backdrop-blur-xl outline-none transition-all
                       ${tokens.inputSurface} ${tokens.textPrimary}`}
          />
          {ch && (
            <motion.span
              layoutId={`otp-dot-${i}`}
              className="absolute inset-x-3 sm:inset-x-4 bottom-2 h-[3px] rounded-full bg-gradient-to-r from-fuchsia-400 via-indigo-500 to-cyan-400"
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ========================================================================
 * Flow state
 * ====================================================================== */

type Step = "phone" | "register" | "otp" | "qr" | "success";
type Gender = "male" | "female";
type EntityType = "individual" | "self_employed" | "entrepreneur" | "legal_entity";

interface FlowState {
  step: Step;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  entityType: string;
  password: string;
  passwordConfirm: string;
  registerError: string;
  otp: string;
  loading: boolean;
  maskedEmail: string;
  otpCountdown: number;
}

type FlowAction =
  | { type: "setPhone"; phone: string }
  | { type: "setEmail"; email: string }
  | {
      type: "setRegisterField";
      field: "firstName" | "lastName" | "middleName" | "birthDate" | "gender" | "entityType" | "password" | "passwordConfirm";
      value: string;
    }
  | { type: "setRegisterError"; error: string }
  | { type: "setOtp"; otp: string }
  | { type: "setMaskedEmail"; maskedEmail: string }
  | { type: "goto"; step: Step }
  | { type: "loading"; value: boolean }
  | { type: "setCountdown"; value: number }
  | { type: "reset" };

const initialFlow: FlowState = {
  step: "phone",
  phone: "",
  email: "",
  firstName: "",
  lastName: "",
  middleName: "",
  birthDate: "",
  gender: "",
  entityType: "",
  password: "",
  passwordConfirm: "",
  registerError: "",
  otp: "",
  loading: false,
  maskedEmail: "",
  otpCountdown: 0,
};

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "setPhone":
      return { ...state, phone: action.phone };
    case "setEmail":
      return { ...state, email: action.email };
    case "setRegisterField":
      return { ...state, [action.field]: action.value };
    case "setRegisterError":
      return { ...state, registerError: action.error };
    case "setOtp":
      return { ...state, otp: action.otp };
    case "setMaskedEmail":
      return { ...state, maskedEmail: action.maskedEmail };
    case "goto":
      return { ...state, step: action.step };
    case "loading":
      return { ...state, loading: action.value };
    case "setCountdown":
      return { ...state, otpCountdown: action.value };
    case "reset":
      return initialFlow;
    default:
      return state;
  }
}

/* ========================================================================
 * Page component
 * ====================================================================== */

export function AuthPage() {
  const { theme, toggle } = useTheme("dark");
  const tokens = useThemeTokens(theme);
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const navigate = useNavigate();

  // otp real-email (from server lookup) vs entered email
  const otpEmailRef = useRef<string>("");
  const otpSendUrlRef = useRef<string>("");
  const isRegisterFlowRef = useRef(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // pointer + motion
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(pointer: coarse)");
    const upd = () => setIsTouch(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, []);

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReduced(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, []);

  // OTP resend countdown
  useEffect(() => {
    if (flow.otpCountdown <= 0) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "setCountdown", value: Math.max(0, flow.otpCountdown - 1) });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [flow.otpCountdown]);

  // tilt
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotX = useTransform(tiltY, [-40, 40], [6, -6]);
  const rotY = useTransform(tiltX, [-40, 40], [-6, 6]);
  const springX = useSpring(rotX, { stiffness: 120, damping: 14 });
  const springY = useSpring(rotY, { stiffness: 120, damping: 14 });
  const tiltEnabled = !reduced;
  const pointerTiltEnabled = !isTouch && !reduced;

  const handleCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pointerTiltEnabled) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    tiltX.set(e.clientX - r.left - r.width / 2);
    tiltY.set(e.clientY - r.top - r.height / 2);
  };
  const handleCardLeave = () => {
    if (!pointerTiltEnabled) return;
    tiltX.set(0);
    tiltY.set(0);
  };

  const phoneDigits = flow.phone.replace(/\D/g, "");
  const canContinuePhone = phoneDigits.length >= 10;
  const canContinueOtp = flow.otp.length === 6;

  const clearRegisterFields = () => {
    dispatch({ type: "setRegisterField", field: "firstName", value: "" });
    dispatch({ type: "setRegisterField", field: "lastName", value: "" });
    dispatch({ type: "setRegisterField", field: "middleName", value: "" });
    dispatch({ type: "setRegisterField", field: "birthDate", value: "" });
    dispatch({ type: "setRegisterField", field: "gender", value: "" });
    dispatch({ type: "setRegisterField", field: "entityType", value: "" });
    dispatch({ type: "setRegisterField", field: "password", value: "" });
    dispatch({ type: "setRegisterField", field: "passwordConfirm", value: "" });
  };

  /* -------- real handlers (Supabase OTP) -------- */

  const completeRegistrationProfile = async (): Promise<boolean> => {
    const displayName = [flow.firstName.trim(), flow.lastName.trim(), flow.middleName.trim()].filter(Boolean).join(" ");
    const digits = flow.phone.replace(/\D/g, "");
    const normalizedEmail = (otpEmailRef.current || flow.email).trim().toLowerCase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast.error("Сессия истекла, войдите снова");
      return false;
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({
      password: flow.password,
      data: {
        full_name: displayName,
        first_name: flow.firstName.trim(),
        last_name: flow.lastName.trim(),
        middle_name: flow.middleName.trim() || undefined,
        email: normalizedEmail,
        birth_date: flow.birthDate,
        gender: flow.gender as Gender,
        entity_type: flow.entityType as EntityType,
        phone: digits || undefined,
      },
    });

    if (authUpdateError) {
      logger.error("[AuthPage] auth update failed", { error: authUpdateError.message });
      toast.error("Не удалось обновить аккаунт. Попробуйте снова.");
      return false;
    }

    const profilePatch: Record<string, unknown> = {
      display_name: displayName,
      full_name: displayName,
      first_name: flow.firstName.trim(),
      last_name: flow.lastName.trim(),
      email: normalizedEmail,
      birth_date: flow.birthDate,
      gender: flow.gender,
      entity_type: flow.entityType,
    };
    if (digits) profilePatch.phone = digits;

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (existingProfileError) {
      logger.error("[AuthPage] profile existence check failed", { error: existingProfileError.message });
      toast.error("Не удалось проверить профиль. Попробуйте снова.");
      return false;
    }

    const profileMutation = existingProfile
      ? await supabase.from("profiles").update(profilePatch as never).eq("user_id", session.user.id)
      : await supabase.from("profiles").insert({ user_id: session.user.id, ...profilePatch } as never);

    if (profileMutation.error) {
      logger.error("[AuthPage] profile save failed", { error: profileMutation.error.message });
      toast.error("Не удалось сохранить профиль. Попробуйте снова.");
      return false;
    }

    return true;
  };

  const submitPhone = async () => {
    if (!canContinuePhone || flow.loading) return;

    const trimmedPhone = flow.phone.trim();
    dispatch({ type: "loading", value: true });
    try {
      setGuestMode(false);
      isRegisterFlowRef.current = false;

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let data: ApiPayload | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ phone: trimmedPhone }) },
            AUTH_TIMEOUT_MS,
            "send-email-otp",
          );
          if (result.response.ok) {
            response = result.response;
            data = result.data;
            otpSendUrlRef.current = sendUrl;
            break;
          }
          response = result.response;
          data = result.data;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (response.status === 404 && payloadString(data, "error") === "not_found") {
        toast.message("Аккаунта нет", { description: "Создайте новый — это займёт минуту" });
        dispatch({ type: "goto", step: "register" });
        return;
      }

      if (!response.ok) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        toast.error("Не удалось отправить код", { description: errMsg });
        return;
      }

      const serverEmail = payloadString(data, "email") || "";
      const masked = payloadString(data, "maskedEmail") || "";
      otpEmailRef.current = serverEmail;
      dispatch({ type: "setMaskedEmail", maskedEmail: masked });
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
      toast.success(`Код отправлен на ${masked || "почту"}`);
      dispatch({ type: "goto", step: "otp" });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Send OTP transient backend outage", { error, phone: trimmedPhone });
      } else {
        logger.error("[AuthPage] Send OTP error", { error, phone: trimmedPhone });
      }
      toast.error("Ошибка отправки кода", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const submitRegister = async () => {
    if (flow.loading) return;

    const trimmedPhone = flow.phone.trim();
    const trimmedEmail = flow.email.trim().toLowerCase();
    const trimmedFirstName = flow.firstName.trim();
    const trimmedLastName = flow.lastName.trim();

    if (!trimmedPhone || trimmedPhone.replace(/\D/g, "").length < 10) {
      dispatch({ type: "setRegisterError", error: "Введите корректный номер телефона" });
      return;
    }
    if (!trimmedFirstName || !trimmedLastName || !flow.birthDate || !flow.gender || !flow.entityType) {
      dispatch({ type: "setRegisterError", error: "Заполните обязательные поля" });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      dispatch({ type: "setRegisterError", error: "Введите корректный email" });
      return;
    }
    if (flow.password.length < 6) {
      dispatch({ type: "setRegisterError", error: "Пароль должен содержать минимум 6 символов" });
      return;
    }
    if (flow.password !== flow.passwordConfirm) {
      dispatch({ type: "setRegisterError", error: "Пароли не совпадают" });
      return;
    }
    dispatch({ type: "setRegisterError", error: "" });

    dispatch({ type: "loading", value: true });
    try {
      setGuestMode(false);
      isRegisterFlowRef.current = true;

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let data: ApiPayload | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ email: trimmedEmail, phone: trimmedPhone }) },
            AUTH_TIMEOUT_MS,
            "register-send-email-otp",
          );
          if (result.response.ok) {
            response = result.response;
            data = result.data;
            otpSendUrlRef.current = sendUrl;
            break;
          }
          response = result.response;
          data = result.data;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (!response.ok) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        toast.error("Не удалось отправить код", { description: errMsg });
        return;
      }

      otpEmailRef.current = trimmedEmail;
      dispatch({ type: "setMaskedEmail", maskedEmail: trimmedEmail });
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
      toast.success("Код отправлен на " + trimmedEmail);
      dispatch({ type: "goto", step: "otp" });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Register send OTP transient backend outage", { error, email: trimmedEmail, phone: trimmedPhone });
      } else {
        logger.error("[AuthPage] Register send OTP error", { error, email: trimmedEmail, phone: trimmedPhone });
      }
      toast.error("Не удалось отправить код", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const submitOtp = async () => {
    if (!canContinueOtp || flow.loading) return;
    const verifyEmail = otpEmailRef.current || flow.email.trim().toLowerCase();

    dispatch({ type: "loading", value: true });
    try {
      const verifyUrls: string[] = [];
      if (otpSendUrlRef.current) {
        pushUniqueUrl(verifyUrls, toVerifyOtpUrl(otpSendUrlRef.current));
      } else {
        for (const url of getVerifyEmailOtpUrls()) pushUniqueUrl(verifyUrls, url);
      }

      let response: Response | null = null;
      let data: ApiPayload | null = null;
      let lastError: unknown = null;

      for (const verifyUrl of verifyUrls) {
        try {
          const result = await fetchJsonWithRetry(
            verifyUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ email: verifyEmail, code: flow.otp.trim() }) },
            AUTH_TIMEOUT_MS,
            "verify-email-otp",
          );
          if (result.response.ok) {
            response = result.response;
            data = result.data;
            break;
          }
          response = result.response;
          data = result.data;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response) throw (lastError || new Error("Failed to reach verify-email-otp endpoint"));

      if (!response.ok || !payloadBoolean(data, "ok")) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        logger.error("[AuthPage] verify-email-otp failed", { error: errMsg, email: verifyEmail });
        toast.error("Неверный или просроченный код", { description: errMsg });
        return;
      }

      const accessToken = payloadString(data, "accessToken");
      const refreshToken = payloadString(data, "refreshToken");
      if (!accessToken || !refreshToken) {
        toast.error("Не удалось создать сессию", { description: "Ответ сервера не содержит токены" });
        return;
      }

      const { error: sessionError } = await withTimeout(
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
        8000,
        "setSession",
      );
      if (sessionError) {
        logger.error("[AuthPage] setSession error", { error: sessionError });
        toast.error("Не удалось создать сессию");
        return;
      }

      const isNewUser = payloadBoolean(data, "isNewUser") || isRegisterFlowRef.current;

      if (isNewUser) {
        const saved = await completeRegistrationProfile();
        if (!saved) return;
        toast.success("Аккаунт создан!");
        clearRegisterFields();
        dispatch({ type: "goto", step: "success" });
        setShowRecommendations(true);
      } else {
        toast.success("Добро пожаловать!");
        dispatch({ type: "goto", step: "success" });
        window.setTimeout(() => navigate("/"), 500);
      }
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Verify OTP transient backend outage", { error, email: verifyEmail });
      } else {
        logger.error("[AuthPage] Verify OTP error", { error, email: verifyEmail });
      }
      toast.error("Ошибка проверки кода", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const handleResendOtp = async () => {
    if (flow.otpCountdown > 0 || flow.loading) return;
    const resendEmail = otpEmailRef.current || flow.email.trim().toLowerCase();

    dispatch({ type: "loading", value: true });
    try {
      const payload = isRegisterFlowRef.current
        ? { email: resendEmail }
        : flow.phone.trim()
          ? { phone: flow.phone.trim() }
          : { email: resendEmail };

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let data: ApiPayload | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify(payload) },
            AUTH_TIMEOUT_MS,
            "resend-email-otp",
          );
          if (result.response.ok) {
            response = result.response;
            data = result.data;
            otpSendUrlRef.current = sendUrl;
            break;
          }
          response = result.response;
          data = result.data;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (!response.ok) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        toast.error("Не удалось переотправить код", { description: errMsg });
        return;
      }
      toast.success("Код отправлен повторно");
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Resend OTP transient backend outage", { error });
      } else {
        logger.error("[AuthPage] Resend OTP error", { error });
      }
      toast.error("Не удалось переотправить код", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const handleBack = () => {
    if (flow.loading) return;
    if (flow.step === "otp") {
      dispatch({ type: "goto", step: isRegisterFlowRef.current ? "register" : "phone" });
      dispatch({ type: "setOtp", otp: "" });
      otpEmailRef.current = "";
      dispatch({ type: "setMaskedEmail", maskedEmail: "" });
      otpSendUrlRef.current = "";
      return;
    }
    if (flow.step === "register" || flow.step === "qr") {
      dispatch({ type: "goto", step: "phone" });
      isRegisterFlowRef.current = false;
      return;
    }
  };

  const handleRecommendationsClose = () => {
    setShowRecommendations(false);
    navigate("/");
  };

  return (
    <>
      <style>{`.auth-showcase-scroll{scrollbar-width:none;-ms-overflow-style:none}.auth-showcase-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        className={`${theme === "dark" ? "dark" : ""} auth-showcase-scroll relative min-h-[100dvh] w-full overflow-x-hidden font-[Manrope,system-ui,sans-serif] ${tokens.textPrimary}`}
        style={{ colorScheme: theme, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <AuroraBackground theme={theme} />

        <div className="relative z-10 flex items-center justify-end px-4 sm:px-6 lg:px-10 py-4 sm:py-5">
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.9, rotate: 180 }}
            className={`relative h-10 w-10 rounded-full border backdrop-blur-xl flex items-center justify-center transition ${tokens.iconBtn}`}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === "dark" ? (
                <motion.span key="moon" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }}>
                  <Moon className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span key="sun" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }}>
                  <Sun className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <div className="relative z-10 flex items-start sm:items-center justify-center px-3 sm:px-6 pb-6 sm:pb-10 min-h-[calc(100dvh-72px)]">
          <motion.div
            onMouseMove={handleCardMove}
            onMouseLeave={handleCardLeave}
            style={tiltEnabled ? { rotateX: springX, rotateY: springY, transformPerspective: 1200 } : undefined}
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[400px] sm:max-w-md lg:max-w-[460px]"
          >
            <div className={`pointer-events-none absolute -inset-4 sm:-inset-6 rounded-[2.2rem] blur-2xl opacity-70 ${tokens.isDark ? "bg-gradient-to-br from-fuchsia-500/25 via-indigo-500/20 to-cyan-400/25" : "bg-gradient-to-br from-fuchsia-300/40 via-indigo-300/35 to-cyan-300/40"}`} />

            <div className={`relative rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-7 lg:p-8 border backdrop-blur-2xl overflow-hidden ${tokens.glassCard} ${tokens.glassCardShadow}`}>
              <div className="pointer-events-none absolute inset-0 rounded-[inherit]">
                <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent ${tokens.isDark ? "via-white/70" : "via-white"} to-transparent`} />
                <div className={`absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent ${tokens.isDark ? "via-white/30" : "via-indigo-200"} to-transparent`} />
              </div>

              <div className="flex items-center justify-center mb-5 sm:mb-6">
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                  className={`flex items-center gap-3 text-[13px] tracking-[0.42em] uppercase ${tokens.isDark ? "text-white/55" : "text-slate-500/90"}`}
                  style={{ fontFeatureSettings: '"ss01"' }}
                >
                  <span aria-hidden className={`relative inline-block h-1.5 w-1.5 rounded-full ${tokens.isDark ? "bg-white/70" : "bg-slate-700"}`}>
                    <span className={`absolute inset-0 rounded-full blur-[5px] opacity-60 ${tokens.isDark ? "bg-indigo-300" : "bg-indigo-500"}`} />
                  </span>
                  <span className="font-medium">mansoni</span>
                  <span aria-hidden className={`relative inline-block h-1.5 w-1.5 rounded-full ${tokens.isDark ? "bg-white/70" : "bg-slate-700"}`}>
                    <span className={`absolute inset-0 rounded-full blur-[5px] opacity-60 ${tokens.isDark ? "bg-fuchsia-300" : "bg-fuchsia-500"}`} />
                  </span>
                </motion.div>
              </div>

              <div className="flex items-center justify-between mb-5 sm:mb-6">
                {flow.step !== "phone" && flow.step !== "success" ? (
                  <button
                    onClick={handleBack}
                    className={`h-9 w-9 rounded-full border flex items-center justify-center transition ${tokens.iconBtn}`}
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                ) : (
                  <div className="h-9 w-9" />
                )}
                <div className="flex items-center gap-1.5">
                  {(["phone", "register", "otp", "success"] as Step[]).map((s) => {
                    const order: Step[] = ["phone", "register", "otp", "success"];
                    const activeIndex = order.indexOf(flow.step);
                    const idx = order.indexOf(s);
                    return (
                      <span
                        key={s}
                        className={`h-1.5 rounded-full transition-all duration-500
                          ${idx <= activeIndex ? `w-6 ${tokens.progressDotActive}` : `w-3 ${tokens.progressDotIdle}`}`}
                      />
                    );
                  })}
                </div>
                <div className="h-9 w-9" />
              </div>

              <div className="relative min-h-[300px] sm:min-h-[340px]">
                <AnimatePresence mode="wait" initial={false}>
                  {flow.step === "phone" && (
                    <motion.form
                      key="phone"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitPhone();
                      }}
                      className="flex flex-col"
                    >
                      <KindTipsTicker tokens={tokens} />

                      <div className="mt-4 sm:mt-5">
                        <PhoneInput
                          value={flow.phone}
                          onChange={(v) => dispatch({ type: "setPhone", phone: v })}
                        />
                      </div>

                      <div className={`mt-3 flex items-center gap-2 text-xs ${tokens.textMuted}`}>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Защищено end-to-end шифрованием
                      </div>

                      <div className="mt-5">
                        <PrimaryButton
                          type="submit"
                          icon={<ArrowRight className="h-5 w-5" />}
                          disabled={!canContinuePhone}
                          loading={flow.loading}
                        >
                          Получить код
                        </PrimaryButton>
                      </div>

                      <button
                        type="button"
                        onClick={() => dispatch({ type: "goto", step: "qr" })}
                        className={`mt-3 group flex items-center justify-center gap-2 h-12 rounded-2xl border backdrop-blur-xl transition ${tokens.pillSurface} ${tokens.textSecondary}`}
                      >
                        <QrCode className="h-5 w-5 text-cyan-500" />
                        Войти по QR-коду
                      </button>

                      <p className={`mt-5 sm:mt-6 text-[11px] leading-relaxed ${tokens.textFaint}`}>
                        Продолжая, вы соглашаетесь с{" "}
                        <Link to="/legal/terms" className={`${tokens.textPrimary} underline underline-offset-2`}>
                          Условиями использования
                        </Link>
                        {" "}и{" "}
                        <Link to="/legal/privacy" className={`${tokens.textPrimary} underline underline-offset-2`}>
                          Политикой конфиденциальности
                        </Link>
                        .
                      </p>
                    </motion.form>
                  )}

                  {flow.step === "register" && (
                    <motion.form
                      key="register"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitRegister();
                      }}
                      className="flex flex-col gap-4"
                    >
                      <div>
                        <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>
                          Создать аккаунт
                        </h1>
                        <p className={`mt-2 text-sm ${tokens.textMuted}`}>
                          Аккаунта с номером{" "}
                          <span className={tokens.textPrimary}>{flow.phone || "телефон"}</span>{" "}пока нет. Укажите данные — пришлём код на email.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <GlassInput tokens={tokens} id="firstName" label="Имя *" value={flow.firstName}
                          onChange={(v) => dispatch({ type: "setRegisterField", field: "firstName", value: v })} autoComplete="given-name" />
                        <GlassInput tokens={tokens} id="lastName" label="Фамилия *" value={flow.lastName}
                          onChange={(v) => dispatch({ type: "setRegisterField", field: "lastName", value: v })} autoComplete="family-name" />
                      </div>

                      <GlassInput tokens={tokens} id="middleName" label="Отчество (по желанию)" value={flow.middleName}
                        onChange={(v) => dispatch({ type: "setRegisterField", field: "middleName", value: v })} />

                      <GlassInput tokens={tokens} id="email" label="Электронная почта *" value={flow.email}
                        onChange={(v) => dispatch({ type: "setEmail", email: v })} type="email" autoComplete="email"
                        icon={<Mail className="h-5 w-5" />} />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <GlassInput tokens={tokens} id="birthDate" label="Дата рождения *" value={flow.birthDate}
                          onChange={(v) => dispatch({ type: "setRegisterField", field: "birthDate", value: v })} type="date" />

                        <Select
                          value={flow.gender}
                          onValueChange={(value) => dispatch({ type: "setRegisterField", field: "gender", value })}
                        >
                          <SelectTrigger className={`h-14 rounded-2xl border backdrop-blur-xl ${tokens.inputSurface} ${tokens.textPrimary}`}>
                            <SelectValue placeholder="Пол *" />
                          </SelectTrigger>
                          <SelectContent className="glass-popover">
                            <SelectItem value="male">Мужской</SelectItem>
                            <SelectItem value="female">Женский</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Select
                        value={flow.entityType}
                        onValueChange={(value) => dispatch({ type: "setRegisterField", field: "entityType", value })}
                      >
                        <SelectTrigger className={`h-14 rounded-2xl border backdrop-blur-xl ${tokens.inputSurface} ${tokens.textPrimary}`}>
                          <SelectValue placeholder="Тип пользователя *" />
                        </SelectTrigger>
                        <SelectContent className="glass-popover">
                          <SelectItem value="individual">Физ. лицо</SelectItem>
                          <SelectItem value="self_employed">Самозанятый</SelectItem>
                          <SelectItem value="entrepreneur">ИП</SelectItem>
                          <SelectItem value="legal_entity">Юр. лицо</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <GlassInput tokens={tokens} id="password" label="Пароль *" value={flow.password}
                          onChange={(v) => dispatch({ type: "setRegisterField", field: "password", value: v })}
                          type="password" autoComplete="new-password" />
                        <GlassInput tokens={tokens} id="passwordConfirm" label="Подтвердите пароль *" value={flow.passwordConfirm}
                          onChange={(v) => dispatch({ type: "setRegisterField", field: "passwordConfirm", value: v })}
                          type="password" autoComplete="new-password" />
                      </div>

                      {flow.registerError && (
                        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                          {flow.registerError}
                        </div>
                      )}

                      <div className={`flex items-center gap-2 text-xs ${tokens.textMuted}`}>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Защищено end-to-end шифрованием
                      </div>

                      <PrimaryButton type="submit" icon={<UserPlus className="h-5 w-5" />} disabled={flow.loading} loading={flow.loading}>
                        Создать аккаунт
                      </PrimaryButton>

                      <button
                        type="button"
                        onClick={() => dispatch({ type: "goto", step: "phone" })}
                        className={`group flex items-center justify-center gap-2 h-12 rounded-2xl border backdrop-blur-xl transition ${tokens.pillSurface} ${tokens.textSecondary}`}
                      >
                        <ChevronLeft className="h-5 w-5" />
                        Изменить номер
                      </button>
                    </motion.form>
                  )}

                  {flow.step === "otp" && (
                    <motion.form
                      key="otp"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitOtp();
                      }}
                      className="flex flex-col gap-5"
                    >
                      <div>
                        <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>
                          Код подтверждения
                        </h1>
                        <p className={`mt-2 text-sm ${tokens.textMuted}`}>
                          Отправили 6-значный код на{" "}
                          <span className={tokens.textPrimary}>{flow.maskedEmail || otpEmailRef.current || flow.email || "почту"}</span>
                        </p>
                      </div>

                      <OtpInput tokens={tokens} value={flow.otp} onChange={(v) => dispatch({ type: "setOtp", otp: v })} />

                      <PrimaryButton type="submit" icon={<KeyRound className="h-5 w-5" />} disabled={!canContinueOtp} loading={flow.loading}>
                        Подтвердить
                      </PrimaryButton>

                      <div className={`text-center text-sm ${tokens.textMuted}`}>
                        {flow.otpCountdown > 0 ? (
                          <>Отправить повторно через {Math.floor(flow.otpCountdown / 60)}:{String(flow.otpCountdown % 60).padStart(2, "0")}</>
                        ) : (
                          <>
                            Не пришло?{" "}
                            <button
                              type="button"
                              onClick={() => void handleResendOtp()}
                              className={`${tokens.textPrimary} underline-offset-2 hover:underline`}
                            >
                              Отправить ещё раз
                            </button>
                          </>
                        )}
                      </div>
                    </motion.form>
                  )}

                  {flow.step === "qr" && (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col gap-5"
                    >
                      <div>
                        <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>
                          Вход по QR-коду
                        </h1>
                        <p className={`mt-2 text-sm ${tokens.textMuted}`}>
                          Откройте mansoni на другом устройстве и отсканируйте код.
                        </p>
                      </div>
                      <QRCodeLogin onSuccess={() => navigate("/")} />
                    </motion.div>
                  )}

                  {flow.step === "success" && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col items-center text-center gap-5 py-6"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
                        className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-[0_20px_60px_-10px_rgba(16,185,129,0.6)]"
                      >
                        <Check className="h-10 w-10 text-white" strokeWidth={3} />
                        <motion.span
                          initial={{ scale: 1, opacity: 0.6 }}
                          animate={{ scale: 1.8, opacity: 0 }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                          className="absolute inset-0 rounded-full border-2 border-emerald-300"
                        />
                      </motion.div>
                      <div>
                        <h1 className={`text-[24px] sm:text-[26px] font-bold tracking-tight ${tokens.textPrimary}`}>Добро пожаловать</h1>
                        <p className={`mt-2 text-sm ${tokens.textMuted}`}>Вход выполнен. Готовим ваше пространство…</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <ProtectionStrip tokens={tokens} />
          </motion.div>
        </div>
      </div>

      <RecommendedUsersModal isOpen={showRecommendations} onClose={handleRecommendationsClose} />
    </>
  );
}

/* ========================================================================
 * Protection strip (factual E2EE facts)
 * ====================================================================== */

const PROTECTION_ITEMS: { key: string; title: string; detail: string; source: string }[] = [
  { key: "e2ee", title: "E2EE личных чатов", detail: "X3DH + Double Ratchet. Ключи у вас и собеседника, сервер шифротекста не читает.", source: "src/lib/e2ee/x3dh.ts · doubleRatchet.ts" },
  { key: "groups", title: "Групповые ключи", detail: "Sender keys + ротация при выходе участника. У бывших нет доступа к будущим сообщениям.", source: "src/lib/e2ee/senderKeys.ts · groupMembershipRotation.ts" },
  { key: "calls", title: "Звонки под SFrame", detail: "Медиа шифруется до SFU. Сервер пересылки не слышит голос и не видит кадр.", source: "src/lib/e2ee/sframe.ts · sframeMedia.ts" },
  { key: "keys", title: "Ключ — на устройстве", detail: "Secure Enclave / StrongBox где есть, иначе — IndexedDB с WebCrypto без export.", source: "src/lib/e2ee/hardwareKeyStorage.ts · keyStore.ts" },
  { key: "webauthn", title: "Passkey / WebAuthn", detail: "Вход и разблокировка ключей — биометрией устройства. Пароли на сервер не уходят.", source: "src/lib/e2ee/webAuthnBinding.ts" },
  { key: "tls", title: "TLS 1.3 в транспорте", detail: "Поверх E2EE — современный TLS к нашим серверам. Это минимум, не главное.", source: "nginx.conf" },
  { key: "rls", title: "RLS в базе", detail: "Row-Level Security в Supabase: чужую строку нельзя запросить даже по id.", source: "supabase/migrations · docs/requirements/security.json" },
  { key: "pq", title: "Пост-квантовый гибрид", detail: "Экспериментально: X25519 + ML-KEM в handshake. Выключается флагом.", source: "src/lib/e2ee/pqKem.ts" },
];

function ProtectionStrip({ tokens }: { tokens: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const current = active ? PROTECTION_ITEMS.find((x) => x.key === active) ?? null : null;

  return (
    <div className={`mt-4 sm:mt-5 rounded-2xl border p-3 sm:p-4 backdrop-blur-2xl ${tokens.glassCard}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`mx-auto flex items-center gap-2 text-[11px] px-3 h-8 rounded-full border transition ${tokens.pillSurface} ${tokens.textSecondary}`}
        aria-expanded={open}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-medium tracking-[0.08em]">Защита · что именно работает</span>
        <span className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden>⌄</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="protection"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className={`mt-3 rounded-2xl border p-3 sm:p-4 ${tokens.isDark ? "bg-white/[0.04] border-white/10" : "bg-white/70 border-slate-900/10"}`}>
              <div className={`text-[10px] uppercase tracking-[0.32em] mb-2 ${tokens.isDark ? "text-white/50" : "text-slate-500"}`}>
                факты, без преувеличений
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PROTECTION_ITEMS.map((item) => {
                  const isActive = active === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setActive(isActive ? null : item.key)}
                        className={`group w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-lg border transition ${
                          isActive
                            ? tokens.isDark ? "bg-white/[0.09] border-white/20" : "bg-white border-slate-900/15"
                            : tokens.isDark ? "bg-transparent border-white/10 hover:bg-white/[0.05]" : "bg-transparent border-slate-900/10 hover:bg-white"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="relative inline-flex h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: "#34d399", boxShadow: "0 0 8px #34d39988" }}
                        />
                        <span className={`text-[12.5px] leading-tight ${tokens.isDark ? "text-white/90" : "text-slate-800"}`}>{item.title}</span>
                        <span className={`ml-auto text-[10px] ${tokens.isDark ? "text-white/40" : "text-slate-500"}`}>{isActive ? "—" : "+"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <AnimatePresence mode="wait">
                {current && (
                  <motion.div
                    key={current.key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className={`mt-3 rounded-xl p-3 text-[12.5px] leading-snug ${tokens.isDark ? "bg-black/30 text-white/85" : "bg-slate-50 text-slate-700"}`}
                  >
                    <div>{current.detail}</div>
                    <div className={`mt-1.5 font-mono text-[10.5px] tracking-tight ${tokens.isDark ? "text-emerald-300/80" : "text-emerald-700/80"}`}>
                      {current.source}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={`mt-3 pt-3 border-t text-[11px] leading-relaxed ${tokens.isDark ? "border-white/10 text-white/55" : "border-slate-900/10 text-slate-500"}`}>
                Чего мы <strong>не</strong> обещаем: абсолютной защиты от захваченного устройства, анонимности на уровне метаданных и сохранности сообщений, если вы потеряете все свои устройства и резервную фразу.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <div className={`mt-3 flex items-center justify-center gap-3 sm:gap-4 text-[11px] ${tokens.textFaint}`}>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> E2EE · Signal-совместимо
          </span>
          <span>·</span>
          <span>SFrame для звонков</span>
          <span>·</span>
          <span>Passkey</span>
        </div>
      )}
    </div>
  );
}

export default AuthPage;
