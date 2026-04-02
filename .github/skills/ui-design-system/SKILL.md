---
name: ui-design-system
description: "Профессиональная дизайн-система для SuperApp. Дизайн-токены, motion, адаптив, dark/light mode, skeleton/loading/empty, accessibility, SuperApp UI паттерны, виртуализация, lazy loading. Use when: дизайн, UI, тема, цвета, типографика, анимации, dark mode, skeleton, empty state, accessibility, ARIA, responsive, safe area, bottom sheet, swipe, виртуализация, lazy."
argument-hint: "[компонент, экран, токены или 'audit' для проверки всей системы]"
user-invocable: true
---

# UI Design System — Профессиональная дизайн-система SuperApp

Полная экспертиза по построению и использованию дизайн-системы для суперприложения: мессенджер + соцсеть + знакомства + такси + маркетплейс + CRM + стриминг + страхование + недвижимость.

## Принцип

> SuperApp = 9 доменов в одном приложении. Визуальная целостность обеспечивается ЕДИНОЙ дизайн-системой: общие токены, единые компоненты, консистентные паттерны навигации. Каждый домен получает свой accent color, но остаётся частью целого.

---

## 1. Дизайн-токены

### 1.1. Цветовая система

```css
/* tailwind.config.ts → theme.extend.colors */
/* Базовые цвета через CSS variables для dark/light */

:root {
  /* Нейтральные */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  
  /* Semantic */
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --success: 142 76% 36%;
  --success-foreground: 210 40% 98%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 0%;

  /* Доменные акценты */
  --accent-messenger: 210 100% 52%;    /* Blue — чат */
  --accent-social: 330 81% 60%;        /* Pink — соцсеть */
  --accent-dating: 350 89% 60%;        /* Red-pink — знакомства */
  --accent-taxi: 45 97% 54%;           /* Yellow — такси */
  --accent-marketplace: 262 83% 58%;   /* Purple — маркетплейс */
  --accent-crm: 173 80% 40%;           /* Teal — CRM */
  --accent-streaming: 0 72% 51%;       /* Red — стриминг */
  --accent-insurance: 199 89% 48%;     /* Cyan — страхование */
  --accent-realestate: 152 69% 40%;    /* Green — недвижимость */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
}
```

### 1.2. Типографика

```css
/* Шкала типографики — mobile-first */
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Type scale (tailwind classes) */
  /* xs:   text-xs     → 12px / 16px (caption, metadata) */
  /* sm:   text-sm     → 14px / 20px (secondary text, labels) */
  /* base: text-base   → 16px / 24px (body text, messages) */
  /* lg:   text-lg     → 18px / 28px (subheadings) */
  /* xl:   text-xl     → 20px / 28px (headings) */
  /* 2xl:  text-2xl    → 24px / 32px (page titles) */
  /* 3xl:  text-3xl    → 30px / 36px (hero, splash) */
  
  /* Font weights */
  /* normal: 400 — body */
  /* medium: 500 — labels, active tabs */
  /* semibold: 600 — headings, emphasis */
  /* bold: 700 — hero numbers, price */
}
```

### 1.3. Spacing (8px grid)

```
/* Все отступы кратны 8px (0.5rem) */
/* Исключение: 4px (0.25rem) для micro-spacing внутри компонентов */

/* Шкала: */
/*  1 = 4px   — gap между icon и text */
/*  2 = 8px   — padding в badge, chip */
/*  3 = 12px  — gap в card content */
/*  4 = 16px  — padding в card, section gap */
/*  5 = 20px  — gap между секциями */
/*  6 = 24px  — page padding (mobile) */
/*  8 = 32px  — section separator */
/* 10 = 40px  — large section gap */
/* 12 = 48px  — page top/bottom padding */
/* 16 = 64px  — bottom nav height + safe area */
```

### 1.4. Border Radius

