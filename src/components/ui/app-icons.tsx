/**
 * app-icons.tsx — эффектная кастомная библиотека иконок mansoni.
 *
 * Принципы:
 *  - Единый viewBox 24×24, round caps/joins.
 *  - Два состояния: idle (контур) / active (градиент + эффекты).
 *  - Уникальная анимация на каждую иконку: морфинг, path-drawing,
 *    орбиты, искры, "shutter", trail, hue-shift, волны.
 *  - Idle-hover живой отклик (subtle scale / wiggle).
 *  - Reduced-motion: отключает все motion-эффекты, оставляя только статичный активный стиль.
 *  - Совместимы со стеклянной темой: контуры на currentColor, заливки на градиенте.
 *
 * Использование:
 *   import { LikeIcon, PhoneCallIcon } from "@/components/ui/app-icons";
 *   <LikeIcon active={liked} onClick={() => setLiked(v => !v)} />
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ================================================================== */
/*  Shared SVG defs                                                    */
/* ================================================================== */

export const APP_ICON_GRADIENT_ID = "app-icon-gradient";
export const APP_ICON_GRADIENT_ALT_ID = "app-icon-gradient-alt";
export const APP_ICON_GRADIENT_RED_ID = "app-icon-gradient-red";
export const APP_ICON_GRADIENT_GREEN_ID = "app-icon-gradient-green";
export const APP_ICON_GRADIENT_GOLD_ID = "app-icon-gradient-gold";
export const APP_ICON_GRADIENT_CAMERA_ID = "app-icon-gradient-camera";

/** Shared defs — монтируется в App.tsx один раз. */
export function AppIconDefs() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        <linearGradient id={APP_ICON_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c026d3" />
          <stop offset="45%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={APP_ICON_GRADIENT_ALT_ID} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={APP_ICON_GRADIENT_RED_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
        <linearGradient id={APP_ICON_GRADIENT_GREEN_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={APP_ICON_GRADIENT_GOLD_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id={APP_ICON_GRADIENT_CAMERA_ID} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="60%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#0891b2" />
        </radialGradient>

        {/* filter для soft-glow */}
        <filter id="app-icon-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

/* ================================================================== */
/*  Base shell                                                         */
/* ================================================================== */

const G = `url(#${APP_ICON_GRADIENT_ID})`;
const G_ALT = `url(#${APP_ICON_GRADIENT_ALT_ID})`;
const G_RED = `url(#${APP_ICON_GRADIENT_RED_ID})`;
const G_GREEN = `url(#${APP_ICON_GRADIENT_GREEN_ID})`;
const G_GOLD = `url(#${APP_ICON_GRADIENT_GOLD_ID})`;

export interface AppIconProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  size?: number;
  noAnimate?: boolean;
  label?: string;
  /** Кастомная палитра иконки. По умолчанию `brand`. */
  tone?: "brand" | "alt" | "red" | "green" | "gold";
}

interface InternalCtx {
  active: boolean;
  reduced: boolean;
  hovering: boolean;
  pressing: boolean;
  gradient: string;
  gradientAlt: string;
}

interface InternalIconProps extends AppIconProps {
  render: (ctx: InternalCtx) => React.ReactNode;
}

function resolveGradient(tone: AppIconProps["tone"]) {
  switch (tone) {
    case "alt":
      return { main: G_ALT, alt: G };
    case "red":
      return { main: G_RED, alt: G_ALT };
    case "green":
      return { main: G_GREEN, alt: G_ALT };
    case "gold":
      return { main: G_GOLD, alt: G_ALT };
    default:
      return { main: G, alt: G_ALT };
  }
}

function IconShell({
  render,
  active = false,
  size = 24,
  noAnimate = false,
  label,
  tone = "brand",
  className,
  onClick,
  disabled,
  ...rest
}: InternalIconProps) {
  const reducedSystem = useReducedMotion() ?? false;
  const reduced = noAnimate || reducedSystem;
  const [hovering, setHovering] = React.useState(false);
  const [pressing, setPressing] = React.useState(false);
  const interactive = typeof onClick === "function";
  const palette = resolveGradient(tone);

  const ctx: InternalCtx = {
    active,
    reduced,
    hovering,
    pressing,
    gradient: palette.main,
    gradientAlt: palette.alt,
  };

  const inner = (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
      animate={
        reduced
          ? undefined
          : hovering && !active
            ? { scale: [1, 1.04, 1] }
            : { scale: 1 }
      }
      transition={{ duration: 1.3, repeat: hovering && !active ? Infinity : 0, ease: "easeInOut" }}
    >
      {render(ctx)}
    </motion.svg>
  );

  if (!interactive) {
    return (
      <span
        aria-label={label}
        role={label ? "img" : undefined}
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        {inner}
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
      onTapStart={() => setPressing(true)}
      onTap={() => setPressing(false)}
      onTapCancel={() => setPressing(false)}
      whileTap={reduced ? undefined : { scale: 0.86 }}
      whileHover={reduced ? undefined : { scale: 1.08 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      disabled={disabled}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        "text-current outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      style={{ width: size + 14, height: size + 14 }}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {/* multi-layer glow + ring-ping on activation */}
      <AnimatePresence>
        {active && !reduced && (
          <>
            <motion.span
              key="glow"
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(168,85,247,0.42), rgba(34,211,238,0.12) 55%, transparent 78%)",
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.25 }}
            />
            <motion.span
              key="ping"
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-white/40"
              initial={{ opacity: 0.7, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.9 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </>
        )}
      </AnimatePresence>
      <span className="relative">{inner}</span>
    </motion.button>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Рисует путь "обводкой", когда active → 1. */
function DrawPath({
  d,
  active,
  reduced,
  stroke = "currentColor",
  strokeWidth = 1.75,
}: {
  d: string;
  active: boolean;
  reduced: boolean;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      initial={false}
      animate={
        reduced
          ? { pathLength: 1, opacity: 1 }
          : { pathLength: active ? 1 : 1, opacity: active ? 1 : 0.85 }
      }
      transition={{ duration: 0.5, ease: "easeInOut" }}
    />
  );
}

/* ================================================================== */
/*  ─── ЛЕНТА/СОЦИАЛЬНЫЕ ───                                           */
/* ================================================================== */

/** LikeIcon — сердце с burst-частицами и hue-shift градиентом */
export function LikeIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Нравится"
      tone="red"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {/* burst частицы — 8 штук + 3 мини-сердца */}
          {active && !reduced && (
            <g>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <motion.circle
                  key={deg}
                  cx={12}
                  cy={12}
                  r={1.1}
                  fill={deg % 90 === 0 ? gradient : "#fde68a"}
                  initial={{ opacity: 1, translateX: 0, translateY: 0, scale: 0.4 }}
                  animate={{
                    opacity: 0,
                    translateX: Math.cos((deg * Math.PI) / 180) * 13,
                    translateY: Math.sin((deg * Math.PI) / 180) * 13,
                    scale: 0,
                  }}
                  transition={{ duration: 0.65, ease: "easeOut" }}
                />
              ))}
              {[-1, 1].map((dir) => (
                <motion.path
                  key={dir}
                  d="M0 -3 C-2 -5 -4 -3 -2 -1 L0 1 L2 -1 C4 -3 2 -5 0 -3z"
                  fill={gradient}
                  initial={{ opacity: 0.9, scale: 0.6, translateX: 12, translateY: 12 }}
                  animate={{
                    opacity: 0,
                    scale: 0,
                    translateX: 12 + dir * 9,
                    translateY: 2,
                  }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              ))}
            </g>
          )}

          <motion.path
            d="M12 20.5s-7.3-4.4-9.3-9.2C1.1 7.5 3.8 3.7 7.6 4c2 .1 3.3 1.3 4.4 2.6 1.1-1.3 2.4-2.5 4.4-2.6 3.8-.3 6.5 3.5 4.9 7.3C19.3 16.1 12 20.5 12 20.5z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={
              reduced
                ? undefined
                : active
                  ? { scale: [1, 1.35, 0.9, 1.1, 1], rotate: [0, -6, 6, 0] }
                  : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.55 }}
            style={{ transformOrigin: "12px 12px" }}
          />
        </>
      )}
    />
  );
}

