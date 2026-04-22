/**
 * AuthShowcasePage — ultra-modern liquid-glass authentication screen.
 *
 * Demo / design showcase only. Mounted at /auth/showcase.
 * Self-contained: does not touch production auth flow in AuthPage.tsx.
 *
 * Features:
 *  • Animated aurora mesh background (GPU-accelerated blobs)
 *  • Liquid-glass (frosted) card with refraction highlights
 *  • Dark / light theme toggle with smooth cross-fade
 *  • Multi-step flow: method select → credentials → OTP → success
 *  • Magnetic primary button, tactile ripple, haptic-like micro-motion
 *  • Animated focused input with gradient ring
 *  • Passkey / QR / social pills
 *  • Full keyboard & reduced-motion friendly
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";
void logo;
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Fingerprint,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
} from "lucide-react";

/* ---------- theme ---------- */

type Theme = "dark" | "light";

function useTheme(initial: Theme = "dark") {
  const [theme, setTheme] = useState<Theme>(initial);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

/**
 * Theme-aware class tokens. Kept in one place so every piece of UI stays in
 * visual sync with the active theme (light = bright frosted, dark = neon glass).
 */
function useThemeTokens(theme: Theme) {
  const isDark = theme === "dark";
  return useMemo(
    () => ({
      isDark,
      // core ink
      textPrimary: isDark ? "text-white" : "text-slate-900",
      textSecondary: isDark ? "text-white/70" : "text-slate-700",
      textMuted: isDark ? "text-white/55" : "text-slate-500",
      textFaint: isDark ? "text-white/40" : "text-slate-400",
      // glass surfaces
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
      // decorative
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


/* ---------- kind tips (rotating) ----------
   Тёплые, короткие, «про среду», без продаж. Каждый текст — одна мысль.
*/
const KIND_TIPS: { title: string; body: string }[] = [
  { title: "Здесь безопасно",                body: "Разговоры с близкими остаются вашими. Ключ живёт на устройстве." },
  { title: "Сохрани общение с близкими",     body: "Архив чатов переезжает с вами — даже при смене телефона." },
  { title: "Один аккаунт — вся среда",       body: "Чат, карта, магазин и истории работают под одной подписью." },
  { title: "Без паролей",                    body: "Passkey и биометрия — быстрее и надёжнее обычного входа." },
  { title: "Тихий режим",                    body: "Можно выключить уведомления, но не связь. Мы уважаем тишину." },
  { title: "Вы не товар",                    body: "Никакой рекламной слежки по умолчанию. Никогда." },
  { title: "Память важна",                   body: "Важные моменты можно закрепить — они не потеряются в ленте." },
  { title: "Поделись теплом",                body: "Голосовая открытка доходит быстрее, чем кажется." },
  { title: "Место встречи",                  body: "Отметь точку на карте — друзья увидят, как добраться." },
  { title: "Контроль в ваших руках",         body: "В любой момент можно скрыть профиль, статус и геометку." },
  { title: "Шифрование — по умолчанию",      body: "E2E включено для всех личных чатов. Без галочек и «премиум»." },
  { title: "Гостевой режим",                 body: "Можно зайти без регистрации и просто посмотреть." },
  { title: "Истории без давления",           body: "Публикуйте, когда хочется. Удаляйте, когда нужно." },
  { title: "Родные — ближе",                 body: "Семейный круг с общим альбомом и календарём событий." },
  { title: "Соседи рядом",                   body: "Местные события и помощь поблизости — без чужих глаз." },
  { title: "Деньги — прозрачно",             body: "Покупки и страховки в одном месте, с понятной историей." },
  { title: "Ни одного лишнего клика",        body: "Вход — одним касанием. Выход — так же спокойно." },
  { title: "Данные — ваши",                  body: "Их всегда можно скачать или удалить. Одной кнопкой." },
  { title: "Отдых важнее ленты",             body: "Напомним сделать паузу, если засиделись." },
  { title: "Ребёнок под защитой",            body: "Детский режим прячет лишнее и держит круг друзей." },
  { title: "Учиться вместе",                 body: "Курсы и гиды — от соседей и авторов, которым доверяете." },
  { title: "Работа без суеты",               body: "Рабочие чаты не мешают личным. И наоборот." },
  { title: "Творчество — бесплатно",         body: "Камера, редактор и музыка без водяных знаков." },
  { title: "Добро поблизости",               body: "Волонтёрство, потеряшки и помощь — на одной карте." },
  { title: "Поддержка на русском",           body: "Живые люди отвечают понятно, без шаблонов." },
  { title: "Путь домой",                     body: "Навигация помнит любимые места и не продаёт маршруты." },
  { title: "Уют в деталях",                  body: "Тёмная тема, крупный шрифт, спокойные цвета — как вам удобно." },
  { title: "Личное — значит личное",         body: "Папки, закладки и черновики видите только вы." },
  { title: "Правда дороже хайпа",            body: "Лента показывает источники и даты — без обмана." },
  { title: "Резервная копия",                body: "Переписка и фото сохраняются зашифровано, рядом с вами." },
  { title: "Без токсичности",                body: "Умная фильтрация лишнего — можно донастроить под себя." },
  { title: "Соединение — честное",           body: "Работает на слабом интернете и в поезде. И в тоннеле." },
  { title: "Подарки близким",                body: "Открытки, видео-письма и денежные переводы в один клик." },
  { title: "Локальные мастера",              body: "Репетиторы, врачи, ремонт — с отзывами соседей." },
  { title: "Экстренная связь",               body: "SOS-режим соединит с близкими, даже без сети." },
  { title: "Деньги — под контролем",         body: "Подписки видны списком. Отменить — одним касанием." },
  { title: "Ваш голос важен",                body: "Каждый отзыв читают. Лучшие идеи становятся функциями." },
  { title: "Простор для творчества",         body: "Свой канал, магазин и клуб — без комиссий за старт." },
  { title: "Право на тишину",                body: "Можно исчезнуть на выходные. Мы не скажем, что вы онлайн." },
  { title: "Добро пожаловать домой",         body: "mansoni — это среда, где приятно быть собой." },
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
      setIndex((i) => (i + 1) % KIND_TIPS.length);
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
          <h1
            className={`text-[22px] sm:text-[26px] leading-[1.12] font-bold tracking-tight ${tokens.textPrimary}`}
          >
            {tip.title}
            <span className={`ml-1 ${tokens.isDark ? "text-fuchsia-300/90" : "text-fuchsia-600/90"}`}>·</span>
          </h1>
          <p
            className={`mt-1.5 text-[13px] sm:text-sm leading-snug ${tokens.textMuted}`}
          >
            {tip.body}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* tiny progress dots, max 6 visible */}
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


/* ---------- flow state ---------- */

type Step = "method" | "credentials" | "otp" | "success";
type Method = "email" | "passkey" | "qr";

interface FlowState {
  step: Step;
  method: Method;
  email: string;
  otp: string;
  loading: boolean;
}

type FlowAction =
  | { type: "setMethod"; method: Method }
  | { type: "setEmail"; email: string }
  | { type: "setOtp"; otp: string }
  | { type: "goto"; step: Step }
  | { type: "loading"; value: boolean }
  | { type: "reset" };

const initialFlow: FlowState = {
  step: "method",
  method: "email",
  email: "",
  otp: "",
  loading: false,
};

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "setMethod":
      return { ...state, method: action.method };
    case "setEmail":
      return { ...state, email: action.email };
    case "setOtp":
      return { ...state, otp: action.otp };
    case "goto":
      return { ...state, step: action.step };
    case "loading":
      return { ...state, loading: action.value };
    case "reset":
      return initialFlow;
    default:
      return state;
  }
}

/* ---------- animated aurora background ---------- */

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
      {/* aurora blobs — palette swaps between themes */}
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
      {/* fine grain */}
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

/* ---------- magnetic / ripple primary button ---------- */

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
      {/* gradient layer */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg,#7c5cff 0%,#4f46e5 40%,#22d3ee 100%)",
        }}
      />
      {/* gloss */}
      <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent" />
      {/* animated shine */}
      <motion.span
        className="absolute -inset-y-4 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
        animate={{ x: ["0%", "450%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
      />
      {/* ripples */}
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

/* ---------- glass input ---------- */

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
      {/* animated gradient ring on focus */}
      <AnimatePresence>
        {focused && (
          <motion.span
            layoutId={`ring-${id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(124,92,255,0.55), rgba(34,211,238,0.55)) border-box",
              WebkitMask:
                "linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: 1.5,
              borderRadius: 16,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- OTP input ---------- */

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
                       ${tokens.inputSurface} ${tokens.textPrimary}
                       focus:${tokens.inputFocusRing.split(" ").join(" focus:")}`}
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

/* ---------- method pill ---------- */

function MethodPill({
  active,
  icon,
  label,
  hint,
  onClick,
  tokens,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  tokens: ThemeTokens;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`relative flex flex-col items-start gap-2 p-3 sm:p-4 rounded-2xl border backdrop-blur-xl text-left transition-all
        ${active ? tokens.pillActive : tokens.pillSurface}`}
    >
      <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-sm">
        {icon}
      </span>
      <div>
        <div className={`${tokens.textPrimary} text-[13px] sm:text-sm font-semibold`}>{label}</div>
        <div className={`${tokens.textMuted} text-[11px] sm:text-xs`}>{hint}</div>
      </div>
      {active && (
        <motion.span
          layoutId="method-active"
          className={`absolute inset-0 rounded-2xl ring-2 pointer-events-none ${tokens.isDark ? "ring-white/50" : "ring-indigo-500/50"}`}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        />
      )}
    </motion.button>
  );
}

/* ---------- main page ---------- */

export function AuthShowcasePage() {
  const { theme, toggle } = useTheme("dark");
  const tokens = useThemeTokens(theme);
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);

  // detect coarse pointer (touch) to skip magnetic tilt on phones/tablets
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(pointer: coarse)");
    const upd = () => setIsTouch(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, []);

  // respect reduced motion
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReduced(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, []);

  // parallax tilt on card (desktop only)
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

  // device orientation tilt (mobile: держим телефон — экран слегка «живёт»)
  const [motionNeedsPermission, setMotionNeedsPermission] = useState(false);
  useEffect(() => {
    if (!tiltEnabled || !isTouch) return;
    type OrientationCtor = {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor })
      .DeviceOrientationEvent;
    const needsPerm = typeof Ctor?.requestPermission === "function";

    let alpha0: number | null = null;
    let beta0: number | null = null;
    let raf = 0;
    let pendingX = 0;
    let pendingY = 0;

    const onOrient = (ev: DeviceOrientationEvent) => {
      // beta  — наклон вперёд/назад (-180..180)
      // gamma — наклон влево/вправо (-90..90)
      const beta = ev.beta ?? 0;
      const gamma = ev.gamma ?? 0;
      if (beta0 === null) beta0 = beta;
      if (alpha0 === null) alpha0 = gamma;
      // центрируем на стартовую позицию руки
      const dx = gamma - (alpha0 ?? 0);
      const dy = beta - (beta0 ?? 0);
      // clamp & map к тем же единицам, что и mouse parallax (px от центра)
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      pendingX = clamp(dx, 20) * 2; // -40..40
      pendingY = clamp(dy, 20) * 2;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          tiltX.set(pendingX);
          tiltY.set(pendingY);
          raf = 0;
        });
      }
    };

    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener("deviceorientation", onOrient, true);
    };

    if (needsPerm) {
      setMotionNeedsPermission(true);
      const ask = () => {
        Ctor!.requestPermission!()
          .then((res) => {
            if (res === "granted") attach();
            setMotionNeedsPermission(false);
          })
          .catch(() => setMotionNeedsPermission(false));
        window.removeEventListener("touchend", ask);
        window.removeEventListener("click", ask);
      };
      window.addEventListener("touchend", ask, { once: true });
      window.addEventListener("click", ask, { once: true });
    } else {
      attach();
    }

    return () => {
      if (attached) window.removeEventListener("deviceorientation", onOrient, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [tiltEnabled, isTouch, tiltX, tiltY]);
  void motionNeedsPermission;

  const canContinueCreds = flow.email.includes("@") && flow.email.includes(".");
  const canContinueOtp = flow.otp.length === 6;

  const submitCreds = () => {
    if (!canContinueCreds) return;
    dispatch({ type: "loading", value: true });
    window.setTimeout(() => {
      dispatch({ type: "loading", value: false });
      dispatch({ type: "goto", step: "otp" });
    }, 900);
  };

  const submitOtp = () => {
    if (!canContinueOtp) return;
    dispatch({ type: "loading", value: true });
    window.setTimeout(() => {
      dispatch({ type: "loading", value: false });
      dispatch({ type: "goto", step: "success" });
    }, 900);
  };

  return (
    <>
      <style>{`.auth-showcase-scroll{scrollbar-width:none;-ms-overflow-style:none}.auth-showcase-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        className={`${theme === "dark" ? "dark" : ""} auth-showcase-scroll relative min-h-[100dvh] w-full overflow-x-hidden font-[Manrope,system-ui,sans-serif] ${tokens.textPrimary}`}
        style={{ colorScheme: theme, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
      <AuroraBackground theme={theme} />

      {/* top bar */}
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

      {/* center card */}
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
          {/* outer glow */}
          <div className={`pointer-events-none absolute -inset-4 sm:-inset-6 rounded-[2.2rem] blur-2xl opacity-70 ${tokens.isDark ? "bg-gradient-to-br from-fuchsia-500/25 via-indigo-500/20 to-cyan-400/25" : "bg-gradient-to-br from-fuchsia-300/40 via-indigo-300/35 to-cyan-300/40"}`} />

          {/* glass card */}
          <div
            className={`relative rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-7 lg:p-8 border
                       backdrop-blur-2xl overflow-hidden
                       ${tokens.glassCard} ${tokens.glassCardShadow}`}
          >
            {/* highlight edge */}
            <div className="pointer-events-none absolute inset-0 rounded-[inherit]">
              <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent ${tokens.isDark ? "via-white/70" : "via-white"} to-transparent`} />
              <div className={`absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent ${tokens.isDark ? "via-white/30" : "via-indigo-200"} to-transparent`} />
            </div>

            {/* wordmark — quiet, typographic, no loud gradient tile */}
            <div className="flex items-center justify-center mb-5 sm:mb-6">
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                className={`flex items-center gap-3 text-[13px] tracking-[0.42em] uppercase ${
                  tokens.isDark ? "text-white/55" : "text-slate-500/90"
                }`}
                style={{ fontFeatureSettings: '"ss01"' }}
              >
                <span
                  aria-hidden
                  className={`relative inline-block h-1.5 w-1.5 rounded-full ${
                    tokens.isDark ? "bg-white/70" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute inset-0 rounded-full blur-[5px] opacity-60 ${
                      tokens.isDark ? "bg-indigo-300" : "bg-indigo-500"
                    }`}
                  />
                </span>
                <span className="font-medium">mansoni</span>
                <span
                  aria-hidden
                  className={`relative inline-block h-1.5 w-1.5 rounded-full ${
                    tokens.isDark ? "bg-white/70" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute inset-0 rounded-full blur-[5px] opacity-60 ${
                      tokens.isDark ? "bg-fuchsia-300" : "bg-fuchsia-500"
                    }`}
                  />
                </span>
              </motion.div>
            </div>

            {/* header */}
            <div className="flex items-center justify-between mb-5 sm:mb-6">
              {flow.step !== "method" && flow.step !== "success" ? (
                <button
                  onClick={() =>
                    dispatch({
                      type: "goto",
                      step: flow.step === "otp" ? "credentials" : "method",
                    })
                  }
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition ${tokens.iconBtn}`}
                  aria-label="Back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <div className="h-9 w-9" />
              )}
              <div className="flex items-center gap-1.5">
                {(["method", "credentials", "otp", "success"] as Step[]).map((s) => {
                  const activeIndex = ["method", "credentials", "otp", "success"].indexOf(flow.step);
                  const idx = ["method", "credentials", "otp", "success"].indexOf(s);
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

            {/* steps */}
            <div className="relative min-h-[300px] sm:min-h-[340px]">
              <AnimatePresence mode="wait" initial={false}>
                {flow.step === "method" && (
                  <motion.div
                    key="method"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <KindTipsTicker tokens={tokens} />

                    <div className="mt-4 sm:mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                      <MethodPill
                        tokens={tokens}
                        active={flow.method === "email"}
                        icon={<Mail className="h-5 w-5" />}
                        label="Email"
                        hint="Код на почту"
                        onClick={() => dispatch({ type: "setMethod", method: "email" })}
                      />
                      <MethodPill
                        tokens={tokens}
                        active={flow.method === "passkey"}
                        icon={<Fingerprint className="h-5 w-5" />}
                        label="Passkey"
                        hint="Биометрия"
                        onClick={() => dispatch({ type: "setMethod", method: "passkey" })}
                      />
                      <MethodPill
                        tokens={tokens}
                        active={flow.method === "qr"}
                        icon={<QrCode className="h-5 w-5" />}
                        label="QR"
                        hint="С другого"
                        onClick={() => dispatch({ type: "setMethod", method: "qr" })}
                      />
                    </div>

                    <div className="mt-6 sm:mt-7">
                      <PrimaryButton
                        icon={<ArrowRight className="h-5 w-5" />}
                        onClick={() => dispatch({ type: "goto", step: "credentials" })}
                      >
                        Продолжить
                      </PrimaryButton>
                    </div>

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
                  </motion.div>
                )}

                {flow.step === "credentials" && (
                  <motion.form
                    key="credentials"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitCreds();
                    }}
                    className="flex flex-col gap-5"
                  >
                    <div>
                      <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>
                        Ваш email
                      </h1>
                      <p className={`mt-2 text-sm ${tokens.textMuted}`}>
                        Отправим код подтверждения. Без паролей.
                      </p>
                    </div>

                    <GlassInput
                      tokens={tokens}
                      id="email"
                      label="Электронная почта"
                      value={flow.email}
                      onChange={(v) => dispatch({ type: "setEmail", email: v })}
                      type="email"
                      autoComplete="email"
                      icon={<Mail className="h-5 w-5" />}
                    />

                    <div className={`flex items-center gap-2 text-xs ${tokens.textMuted}`}>
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      Защищено end-to-end шифрованием
                    </div>

                    <PrimaryButton
                      type="submit"
                      icon={<ArrowRight className="h-5 w-5" />}
                      disabled={!canContinueCreds}
                      loading={flow.loading}
                    >
                      Получить код
                    </PrimaryButton>

                    <button
                      type="button"
                      onClick={() => dispatch({ type: "setMethod", method: "passkey" })}
                      className={`group flex items-center justify-center gap-2 h-12 rounded-2xl border backdrop-blur-xl transition ${tokens.pillSurface} ${tokens.textSecondary}`}
                    >
                      <Fingerprint className="h-5 w-5 text-cyan-500" />
                      Войти по passkey
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
                      submitOtp();
                    }}
                    className="flex flex-col gap-5"
                  >
                    <div>
                      <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>
                        Код подтверждения
                      </h1>
                      <p className={`mt-2 text-sm ${tokens.textMuted}`}>
                        Отправили 6-значный код на{" "}
                        <span className={tokens.textPrimary}>{flow.email || "почту"}</span>
                      </p>
                    </div>

                    <OtpInput
                      tokens={tokens}
                      value={flow.otp}
                      onChange={(v) => dispatch({ type: "setOtp", otp: v })}
                    />

                    <PrimaryButton
                      type="submit"
                      icon={<KeyRound className="h-5 w-5" />}
                      disabled={!canContinueOtp}
                      loading={flow.loading}
                    >
                      Подтвердить
                    </PrimaryButton>

                    <div className={`text-center text-sm ${tokens.textMuted}`}>
                      Не пришло?{" "}
                      <button type="button" className={`${tokens.textPrimary} underline-offset-2 hover:underline`}>
                        Отправить ещё раз
                      </button>
                    </div>
                  </motion.form>
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
                    <button
                      onClick={() => dispatch({ type: "reset" })}
                      className={`text-sm transition ${tokens.textMuted} hover:${tokens.textPrimary}`}
                    >
                      Начать заново
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* what protects you — factual, no hype */}
          <ProtectionStrip tokens={tokens} />
        </motion.div>
      </div>
      </div>
    </>
  );
}

/* ---------- Protection strip (factual) ----------
   Только то, что реально есть в коде:
   - X3DH + Double Ratchet (Signal-совместимо)   → src/lib/e2ee/x3dh.ts, doubleRatchet.ts
   - Sender keys для групп                        → senderKeys.ts, groupKeyTree.ts
   - SFrame E2EE для звонков                      → sframe.ts, sframeMedia.ts
   - WebAuthn passkey binding                     → webAuthnBinding.ts
   - Ключи в hardware keystore / IndexedDB        → hardwareKeyStorage.ts, keyStore.ts
   - PQ KEM гибрид (экспериментально)             → pqKem.ts
   - RLS на уровне БД (Supabase)                  → docs/requirements/security.json
*/
const PROTECTION_ITEMS: {
  key: string;
  title: string;
  detail: string;
  source: string;
}[] = [
  {
    key: "e2ee",
    title: "E2EE личных чатов",
    detail: "X3DH + Double Ratchet. Ключи у вас и собеседника, сервер шифротекста не читает.",
    source: "src/lib/e2ee/x3dh.ts · doubleRatchet.ts",
  },
  {
    key: "groups",
    title: "Групповые ключи",
    detail: "Sender keys + ротация при выходе участника. У бывших нет доступа к будущим сообщениям.",
    source: "src/lib/e2ee/senderKeys.ts · groupMembershipRotation.ts",
  },
  {
    key: "calls",
    title: "Звонки под SFrame",
    detail: "Медиа шифруется до SFU. Сервер пересылки не слышит голос и не видит кадр.",
    source: "src/lib/e2ee/sframe.ts · sframeMedia.ts",
  },
  {
    key: "keys",
    title: "Ключ — на устройстве",
    detail: "Secure Enclave / StrongBox где есть, иначе — IndexedDB с WebCrypto без export.",
    source: "src/lib/e2ee/hardwareKeyStorage.ts · keyStore.ts",
  },
  {
    key: "webauthn",
    title: "Passkey / WebAuthn",
    detail: "Вход и разблокировка ключей — биометрией устройства. Пароли на сервер не уходят.",
    source: "src/lib/e2ee/webAuthnBinding.ts",
  },
  {
    key: "tls",
    title: "TLS 1.3 в транспорте",
    detail: "Поверх E2EE — современный TLS к нашим серверам. Это минимум, не главное.",
    source: "nginx.conf",
  },
  {
    key: "rls",
    title: "RLS в базе",
    detail: "Row-Level Security в Supabase: чужую строку нельзя запросить даже по id.",
    source: "supabase/migrations · docs/requirements/security.json",
  },
  {
    key: "pq",
    title: "Пост-квантовый гибрид",
    detail: "Экспериментально: X25519 + ML-KEM в handshake. Выключается флагом.",
    source: "src/lib/e2ee/pqKem.ts",
  },
];

function ProtectionStrip({ tokens }: { tokens: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const current = active
    ? PROTECTION_ITEMS.find((x) => x.key === active) ?? null
    : null;

  return (
    <div
      className={`mt-4 sm:mt-5 rounded-2xl border p-3 sm:p-4 backdrop-blur-2xl ${tokens.glassCard}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`mx-auto flex items-center gap-2 text-[11px] px-3 h-8 rounded-full border transition ${tokens.pillSurface} ${tokens.textSecondary}`}
        aria-expanded={open}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-medium tracking-[0.08em]">Защита · что именно работает</span>
        <span
          className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ⌄
        </span>
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
            <div
              className={`mt-3 rounded-2xl border p-3 sm:p-4 ${
                tokens.isDark
                  ? "bg-white/[0.04] border-white/10"
                  : "bg-white/70 border-slate-900/10"
              }`}
            >
              <div
                className={`text-[10px] uppercase tracking-[0.32em] mb-2 ${
                  tokens.isDark ? "text-white/50" : "text-slate-500"
                }`}
              >
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
                            ? tokens.isDark
                              ? "bg-white/[0.09] border-white/20"
                              : "bg-white border-slate-900/15"
                            : tokens.isDark
                            ? "bg-transparent border-white/10 hover:bg-white/[0.05]"
                            : "bg-transparent border-slate-900/10 hover:bg-white"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="relative inline-flex h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            background: "#34d399",
                            boxShadow: "0 0 8px #34d39988",
                          }}
                        />
                        <span
                          className={`text-[12.5px] leading-tight ${
                            tokens.isDark ? "text-white/90" : "text-slate-800"
                          }`}
                        >
                          {item.title}
                        </span>
                        <span
                          className={`ml-auto text-[10px] ${
                            tokens.isDark ? "text-white/40" : "text-slate-500"
                          }`}
                        >
                          {isActive ? "—" : "+"}
                        </span>
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
                    className={`mt-3 rounded-xl p-3 text-[12.5px] leading-snug ${
                      tokens.isDark
                        ? "bg-black/30 text-white/85"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div>{current.detail}</div>
                    <div
                      className={`mt-1.5 font-mono text-[10.5px] tracking-tight ${
                        tokens.isDark ? "text-emerald-300/80" : "text-emerald-700/80"
                      }`}
                    >
                      {current.source}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className={`mt-3 pt-3 border-t text-[11px] leading-relaxed ${
                  tokens.isDark
                    ? "border-white/10 text-white/55"
                    : "border-slate-900/10 text-slate-500"
                }`}
              >
                Чего мы <strong>не</strong> обещаем: абсолютной защиты от захваченного
                устройства, анонимности на уровне метаданных и сохранности сообщений,
                если вы потеряете все свои устройства и резервную фразу.
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

export default AuthShowcasePage;