```
/* rounded-sm  = 4px  — tags, chips */
/* rounded-md  = 6px  — inputs, small cards */
/* rounded-lg  = 8px  — cards, dialogs */
/* rounded-xl  = 12px — bottom sheets, modals */
/* rounded-2xl = 16px — hero cards, feature blocks */
/* rounded-full        — avatars, FAB buttons */
```

### 1.5. Elevation (shadows)

```css
/* shadow-sm   — карточки в списке, messages */
/* shadow-md   — dropdown, tooltip */
/* shadow-lg   — modals, bottom sheet */
/* shadow-xl   — FAB, floating action */

/* В dark mode: shadows заменяются на border-border/50 */
```

---

## 2. Motion / Анимации

### 2.1. Timing tokens

```css
:root {
  --duration-instant: 100ms;    /* hover, focus ring */
  --duration-fast: 200ms;       /* toggle, checkbox, tab switch */
  --duration-normal: 300ms;     /* modal enter, bottom sheet slide */
  --duration-slow: 500ms;       /* page transition, complex animations */
  
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);  /* standard Material */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);          /* exit */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);         /* enter */
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful: like button */
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* swipe snap */
}
```

### 2.2. Паттерны анимаций

```typescript
// Framer Motion — стандартные варианты
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
  transition: { duration: 0.3, ease: [0, 0, 0.2, 1] },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2 },
};

// Bottom sheet — spring physics
export const bottomSheet = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring', damping: 25, stiffness: 300 },
};

// Swipe card (dating)
export const swipeCard = {
  drag: 'x',
  dragConstraints: { left: 0, right: 0 },
  dragElastic: 0.7,
  // onDragEnd: рассчитать velocity + offset для snap
};

// Like animation (heart burst)
export const heartBurst = {
  scale: [1, 1.3, 1],
  transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
};

// Skeleton shimmer (CSS)
// bg-gradient-to-r from-muted via-muted-foreground/5 to-muted
// animate-[shimmer_2s_infinite]
// @keyframes shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
```

### 2.3. Когда анимировать, когда НЕТ

| Действие | Анимация | Duration |
|----------|----------|----------|
| Переключение табов | Fade crossfade | 200ms |
| Открытие модала | Scale + fade | 300ms |
| Bottom sheet | Spring slide up | spring |
| Toast уведомление | Slide in right | 300ms |
| Удаление элемента | Fade + collapse height | 200ms |
| Swipe чата (dating) | Physics-based | spring |
| Loading spinner | Rotate infinite | 1s |
| Pull-to-refresh | Spring bounce | spring |
| Hover состояние | Opacity/bg-color | 100ms |
| Skeleton shimmer | Translate loop | 2s |
| **Длинные списки** | **НЕТ анимации** | — |
| **Scroll внутри чата** | **НЕТ анимации** | — |
| **Набор текста** | **НЕТ анимации** | — |

### 2.4. `prefers-reduced-motion`

```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Все анимации: duration = 0, spring → instant snap
// Skeleton: показывать статичный placeholder
```

---

## 3. Адаптивный дизайн

### 3.1. Breakpoints

```typescript
// tailwind.config.ts
screens: {
  'xs': '360px',   // Минимальный Android (Samsung Galaxy A)
  'sm': '640px',   // Большие телефоны в landscape
  'md': '768px',   // Планшеты (iPad Mini)
  'lg': '1024px',  // Планшеты landscape / маленькие ноутбуки
  'xl': '1280px',  // Desktop
  '2xl': '1536px', // Широкие экраны
}
```

### 3.2. Capacitor Safe Areas

```css
/* Обязательно для Capacitor Android/iOS */
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}

/* Применение */
.app-header {
  padding-top: calc(var(--safe-area-top) + 12px);
}
.bottom-nav {
  padding-bottom: calc(var(--safe-area-bottom) + 8px);
  height: calc(56px + var(--safe-area-bottom));
}
.page-content {
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}
```

### 3.3. Responsive паттерны SuperApp