/** CommentIcon — облако с волной-пульсом + хвостиком */
export function CommentIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Комментарии"
      {...props}
      render={({ active, reduced, gradient, hovering }) => {
        const animateDots = !reduced && (active || hovering);
        return (
          <>
            <motion.path
              d="M4 12a7 7 0 017-7h2a7 7 0 010 14h-5l-4 3v-4.5A7 7 0 014 12z"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
              animate={
                reduced
                  ? undefined
                  : active
                    ? { scale: [1, 1.12, 0.98, 1] }
                    : {}
              }
              transition={{ duration: 0.5 }}
              style={{ transformOrigin: "12px 12px" }}
            />
            {[8, 12, 16].map((cx, i) => (
              <motion.circle
                key={cx}
                cx={cx}
                cy={11}
                r={0.95}
                fill={active ? "#fff" : "currentColor"}
                animate={
                  animateDots
                    ? { translateY: [0, -2.5, 0], opacity: [0.5, 1, 0.5] }
                    : { translateY: 0, opacity: 1 }
                }
                transition={{
                  duration: 0.9,
                  repeat: animateDots ? Infinity : 0,
                  delay: i * 0.14,
                  ease: "easeInOut",
                }}
              />
            ))}
          </>
        );
      }}
    />
  );
}

/** MessageIcon — самолётик с пунктирным следом */
export function MessageIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Отправить сообщение"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <motion.path
              d="M2 20 Q10 14 20 6"
              stroke={gradient}
              strokeDasharray="2 3"
              fill="none"
              initial={{ pathLength: 0, opacity: 0.8 }}
              animate={{ pathLength: 1, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}
          <motion.g
            animate={
              reduced
                ? undefined
                : active
                  ? { translateX: [0, 6, 4], translateY: [0, -6, -4], rotate: [-6, -14, -10] }
                  : { translateX: 0, translateY: 0, rotate: 0 }
            }
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <path
              d="M21 3L3 11l7 3 3 7 8-18z"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            <path d="M10 14L21 3" stroke={active ? "#fff" : "currentColor"} />
          </motion.g>
        </>
      )}
    />
  );
}

/** ShareIcon — три узла с анимацией "передачи" импульса */
export function ShareIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Поделиться"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <>
              <motion.circle
                cx={10}
                cy={11}
                r={1.2}
                fill={gradient}
                initial={{ opacity: 1, translateX: 0, translateY: 0 }}
                animate={{ opacity: 0, translateX: 7, translateY: -6 }}
                transition={{ duration: 0.5, delay: 0.05 }}
              />
              <motion.circle
                cx={10}
                cy={13}
                r={1.2}
                fill={gradient}
                initial={{ opacity: 1, translateX: 0, translateY: 0 }}
                animate={{ opacity: 0, translateX: 7, translateY: 6 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              />
            </>
          )}
          <circle cx={6} cy={12} r={3} fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <circle cx={18} cy={6} r={3} fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <circle cx={18} cy={18} r={3} fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M8.5 10.5L15.5 7M8.5 13.5L15.5 17" stroke={active ? gradient : "currentColor"} />
        </>
      )}
    />
  );
}

/** BookmarkIcon — лента c "складкой" снизу */
export function BookmarkIcon(props: AppIconProps) {
  return (
    <IconShell
      label="В закладки"
      tone="gold"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={
            reduced
              ? undefined
              : active
                ? { scale: [1, 1.15, 0.95, 1], rotate: [0, -4, 2, 0] }
                : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.55 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <path
            d="M6 3h12v18l-6-4-6 4V3z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          {active && !reduced && (
            <motion.path
              d="M9 8h6M9 12h4"
              stroke="#fff"
              strokeWidth={1.6}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            />
          )}
        </motion.g>
      )}
    />
  );
}

/* ================================================================== */
/*  ─── НАВИГАЦИЯ ───                                                  */
/* ================================================================== */

/** HomeIcon — дом с "светящимся" окном */
export function HomeIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Главная"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <motion.path
            d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={reduced ? undefined : active ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.4 }}
            style={{ transformOrigin: "12px 15px" }}
          />
          {active && !reduced && (
            <motion.rect
              x={10.3}
              y={9}
              width={3.4}
              height={3.4}
              rx={0.4}
              fill="#fde68a"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0.8], scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            />
          )}
        </>
      )}
    />
  );
}

/** SearchIcon — лупа с пульсирующими кольцами */
export function SearchIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Поиск"
      {...props}
      render={({ active, reduced, hovering, gradient }) => {
        const pulse = !reduced && (active || hovering);
        return (
          <>
            {pulse && [0, 0.4].map((delay) => (
              <motion.circle
                key={delay}
                cx={11}
                cy={11}
                r={6.5}
                stroke={gradient}
                fill="none"
                initial={{ opacity: 0.7, scale: 0.7 }}
                animate={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay }}
              />
            ))}
            <circle
              cx={11}
              cy={11}
              r={7}
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            <motion.path
              d="M20 20l-3.5-3.5"
              stroke={active ? gradient : "currentColor"}
              animate={reduced ? undefined : pulse ? { translateX: [0, 1, 0], translateY: [0, 1, 0] } : {}}
              transition={{ duration: 0.8, repeat: pulse ? Infinity : 0 }}
            />
          </>
        );
      }}
    />
  );
}

/** ExploreIcon — компас с вращающейся стрелкой */
export function ExploreIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Открытия"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <circle
            cx={12}
            cy={12}
            r={9}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <motion.g
            animate={reduced ? undefined : active ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
            style={{ transformOrigin: "12px 12px" }}
          >
            <path
              d="M12 7l2.5 4.5L12 17l-2.5-5.5L12 7z"
              fill={active ? "#fff" : "currentColor"}
              stroke={active ? "#fff" : "currentColor"}
              strokeLinejoin="round"
            />
          </motion.g>
          <circle cx={12} cy={12} r={0.9} fill={active ? gradient : "currentColor"} />
        </>
      )}
    />
  );
}

/** ReelsIcon — катушка плёнки с "play" внутри */
export function ReelsIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Reels"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={reduced ? undefined : active ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <rect
            x={3}
            y={4}
            width={18}
            height={16}
            rx={4}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <path d="M3 10h18M3 14h18M9 4v16M15 4v16" stroke={active ? "#fff" : "currentColor"} strokeOpacity={0.7} />
          <motion.path
            d="M10 9.5l5 2.5-5 2.5v-5z"
            fill={active ? "#fff" : "currentColor"}
            animate={reduced ? undefined : active ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.35, delay: 0.2 }}
            style={{ transformOrigin: "12px 12px" }}
          />
        </motion.g>
      )}
    />
  );
}