```
Mobile (360-767px):
  - Single column layout
  - Bottom tab navigation (5 main tabs)
  - Bottom sheets вместо modals
  - Full-screen pages (push navigation)
  - Gesture navigation (swipe back)
  - Floating Action Button (FAB) для main action
  - Compact message bubbles

Tablet (768-1023px):
  - Split view: sidebar (320px) + main content
  - Modals вместо bottom sheets
  - Two-column feed grid
  - Wider message input area

Desktop (1024+):
  - Three-column: nav sidebar (72px) + list sidebar (360px) + main content
  - Hover states видимы
  - Keyboard shortcuts активны
  - Context menu по right-click
  - Drag-and-drop для файлов
  - Wider cards, multi-column grids
```

### 3.4. Touch targets

```
/* Минимум 44x44px для интерактивных элементов (WCAG 2.5.8) */
/* Исключение: inline links в тексте — 24px minimal */

/* В Tailwind: min-h-11 min-w-11 для кнопок-иконок */
/* Для списков: py-3 px-4 минимум для каждого пункта */
```

---

## 4. Dark / Light Mode

### 4.1. Стратегия переключения

```typescript
// stores/theme-store.ts
type Theme = 'light' | 'dark' | 'system';

// При 'system': следить за matchMedia('(prefers-color-scheme: dark)')
// Класс .dark на <html> (Tailwind darkMode: 'class')
// Persit: localStorage key 'theme'
// Capacitor: StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
```

### 4.2. Правила dark mode

```
✅ Используй semantic tokens (bg-background, text-foreground, bg-card)
✅ Тени заменяй на borders в dark mode (shadow-md → border border-border)
✅ Изображения: filter brightness(0.9) в dark mode
✅ Checked состояния: сохранять контраст ≥ 4.5:1 (WCAG AA)

❌ НЕ используй bg-white/bg-black напрямую
❌ НЕ используй opacity для имитации серого (bg-black/10)
❌ НЕ забывай про scrollbar, selection, placeholder цвета
```

### 4.3. Доменные темы

```typescript
// Каждый модуль может установить свой accent:
// <div data-domain="taxi"> → CSS: [data-domain="taxi"] { --accent: var(--accent-taxi) }
// Button с variant="accent" использует текущий --accent
```

---

## 5. Состояния экранов

### 5.1. Skeleton Screens

```typescript
// Чеклист для каждого data-driven компонента:

// 1. MessageListSkeleton — повторяет layout реальных сообщений
export function MessageListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={cn("flex gap-3", i % 3 === 0 && "justify-end")}>
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className={cn("h-12", i % 2 === 0 ? "w-64" : "w-48")} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 2. FeedCardSkeleton — повторяет layout карточки поста
// 3. ProfileSkeleton — аватар + имя + stats
// 4. ProductCardSkeleton — изображение + заголовок + цена
// 5. MapSkeleton — серый прямоугольник с pulse

// Правила:
// - Количество элементов = среднее ожидаемое (5-8 для списков)
// - Размеры skeleton = ±20% от реального контента
// - Shimmer анимация (НЕ pulse) — выглядит профессиональнее
// - Цвет: bg-muted (НЕ bg-gray-200)
```

### 5.2. Empty States

```typescript
// Каждый empty state ОБЯЗАН содержать:
// 1. Иллюстрацию или иконку (120x120px opacity-50)
// 2. Заголовок (text-lg font-medium)
// 3. Описание (text-sm text-muted-foreground, 1-2 строки)
// 4. CTA кнопку (primary action) — если применимо

// Примеры по доменам:
const EMPTY_STATES = {
  chat:       { icon: MessageSquare, title: "Нет сообщений", desc: "Начните диалог", cta: "Написать" },
  feed:       { icon: Image,         title: "Лента пуста",   desc: "Подпишитесь на людей", cta: "Найти друзей" },
  dating:     { icon: Heart,         title: "Нет анкет",     desc: "Измените фильтры",  cta: "Настроить" },
  orders:     { icon: Package,       title: "Нет заказов",   desc: "Сделайте первый заказ", cta: "В магазин" },
  taxi:       { icon: Car,           title: "Нет поездок",   desc: "Закажите такси",     cta: "Заказать" },
  search:     { icon: Search,        title: "Ничего не найдено", desc: "Попробуйте другой запрос", cta: null },
  notifications: { icon: Bell,       title: "Нет уведомлений",  desc: "Вы в курсе всего", cta: null },
};
```