/** CreateIcon — плюс с "искрами" при активации */
export function CreateIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Создать"
      tone="alt"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <g>
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <motion.path
                  key={deg}
                  d="M0 -2L0.4 0L0 2L-0.4 0z"
                  fill={gradient}
                  initial={{ opacity: 1, translateX: 12, translateY: 12, scale: 0.3 }}
                  animate={{
                    opacity: 0,
                    translateX: 12 + Math.cos((deg * Math.PI) / 180) * 12,
                    translateY: 12 + Math.sin((deg * Math.PI) / 180) * 12,
                    scale: 1.2,
                    rotate: deg,
                  }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              ))}
            </g>
          )}
          <motion.g
            animate={reduced ? undefined : active ? { rotate: 135 } : { rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
            style={{ transformOrigin: "12px 12px" }}
          >
            <circle
              cx={12}
              cy={12}
              r={9}
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            <path d="M12 7v10M7 12h10" stroke={active ? "#fff" : "currentColor"} strokeWidth={2} />
          </motion.g>
        </>
      )}
    />
  );
}

/** ArrowBackIcon — стрелка с hover-пунктиром */
export function ArrowBackIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Назад"
      {...props}
      render={({ reduced, hovering }) => (
        <>
          {hovering && !reduced && (
            <motion.path
              d="M20 12h-10"
              stroke={G}
              strokeDasharray="2 3"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ duration: 0.4 }}
            />
          )}
          <motion.g
            animate={reduced ? undefined : hovering ? { translateX: -3 } : { translateX: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <path d="M15 6l-6 6 6 6" />
            <path d="M9 12h12" />
          </motion.g>
        </>
      )}
    />
  );
}

/* ================================================================== */
/*  ─── СИСТЕМНЫЕ ───                                                  */
/* ================================================================== */

/** SettingsIcon — шестерёнка с внутренним кольцом-"пылью" */
export function SettingsIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Настройки"
      {...props}
      render={({ active, reduced, hovering, gradient }) => {
        const spin = !reduced && (active || hovering);
        return (
          <>
            <motion.g
              animate={spin ? { rotate: 360 } : { rotate: 0 }}
              transition={{
                duration: 7,
                ease: "linear",
                repeat: spin ? Infinity : 0,
              }}
              style={{ transformOrigin: "12px 12px" }}
            >
              <path
                d="M12 2.5l1.5 2.2 2.6-.7.6 2.6 2.4 1.2-.9 2.5 1.8 2-2.1 1.6.2 2.6-2.6.5-1.1 2.4-2.4-1.1-2.4 1.1-1.1-2.4-2.6-.5.2-2.6L2 14.3l1.8-2-.9-2.5 2.4-1.2.6-2.6 2.6.7L12 2.5z"
                fill={active ? gradient : "none"}
                stroke={active ? "transparent" : "currentColor"}
              />
            </motion.g>
            <motion.circle
              cx={12}
              cy={12}
              r={3}
              fill={active ? "#fff" : "none"}
              stroke={active ? "transparent" : "currentColor"}
              animate={spin ? { rotate: -360 } : {}}
              transition={{ duration: 4, ease: "linear", repeat: spin ? Infinity : 0 }}
              style={{ transformOrigin: "12px 12px" }}
            />
          </>
        );
      }}
    />
  );
}

/** BellIcon — колокольчик с "shake" и волнами звука */
export function BellIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Уведомления"
      tone="gold"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && [0, 1].map((side) => {
            const dir = side === 0 ? -1 : 1;
            return (
              <motion.path
                key={side}
                d={`M${12 + dir * 10} 8 Q${12 + dir * 7} 12 ${12 + dir * 10} 16`}
                stroke={gradient}
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.8, 0] }}
                transition={{ duration: 0.8, repeat: 1 }}
              />
            );
          })}
          <motion.g
            animate={
              reduced
                ? undefined
                : active
                  ? { rotate: [0, -18, 14, -10, 6, 0] }
                  : { rotate: 0 }
            }
            transition={{ duration: 0.85 }}
            style={{ transformOrigin: "12px 4px" }}
          >
            <path
              d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            <path
              d="M10 19a2 2 0 104 0"
              stroke={active ? gradient : "currentColor"}
              fill="none"
            />
            {active && (
              <circle cx={18} cy={6} r={2.6} fill="#f43f5e" stroke="#fff" strokeWidth={1.2} />
            )}
          </motion.g>
        </>
      )}
    />
  );
}

/** UserIcon — силуэт с "halo" */
export function UserIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Профиль"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <motion.circle
              cx={12}
              cy={8}
              r={5}
              stroke={gradient}
              fill="none"
              initial={{ opacity: 0.8, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: 0.7 }}
            />
          )}
          <motion.g
            animate={
              reduced ? undefined : active ? { translateY: [0, -2, 0] } : { translateY: 0 }
            }
            transition={{ duration: 0.45 }}
          >
            <circle
              cx={12}
              cy={8}
              r={4}
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            <path
              d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
          </motion.g>
        </>
      )}
    />
  );
}

/** CheckIcon — круг spring + отрисовка галочки */
export function CheckIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Готово"
      tone="green"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && (
            <motion.circle
              cx={12}
              cy={12}
              r={10}
              fill={gradient}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 14 }}
            />
          )}
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={active ? "#fff" : "currentColor"}
            fill="none"
            strokeWidth={2.2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: active && !reduced ? 0.18 : 0 }}
          />
        </>
      )}
    />
  );
}

/** CloseIcon — крест, превращающийся из плюса */
export function CloseIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Закрыть"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={
            reduced
              ? undefined
              : active
                ? { rotate: 90, scale: [1, 1.25, 1] }
                : { rotate: 0, scale: 1 }
          }
          transition={{ type: "spring", stiffness: 320, damping: 16 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <path d="M6 6l12 12M18 6L6 18" stroke={active ? gradient : "currentColor"} />
        </motion.g>
      )}
    />
  );
}

/** PlusIcon — плюс→крест через rotate */
export function PlusIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Добавить"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={reduced ? undefined : active ? { rotate: 45 } : { rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <path d="M12 5v14M5 12h14" stroke={active ? gradient : "currentColor"} />
        </motion.g>
      )}
    />
  );
}

/* ================================================================== */
/*  ─── ЗВОНКИ / МЕДИА ───                                             */
/* ================================================================== */

/** PhoneCallIcon — трубка с "трясущимися" волнами звонка */
export function PhoneCallIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Позвонить"
      tone="green"
      {...props}
      render={({ active, reduced, gradient, hovering }) => {
        const ringing = !reduced && (active || hovering);
        return (
          <>
            {ringing && [0, 0.25].map((delay) => (
              <motion.circle
                key={delay}
                cx={16}
                cy={8}
                r={3}
                stroke={gradient}
                fill="none"
                initial={{ opacity: 0.8, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay }}
              />
            ))}
            <motion.g
              animate={
                reduced
                  ? undefined
                  : active
                    ? { rotate: [0, -10, 10, -6, 4, 0] }
                    : hovering
                      ? { rotate: [-3, 3, -3] }
                      : { rotate: 0 }
              }
              transition={{ duration: 0.6, repeat: hovering && !active ? Infinity : 0 }}
              style={{ transformOrigin: "12px 12px" }}
            >
              <path
                d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
                fill={active ? gradient : "none"}
                stroke={active ? "transparent" : "currentColor"}
              />
            </motion.g>
          </>
        );
      }}
    />
  );
}

/** VideoCallIcon — камера c "rec"-индикатором */
export function VideoCallIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Видеозвонок"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <rect
            x={3}
            y={7}
            width={13}
            height={10}
            rx={2}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <motion.path
            d="M16 10l5-3v10l-5-3z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={reduced ? undefined : active ? { translateX: [0, 1.5, 0] } : {}}
            transition={{ duration: 0.7, repeat: active ? Infinity : 0, ease: "easeInOut" }}
          />
          {active && (
            <motion.circle
              cx={6.5}
              cy={10}
              r={1.2}
              fill="#f43f5e"
              animate={reduced ? undefined : { opacity: [1, 0.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </>
      )}
    />
  );
}

/** HangupIcon — трубка "падает" при нажатии */
export function HangupIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Положить трубку"
      tone="red"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={
            reduced
              ? undefined
              : active
                ? { rotate: 135, translateY: 1 }
                : { rotate: 135, translateY: 0 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <path
            d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
            fill={gradient}
            stroke="transparent"
          />
        </motion.g>
      )}
    />
  );
}

/** MicIcon — микрофон с эквалайзером снизу */
export function MicIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Микрофон"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <rect
            x={9}
            y={3}
            width={6}
            height={12}
            rx={3}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" stroke={active ? gradient : "currentColor"} fill="none" />
          {active && !reduced && (
            <g>
              {[8, 10, 12, 14, 16].map((cx, i) => (
                <motion.rect
                  key={cx}
                  x={cx - 0.5}
                  y={20}
                  width={1}
                  height={2}
                  rx={0.5}
                  fill={gradient}
                  animate={{ height: [1, 3, 1], y: [21, 19, 21] }}
                  transition={{
                    duration: 0.5 + (i % 2) * 0.2,
                    repeat: Infinity,
                    delay: i * 0.08,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </g>
          )}
        </>
      )}
    />
  );
}

/** MicOffIcon — микрофон перечёркнутый */
export function MicOffIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Микрофон выключен"
      tone="red"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <rect
            x={9}
            y={3}
            width={6}
            height={12}
            rx={3}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" stroke={active ? gradient : "currentColor"} fill="none" />
          <motion.path
            d="M3 3l18 18"
            stroke={active ? gradient : "#f43f5e"}
            strokeWidth={2.2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35 }}
          />
        </>
      )}
    />
  );
}