### 5.3. Error States

```typescript
// Шаблон error state:
// 1. Иконка ошибки (AlertTriangle, WifiOff, ShieldOff — по контексту)
// 2. Сообщение на человеческом языке (НЕ "Error 500")
// 3. Кнопка "Повторить" (всегда!)
// 4. Опционально: ссылка "Подробнее" для debug info (в dev mode)

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive opacity-60" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Повторить
      </Button>
    </div>
  );
}
```

### 5.4. Loading States

```typescript
// По приоритету (что использовать когда):
// 1. Skeleton — для первичной загрузки данных (лучший UX)
// 2. Spinner в кнопке — для user-initiated actions (отправить, сохранить)
// 3. Progress bar — для загрузки/выгрузки файлов (показать %)
// 4. Fullscreen spinner — НИКОГДА (=ленивый UX)
// 5. Pull-to-refresh indicator — для ручного обновления списков

// Spinner в кнопке:
<Button disabled={isPending}>
  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Отправить
</Button>

// Progress bar:
<Progress value={uploadProgress} className="h-2" />
```

---

## 6. Accessibility (A11y)

### 6.1. ARIA чеклист

```
☐ Все интерактивные элементы фокусируемы (tabindex=0 или нативный)
☐ Все картинки: alt="" (декоративные) или alt="описание" (смысловые)
☐ Формы: <label> связан с <input> (htmlFor / id)
☐ Модалы: role="dialog" aria-modal="true" aria-labelledby
☐ Toast: role="status" aria-live="polite"
☐ Ошибки форм: aria-invalid="true" aria-describedby → id ошибки
☐ Tabs: role="tablist" → role="tab" aria-selected → role="tabpanel"
☐ Dropdown: role="listbox" → role="option" aria-selected
☐ Loading: aria-busy="true" на контейнере
☐ Кнопки-иконки: aria-label="Удалить сообщение"
☐ Skip navigation link (для keyboard users)
```

### 6.2. Keyboard navigation

```
Tab / Shift+Tab — переход между элементами
Enter / Space — активация
Escape — закрыть модал / bottom sheet / dropdown
Arrow keys — навигация внутри list/grid
Home/End — первый/последний в списке

Мессенджер-специфично:
  Ctrl+Enter — отправить сообщение
  Escape — отменить reply/edit
  ArrowUp — редактировать последнее сообщение
  Ctrl+Shift+M — mute/unmute (в звонке)
```

### 6.3. Контрастность

```
Минимум WCAG AA:
  - Обычный текст: contrast ratio ≥ 4.5:1
  - Крупный текст (≥18px bold / ≥24px): ≥ 3:1
  - UI компоненты (borders, icons): ≥ 3:1
  
Проверять: в light И dark mode!
Инструмент: Chrome DevTools → Accessibility → Contrast
```

### 6.4. Screen reader

```typescript
// Визуально скрытый текст (для screen readers):
<span className="sr-only">Непрочитанных сообщений: 3</span>

// Live regions (для обновлений):
<div aria-live="polite" aria-atomic="true">
  {typingUsers.length > 0 && `${typingUsers[0]} набирает`}
</div>
```

---

## 7. SuperApp UI паттерны

### 7.1. Tab-based navigation

```
Bottom tabs (mobile): 5 основных модулей
  1. Чаты (MessageSquare) — мессенджер
  2. Лента (Compass) — соцсеть + reels
  3. Сервисы (Grid) — такси, маркетплейс, страхование, недвижимость
  4. Знакомства (Heart) — dating
  5. Профиль (User) — настройки, CRM

Badge на tab: красный dot / число непрочитанных
Active state: accent color + bold label
Transition: instant (без анимации между табами — как в Telegram)
```