/** VolumeIcon — динамик с расходящимися дугами */
export function VolumeIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Громкость"
      {...props}
      render={({ active, reduced, gradient, hovering }) => {
        const playing = !reduced && (active || hovering);
        return (
          <>
            <path
              d="M3 10v4h4l5 4V6L7 10H3z"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            {[1, 2, 3].map((i) => (
              <motion.path
                key={i}
                d={`M${14 + i * 1.2} ${12 - i * 1.8} Q${15.5 + i * 1.2} 12 ${14 + i * 1.2} ${12 + i * 1.8}`}
                stroke={active ? gradient : "currentColor"}
                fill="none"
                animate={
                  playing
                    ? { opacity: [0.3, 1, 0.3], pathLength: [0.4, 1, 0.4] }
                    : { opacity: active ? 1 : 0.75, pathLength: 1 }
                }
                transition={{
                  duration: 1.1,
                  repeat: playing ? Infinity : 0,
                  delay: i * 0.12,
                  ease: "easeInOut",
                }}
              />
            ))}
          </>
        );
      }}
    />
  );
}

/** CameraIcon — с анимацией "shutter" */
export function CameraIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Камера"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <rect
            x={3}
            y={6}
            width={18}
            height={14}
            rx={3}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <path d="M8 6l1.5-2h5L16 6" stroke={active ? "#fff" : "currentColor"} fill="none" />
          <motion.circle
            cx={12}
            cy={13}
            r={4}
            fill={active ? "#fff" : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={reduced ? undefined : active ? { scale: [1, 0.4, 1], opacity: [1, 0.3, 1] } : {}}
            transition={{ duration: 0.45 }}
            style={{ transformOrigin: "12px 13px" }}
          />
          <motion.circle
            cx={12}
            cy={13}
            r={1.5}
            fill={active ? gradient : "currentColor"}
            animate={reduced ? undefined : active ? { scale: [1, 1.6, 1] } : {}}
            transition={{ duration: 0.45 }}
            style={{ transformOrigin: "12px 13px" }}
          />
        </>
      )}
    />
  );
}

/** CameraSwapIcon — две стрелки вокруг камеры */
export function CameraSwapIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Сменить камеру"
      {...props}
      render={({ active, reduced, gradient }) => (
        <motion.g
          animate={reduced ? undefined : active ? { rotate: 180 } : { rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          <circle cx={12} cy={12} r={4} fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M4 8a8 8 0 0114-4l2 2M20 16a8 8 0 01-14 4l-2-2" />
          <path d="M20 2v4h-4M4 22v-4h4" />
        </motion.g>
      )}
    />
  );
}

/** PlayIcon — треугольник с "пульсом" */
export function PlayIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Играть"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <motion.circle
              cx={12}
              cy={12}
              r={10}
              stroke={gradient}
              fill="none"
              initial={{ opacity: 0.8, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
          )}
          <circle
            cx={12}
            cy={12}
            r={9}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <path d="M10 8l6 4-6 4V8z" fill={active ? "#fff" : "currentColor"} stroke={active ? "#fff" : "currentColor"} />
        </>
      )}
    />
  );
}

/** PauseIcon — две полоски с морфингом в "playing" линии */
export function PauseIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Пауза"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <circle
            cx={12}
            cy={12}
            r={9}
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          {[9, 14].map((x, i) => (
            <motion.rect
              key={x}
              x={x}
              y={8}
              width={1.6}
              height={8}
              rx={0.8}
              fill={active ? "#fff" : "currentColor"}
              animate={
                reduced
                  ? undefined
                  : active
                    ? { scaleY: [1, 0.6, 1] }
                    : { scaleY: 1 }
              }
              transition={{
                duration: 0.8,
                repeat: active ? Infinity : 0,
                delay: i * 0.1,
                ease: "easeInOut",
              }}
              style={{ transformOrigin: `${x + 0.8}px 12px` }}
            />
          ))}
        </>
      )}
    />
  );
}

/** EyeIcon — глаз, который "моргает" на активации */
export function EyeIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Показать"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <motion.path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={
              reduced
                ? undefined
                : active
                  ? { scaleY: [1, 0.1, 1] }
                  : { scaleY: 1 }
            }
            transition={{ duration: 0.5 }}
            style={{ transformOrigin: "12px 12px" }}
          />
          <circle
            cx={12}
            cy={12}
            r={3}
            fill={active ? "#fff" : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <circle cx={13} cy={11} r={1} fill={active ? gradient : "currentColor"} />
        </>
      )}
    />
  );
}

/** EyeOffIcon — глаз с диагональной чертой */
export function EyeOffIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Скрыть"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <path
            d="M3 12s4-7 9-7c2 0 3.5.7 5 1.7M21 12s-4 7-9 7c-2 0-3.5-.7-5-1.7"
            fill="none"
            stroke={active ? gradient : "currentColor"}
          />
          <circle cx={12} cy={12} r={3} fill="none" stroke={active ? gradient : "currentColor"} />
          <motion.path
            d="M3 3l18 18"
            stroke={active ? gradient : "currentColor"}
            strokeWidth={2.2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35 }}
          />
        </>
      )}
    />
  );
}

/* ================================================================== */
/*  ─── ЭМОЦИОНАЛЬНЫЕ ───                                              */
/* ================================================================== */

/** StarIcon — звезда с twinkle-искрой */
export function StarIcon(props: AppIconProps) {
  return (
    <IconShell
      label="В избранное"
      tone="gold"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          {active && !reduced && (
            <motion.g
              initial={{ opacity: 0, scale: 0, rotate: -45 }}
              animate={{ opacity: [0, 1, 0], scale: [0.3, 1.4, 0.5], rotate: 45 }}
              transition={{ duration: 0.7 }}
              style={{ transformOrigin: "17px 7px" }}
            >
              <path d="M17 4v6M14 7h6" stroke="#fde68a" strokeWidth={1.4} />
            </motion.g>
          )}
          <motion.path
            d="M12 3l2.6 5.8L21 9.5l-4.7 4.3 1.2 6.4L12 17l-5.5 3.2 1.2-6.4L3 9.5l6.4-.7L12 3z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={
              reduced
                ? undefined
                : active
                  ? { scale: [1, 1.2, 1], rotate: [0, 14, -8, 0] }
                  : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.55 }}
            style={{ transformOrigin: "12px 12px" }}
          />
        </>
      )}
    />
  );
}

/** FireIcon — пламя с мерцающей верхушкой */
export function FireIcon(props: AppIconProps) {
  return (
    <IconShell
      label="В огне"
      tone="red"
      {...props}
      render={({ active, reduced, gradient, hovering }) => {
        const flicker = !reduced && (active || hovering);
        return (
          <motion.g
            animate={flicker ? { scale: [1, 1.06, 0.97, 1.02, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: flicker ? Infinity : 0 }}
            style={{ transformOrigin: "12px 14px" }}
          >
            <path
              d="M12 2c1 3 3 4 3 7 0 1.5-.8 2.5-2 3 2 0 4 1.5 4 4.5A5.5 5.5 0 016.5 17c0-3 2-5 3-7 0 1 .5 2 1.5 2.5 0-3-1-5 1-10.5z"
              fill={active ? gradient : "none"}
              stroke={active ? "transparent" : "currentColor"}
            />
            {flicker && (
              <motion.path
                d="M12 4c.5 1.5 1.5 2 1.5 4"
                stroke="#fde68a"
                fill="none"
                initial={{ opacity: 0, pathLength: 0 }}
                animate={{ opacity: [0.2, 1, 0.2], pathLength: [0.5, 1, 0.5] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
            )}
          </motion.g>
        );
      }}
    />
  );
}

/** VerifiedIcon — "печать" со вспышкой */
export function VerifiedIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Верифицировано"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <motion.path
            d="M12 2l2.6 1.6 3-.4 1.5 2.7 2.5 1.7-.9 3 .9 3-2.5 1.7-1.5 2.7-3-.4L12 22l-2.6-1.6-3 .4-1.5-2.7L2.4 16.4l.9-3-.9-3 2.5-1.7 1.5-2.7 3 .4L12 2z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
            animate={reduced ? undefined : active ? { rotate: [0, 10, -6, 0], scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.6 }}
            style={{ transformOrigin: "12px 12px" }}
          />
          <motion.path
            d="M8 12l3 3 5-5"
            stroke={active ? "#fff" : "currentColor"}
            strokeWidth={2}
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: active && !reduced ? 0.18 : 0 }}
          />
        </>
      )}
    />
  );
}

/** BroadcastIcon — динамик/мегафон для каналов */
export function BroadcastIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Канал"
      {...props}
      render={({ active, reduced, gradient, gradientAlt }) => (
        <>
          <motion.path
            d="M3 11l11-4v10L3 13v-2z"
            fill={active ? gradient : "none"}
            stroke={active ? "transparent" : "currentColor"}
          />
          <motion.path
            d="M14 11h2a3 3 0 010 6h-2"
            fill="none"
            stroke={active ? gradientAlt : "currentColor"}
            animate={reduced ? undefined : active ? { pathLength: [0.5, 1, 0.8, 1] } : { pathLength: 1 }}
            transition={{ duration: 0.8, repeat: active && !reduced ? Infinity : 0 }}
          />
        </>
      )}
    />
  );
}

/** GroupIcon — группа пользователей */
export function GroupIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Группа"
      {...props}
      render={({ active, gradient }) => (
        <>
          <circle cx="9" cy="10" r="2.4" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <circle cx="15" cy="10.5" r="2" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M4.5 18c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3" fill="none" stroke="currentColor" />
          <path d="M12.6 18c.5-1.4 1.6-2.2 3-2.2 1.2 0 2.2.6 2.9 1.8" fill="none" stroke="currentColor" />
        </>
      )}
    />
  );
}