### 7.2. Bottom Sheet

```typescript
// Использовать вместо модалов на мобильных
// Библиотека: vaul (Drawer component от shadcn)

// Варианты:
// 1. Snap points: ['148px', '355px', 1] — три позиции (mini, half, full)
// 2. Dismissable: swipe down to close
// 3. Handle: visible grab indicator наверху

// Когда bottom sheet vs modal:
// Bottom sheet: action menu, quick settings, filters, share
// Modal: confirmation dialog, complex form, payment
// Full-screen: photo viewer, video player, map
```

### 7.3. Swipe gestures

```typescript
// 1. Chat list: swipe right → pin/archive, swipe left → delete/mute
// 2. Dating: swipe left → nope, swipe right → like, swipe up → super-like
// 3. Stories: swipe left/right → prev/next story
// 4. Reels: swipe up/down → prev/next reel
// 5. Navigation: swipe from left edge → go back (Android gesture nav)

// ВАЖНО: не конфликтовать с системными жестами!
// Android: left edge 20px = system back gesture → не перехватывать
// iOS: left edge = swipe back → не перехватывать
```

### 7.4. Pull-to-refresh

```typescript
// Реализация: onScroll + touchmove на scrollable контейнере
// Threshold: 80px pull distance → trigger refresh
// Indicator: spinner в верхней части списка
// Haptic feedback: Capacitor Haptics.impact({ style: ImpactStyle.Light })
// Cooldown: не чаще 1 раза в 2 секунды (debounce)
```

### 7.5. Floating Action Button (FAB)

```typescript
// Позиция: right: 16px, bottom: 72px (над bottom nav + safe area)
// Size: 56x56px, rounded-full, shadow-xl
// Цвет: accent текущего домена
// Действие по домену:
//   Чаты → Новый чат
//   Лента → Создать пост
//   Маркетплейс → Создать объявление
//   Такси → Заказать
//   CRM → Новый контакт
```

---

## 8. Компонентная библиотека (расширения shadcn/ui)

### 8.1. Avatar variants

```typescript
// Sizes: xs(24) sm(32) md(40) lg(56) xl(80) 2xl(120)
// Status dot: online (green), offline (gray), busy (red)
// Placeholder: инициалы на цветном фоне (hsl от user_id hash)
// Group: AvatarGroup — overlapping, max 3 + "+N" badge
// Ring: online call indicator (animated ring)
```

### 8.2. Badge variants

```typescript
// Variants: default, secondary, destructive, outline, success, warning
// Domain: каждый домен получает свой badge color
// Dot badge: красная точка 8px для notification indicator
// Count badge: min-w(20px), max content "99+"
```

### 8.3. Card patterns по доменам

```
MessageCard: avatar + name + preview + time + unread badge
PostCard: author + media (aspect 4:5) + actions (like/comment/share) + caption
ProductCard: image + title + price + rating + seller badge
DatingCard: photo (full-bleed) + name/age + distance + gradient overlay
TaxiCard: pickup/destination + price + ETA + driver info
InsuranceCard: policy type + coverage + status + expiry
PropertyCard: photos (carousel) + price + area + rooms + address
CRMCard: contact name + company + deal value + stage badge
```

### 8.4. Modal / Sheet

```typescript
// Mobile: Drawer (bottom sheet) из vaul
// Desktop: Dialog из shadcn/ui
// Responsive wrapper:
export function ResponsiveModal({ children, ...props }: DialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  if (isMobile) return <Drawer {...props}>{children}</Drawer>;
  return <Dialog {...props}>{children}</Dialog>;
}
```

### 8.5. Toast