/** ArchiveBoxIcon — архив */
export function ArchiveBoxIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Архив"
      {...props}
      render={({ active, gradient }) => (
        <>
          <rect x="3" y="5" width="18" height="4" rx="1.5" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M5 9v9.5a2 2 0 002 2h10a2 2 0 002-2V9" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M9 13h6" />
        </>
      )}
    />
  );
}

/** ArchiveRestoreIcon — извлечение из архива */
export function ArchiveRestoreIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Из архива"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <rect x="3" y="5" width="18" height="4" rx="1.5" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M5 9v9.5a2 2 0 002 2h10a2 2 0 002-2V9" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <motion.path
            d="M12 16V11m0 0l-2 2m2-2l2 2"
            animate={reduced ? undefined : active ? { y: [0, -0.9, 0] } : { y: 0 }}
            transition={{ duration: 0.9, repeat: active && !reduced ? Infinity : 0 }}
          />
        </>
      )}
    />
  );
}

/** PinIcon — закреп */
export function PinIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Закрепить"
      {...props}
      render={({ active, gradient }) => (
        <>
          <path d="M8 5h8l-2 4v3l2 2H8l2-2V9L8 5z" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M12 14v5" />
        </>
      )}
    />
  );
}

/** PinOffIcon — откреп */
export function PinOffIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Открепить"
      {...props}
      render={({ active, gradient }) => (
        <>
          <path d="M8 5h8l-2 4v3l2 2H8l2-2V9L8 5z" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M12 14v5" />
          <path d="M5 5l14 14" stroke={active ? "#fb7185" : "currentColor"} />
        </>
      )}
    />
  );
}

/** LoginIcon — вход */
export function LoginIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Войти"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <path d="M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" fill="none" stroke={active ? gradient : "currentColor"} />
          <motion.path
            d="M4 12h10m-3-3l3 3-3 3"
            fill="none"
            stroke={active ? gradient : "currentColor"}
            animate={reduced ? undefined : active ? { x: [0, 1.2, 0] } : { x: 0 }}
            transition={{ duration: 0.8, repeat: active && !reduced ? Infinity : 0 }}
          />
        </>
      )}
    />
  );
}

/** DoubleCheckIcon — двойная галочка */
export function DoubleCheckIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Прочитано"
      {...props}
      render={({ active, reduced, gradient }) => (
        <>
          <path d="M2.8 13l2.3 2.4L9.2 11" stroke={active ? gradient : "currentColor"} fill="none" />
          <motion.path
            d="M8.8 13l2.3 2.4L16.8 9.8"
            stroke={active ? gradient : "currentColor"}
            fill="none"
            initial={{ pathLength: 0.75 }}
            animate={reduced ? { pathLength: 1 } : active ? { pathLength: [0.75, 1, 0.82, 1] } : { pathLength: 1 }}
            transition={{ duration: 0.9, repeat: active && !reduced ? Infinity : 0 }}
          />
        </>
      )}
    />
  );
}

/** SpinnerIcon — индикатор загрузки */
export function SpinnerIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Загрузка"
      {...props}
      render={({ reduced, gradient }) => (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.2" fill="none" />
          <motion.path
            d="M12 4a8 8 0 018 8"
            stroke={gradient}
            fill="none"
            animate={reduced ? undefined : { rotate: 360 }}
            transition={reduced ? undefined : { duration: 0.9, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "12px 12px" }}
          />
        </>
      )}
    />
  );
}

/** GlobeIcon — глобус/сайт */
export function GlobeIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Сайт"
      {...props}
      render={({ active, gradient }) => (
        <>
          <circle cx="12" cy="12" r="9" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <path d="M3 12h18" stroke={active ? "#fff" : "currentColor"} />
          <path d="M12 3a14 14 0 010 18" stroke={active ? "#fff" : "currentColor"} />
          <path d="M12 3a14 14 0 000 18" stroke={active ? "#fff" : "currentColor"} />
        </>
      )}
    />
  );
}

/** AtSignIcon — username */
export function AtSignIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Username"
      {...props}
      render={({ active, gradient }) => (
        <>
          <path
            d="M16.5 14.5A4.5 4.5 0 1112 7.5v6.2a2.3 2.3 0 104.6 0V12"
            fill="none"
            stroke={active ? gradient : "currentColor"}
          />
          <path d="M12 20a8 8 0 118-8" fill="none" stroke={active ? gradient : "currentColor"} />
        </>
      )}
    />
  );
}

/** ImageSquareIcon — фото */
export function ImageSquareIcon(props: AppIconProps) {
  return (
    <IconShell
      label="Фото"
      {...props}
      render={({ active, gradient }) => (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" fill={active ? gradient : "none"} stroke={active ? "transparent" : "currentColor"} />
          <circle cx="9" cy="10" r="1.6" fill={active ? "#fff" : "currentColor"} />
          <path d="M6 17l4-4 3 2.5 2.5-2.5L18 17" fill="none" stroke={active ? "#fff" : "currentColor"} />
        </>
      )}
    />
  );
}