```typescript
// Библиотека: sonner
// Позиция: top-center (mobile), bottom-right (desktop)
// Варианты: success (green), error (red), info (blue), warning (yellow)
// Duration: 3s (info), 5s (error), persistent (action required)
// Swipe to dismiss: enabled
// Stacking: max 3 visible, older ones collapse
```

---

## 9. Performance

### 9.1. Виртуализация списков

```typescript
// Библиотека: @tanstack/react-virtual
// Применять для: чат-сообщения, лента постов, товары, контакты
// Threshold: > 50 элементов → виртуализировать

import { useVirtualizer } from '@tanstack/react-virtual';

// Обязательно: estimateSize для variable-height items
// Chat: dynamic height, measureElement + reverse scroll
// Feed: estimated 400px per card с image loading
// Contacts: fixed 64px per item
// Products: grid virtualization (2-3 columns)
```

### 9.2. Lazy loading

```typescript
// 1. Route-level code splitting:
const ChatPage = lazy(() => import('./pages/ChatPage'));
const TaxiPage = lazy(() => import('./pages/TaxiPage'));
// Обернуть в <Suspense fallback={<PageSkeleton />}>

// 2. Компоненты по видимости:
// Heavy компоненты: MapView, VideoPlayer, RichTextEditor
// Использовать IntersectionObserver или react-intersection-observer

// 3. Изображения:
// loading="lazy" на <img> ниже fold
// Placeholder: blur hash или solid color из dominant color
// Progressive JPEG для больших изображений
```

### 9.3. React.memo стратегия

```typescript
// Мемоизировать ВСЕГДА:
// - Элементы списков (MessageBubble, PostCard, ProductCard)
// - Тяжёлые компоненты (Map, VideoPlayer, Chart)
// - Компоненты, получающие unstable props (objects, callbacks)

// НЕ мемоизировать:
// - Layout компоненты (Page, Section, Container)
// - Компоненты с children (почти всегда новый reference)
// - Простые компоненты без props
```

### 9.4. Bundle optimization

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', /* ... */],
        'vendor-query': ['@tanstack/react-query'],
        'vendor-maps': ['leaflet', 'react-leaflet'],  // lazy load
        'vendor-media': ['mediasoup-client'],           // lazy load
      },
    },
  },
},
```

---

## 10. Workflow: Как использовать этот скилл

### Фаза 1: Аудит текущей системы
1. Прочитай `tailwind.config.ts` — token coverage
2. Прочитай `src/components/ui/` — shadcn/ui components
3. Прочитай `src/index.css` или `globals.css` — CSS variables
4. Проверь: все ли доменные цвета определены?
5. Проверь: есть ли dark mode support?

### Фаза 2: Создание/обновление токенов
1. Дизайн-токены → CSS variables + Tailwind config
2. Доменные акценты → data-domain attribute
3. Typography scale → проверить consistency

### Фаза 3: Компоненты
1. Проверить skeleton для каждого data-driven компонента
2. Проверить empty states для каждой страницы
3. Проверить error states + retry buttons
4. Проверить responsive на 360/768/1280

### Фаза 4: Accessibility
1. Прогнать ARIA чеклист по каждому интерактивному компоненту
2. Проверить keyboard navigation в модалах и формах
3. Проверить контрастность токенов в обоих темах

### Фаза 5: Performance
1. Проверить виртуализацию длинных списков
2. Проверить lazy loading routes
3. Проверить bundle size (> 500KB JS = проблема)

---

## Маршрутизация в оркестраторе

**Триггеры**: дизайн, UI, тема, цвета, типографика, шрифты, анимация, motion, dark mode, light mode, переключение темы, skeleton, empty state, loading state, accessibility, ARIA, responsive, адаптив, safe area, bottom sheet, swipe, жесты, виртуализация, lazy load, code split, дизайн-система, dark/light, тень, shadow, отступы, spacing, border radius, токены, SuperApp UI

**Агенты**:
- `architect` — при проектировании новых экранов
- `codesmith` — при реализации UI компонентов
- `review` — при аудите UI consistency и accessibility
