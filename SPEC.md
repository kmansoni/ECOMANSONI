# SPEC.md — Reels Page Design System

## 1. Концепция и видение

**Полноэкранный Immersive Reels** — пользователь полностью погружается в контент. Минималистичный интерфейс отступает назад, контент на первом плане. Жидкое стекло (Liquid Glass) создаёт ощущение, что элементы UI парят над видео.

**Аналоги:** TikTok (вертикальный scroll), Instagram Reels (immersive), YouTube Shorts (focus).

**Отличие от текущего:** Чистая архитектура — каждый элемент имеет чёткое назначение, анимации несут смысл, нет визуального шума.

---

## 2. Layout System

```
┌─────────────────────────────────────┐
│         STATUS BAR (safe area)        │  ← Системная зона
├─────────────────────────────────────┤
│                                      │
│  [←]  Для вас │ Подписки  [🔍]     │  ← Header: 48px, glass blur
│                                      │
├─────────────────────────────────────┤
│                                      │
│                                      │
│         ┌─────────────────┐          │
│         │   VIDEO AREA     │          │
│         │   (full bleed)   │          │
│         │                  │          │
│         │                  │          │
│         │  ┌──────────┐   │          │
│         │  │ @author │   │          │
│         │  │ desc... │   │          │
│         │  └──────────┘   │          │  ← Overlay: gradient снизу
│         │                  │          │
│         │     🎵 ──────    │          │  ← Music: marquee
│         │                  │          │
│         └─────────────────┘          │
│                                      │
│                           ┌───┐     │
│                           │ ❤️│ 12K │  ← RIGHT SIDEBAR
│                           ├───┤     │     72px от правого края
│                           │ 💬│ 234 │     120px от низа
│                           ├───┤     │
│                           │ ↗ │     │
│                           ├───┤     │
│                           │ 🔖│     │
│                           ├───┤     │
│                           │ 🔁│     │
│                           ├───┤     │
│                           │ 🔇│     │
│                           └───┘     │
│                                      │
│                           ┌─────┐   │
│                           │ AVA │   │  ← Author Avatar: 48px
│                           └─────┘   │     с follow badge
│                                      │
├─────────────────────────────────────┤
│  [▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░] │  ← Progress: 3px, внизу
└─────────────────────────────────────┘
```

### Z-Index Stack
1. `z-0` — Video
2. `z-10` — Gradient overlays
3. `z-20` — Content (author info, description)
4. `z-30` — Sidebar buttons
5. `z-40` — Header
6. `z-50` — Progress bar
7. `z-60` — Sheets (comments, share)
8. `z-70` — Reaction picker

---

## 3. Цветовая система

### Base (Dark Theme)
```css
--bg-primary: #050508        /* Почти чёрный с холодным оттенком */
--bg-overlay: rgba(0,0,0,0.6) /* Gradient overlay */

/* Glass Surface */
--glass-bg: linear-gradient(145deg,
  rgba(255,255,255,0.06),
  rgba(255,255,255,0.02))
--glass-border: rgba(255,255,255,0.12)
--glass-blur: blur(24px)

/* Brand Accent */
--accent-cyan: #00b4d8
--accent-teal: #00c896
--accent-gradient: linear-gradient(135deg, #00b4d8, #00c896)

/* Glow Effects */
--glow-brand: 0 0 24px rgba(0,180,216,0.4)
--glow-active: 0 0 16px rgba(255,255,255,0.25)

/* Text */
--text-primary: #ffffff
--text-secondary: rgba(255,255,255,0.7)
--text-muted: rgba(255,255,255,0.4)

/* Semantic */
--like-active: #ff4466      /* Розовый для лайка */
--save-active: #ffc832       /* Золотой для сохранения */
--share-active: #00b4d8      /* Cyan для шаринга */
--follow-active: linear-gradient(135deg, #00b4d8, #00c896)
```

---

## 4. Компоненты и их состояния

### 4.1 Sidebar Button (RIGHT ACTIONS)

**Размер:** 56×56px touch target, иконка 24px
**Расстояние между кнопками:** 20px
**Отступ от края:** 16px
**Отступ от низа:** 120px (выше nav bar)

| Кнопка | Иконка | Counter | Glow | Анимация Tap |
|--------|--------|---------|------|--------------|
| Like | ❤️ | 12.4K | Розовый | Scale 0.85 → 1.2 → 1, bounce |
| Comment | 💬 | 234 | — | Scale 0.9, opacity pulse |
| Share | ↗ | — | Cyan | Scale 0.9, rotate 15° |
| Save | 🔖 | — | Золотой | Scale 0.9, bookmark fill |
| Repost | 🔁 | — | — | Rotate 360° |
| Mute | 🔇/🔊 | — | — | Rotate 180° |

**States:**
- Default: glass-bg, glass-border
- Hover: brightness +10%, border opacity +50%
- Active/Pressed: scale 0.85, shadow inset
- Toggled On: brand glow, gradient bg
- Disabled: opacity 0.5

**Ripple Effect:**
```css
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)
box-shadow: 0 4px 12px -4px currentColor
```

### 4.2 Like Button — Полная спецификация

**Размер:** 56×56px
**Иконка:** 32px emoji или 28px SVG

```
┌─────────────────────────────────────┐
│           LIKE ANATOMY               │
├─────────────────────────────────────┤
│                                     │
│     ┌───────────────────────┐       │
│     │   BACKDROP FILTER    │       │  ← blur(20px), brightness(1.1)
│     └───────────────────────┘       │
│                                     │
│     ┌───────────────────────┐       │
│     │   GLASS SURFACE       │       │  ← rounded-3xl, glass-bg
│     │   ┌───────────────┐   │       │
│     │   │  INNER GLOW   │   │       │  ← radial gradient
│     │   │   ─────────   │   │       │  ← top highlight line
│     │   │     ❤️        │   │       │  ← emoji 32px
│     │   │   ─────────   │   │       │  ← bottom shadow
│     │   └───────────────┘   │       │
│     └───────────────────────┘       │
│                                     │
│              12.4K                  │  ← counter below
│                                     │
└─────────────────────────────────────┘
```

**Tap Animation Sequence:**
1. **Phase 1 (0-100ms):** Scale 1 → 0.8, opacity 1 → 0.8
2. **Phase 2 (100-200ms):** Scale 0.8 → 1.3, emoji bounce
3. **Phase 3 (200-400ms):** Emoji burst particles (6 small circles)
4. **Phase 4 (400-600ms):** Scale 1.3 → 1, settle with spring

**Particle Burst (Like Animation):**
```
Отцентрированный burst, 6 частиц:
- Размер: 4px
- Цвет: розовый с opacity fade
- Движение: радиально наружу, 60px
- Duration: 400ms ease-out
```

### 4.3 Comment Button

**Tap:** Scale 0.9, ripple effect
**Long Press:** Open comments sheet
**Badge:** Comment count

### 4.4 Share Button

**Tap:** Scale 0.9 + rotate 15°
**Sheet:** Bottom sheet с sharing options

### 4.5 Save Button

**Tap:** Scale 0.9, bookmark fill animation
**Active State:** Золотой glow, filled bookmark

### 4.6 Mute Button

**Icon Change:** Crossfade с rotate
**State Indicator:** Speaker waves / muted icon

---

## 5. Author Avatar Section

**Размер:** 48×48px
**Позиция:** Под правым sidebar, 16px от края

```
┌────────┐
│  AVA   │  ← Glass border ring
│ ┌────┐ │  ← Glow ring (если новый автор)
│ │    │ │
│ └────┘ │
└────────┘
```

**Follow Badge:** Маленький + button, появляется справа от аватарки

---

## 6. Header / Top Bar

**Высота:** 48px
**Фон:** glass-bg с blur
**Элементы:**
- Back arrow (слева)
- Tab switcher "Для вас" | "Подписки" (центр)
- Search icon (справа)

### Tab Switcher Animation

**Active Tab Indicator:**
```
┌─────────────────────────────────┐
│   GLASS CONTAINER (pill)       │
│   ┌───────────────────────────┐ │
│   │      GLOW BACKDROP        │ │  ← blur glow, pulse
│   │  ┌─────────────────────┐ │ │
│   │  │  ACTIVE INDICATOR   │ │ │  ← sliding pill
│   │  └─────────────────────┘ │ │
│   │  [ Для вас ] [Подписки ] │ │
│   └───────────────────────────┘ │
└─────────────────────────────────┘
```

**Indicator Animation:**
- Slide: spring(stiffness: 400, damping: 25)
- Width: 50% каждого таба
- Glow: pulsing opacity 0.4 → 0.7

---

## 7. Video Overlay Content

### Author Info Block
```
┌─────────────────────────────────────┐
│ [AVA] @username ✓   [Follow]      │  ← Row 1: avatar + name + badge
│                                     │
│ description text with #hashtags...  │  ← Row 2: description
│                                     │
│ [🎵] ════════════════════════════  │  ← Row 3: music marquee
└─────────────────────────────────────┘
```

**Description States:**
- Collapsed: max 2 lines, "ещё" button
- Expanded: full text, smooth height animation
- Hashtags: inline blue links с glass hover

### Music Marquee
```
┌─────────────────────────────────────┐
│ [🎵] ━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│      (бесконечный loop marquee)     │
└─────────────────────────────────────┘
```

**Animation:** CSS marquee, 8s linear, pause on hover

---

## 8. Progress Bar

**Размер:** 3px высота
**Позиция:** Абсолютно внизу экрана
**Состояния:**
- Playing: gradient fill cyan→teal
- Paused: static, dimmed
- Buffering: striped pattern overlay

**Glow:** Маленький dot на конце, pulse при воспроизведении

---

## 9. Bottom Sheets

### Comments Sheet
```
┌─────────────────────────────────────┐
│  ═══════ (drag handle) ═══════     │
│                                     │
│  💬 Комментарии (234)        [X]    │
│  ─────────────────────────────────  │
│                                     │
│  [Comment Item]                    │
│  [AVA] @name · 2ч                  │
│  Comment text here...     ❤️ 12     │
│    └─ Reply button                 │
│                                     │
│  [Comment Item]                     │
│                                     │
│  ─────────────────────────────────  │
│  [AVA] [ Input field...    ] [➤] │
└─────────────────────────────────────┘
```

**Animation:**
- Open: slide up, spring(stiffness: 300, damping: 30)
- Close: slide down или swipe gesture
- Backdrop: fade in 0.2s

### Share Sheet
```
┌─────────────────────────────────────┐
│  ═══════ (drag handle) ═══════     │
│                                     │
│  ↗ Поделиться                [X]    │
│  ─────────────────────────────────  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ [🎬] mansoni/reels  [View] │   │  ← Preview card
│  └─────────────────────────────┘   │
│                                     │
│  ❤️ 12.4K  💬 234  🔁 45          │  ← Stats row
│                                     │
│  ┌─────────────────────────────┐   │
│  │ [DM] Send to friend          │   │  ← Share options
│  │ [👥] To group                │   │
│  │ [📢] To channel             │   │
│  │ [📸] Instagram Stories       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │         Copy Link           │   │  ← Primary action
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 10. Reaction Picker

**Trigger:** Long press на like button (500ms)

```
     ┌─────────────────────────────────┐
     │  [❤️] [🔥] [😂] [😮] [😢]    │
     │  [👏] [💯] [🙏] [🎉] [🤔]    │
     └─────────────────────────────────┘
```

**Animation:**
- Enter: scale 0.5 → 1, y 20 → 0, spring
- Exit: scale 1 → 0.5, fade out
- Emoji hover: scale 1.3, lift up
- Emoji tap: bounce, glow ring

---

## 11. Animations Summary

### Micro-interactions

| Element | Animation | Trigger | Duration |
|---------|-----------|---------|----------|
| Like button | Scale bounce + particles | Tap | 600ms |
| Comment button | Scale 0.9 | Tap | 200ms |
| Share button | Scale 0.9 + rotate | Tap | 200ms |
| Save button | Scale 0.9 + fill | Tap | 300ms |
| Mute button | Rotate 180° | Tap | 200ms |
| Tab indicator | Slide + glow pulse | Tab change | 300ms |
| Follow button | Pulse glow | Appear | 2000ms loop |
| Music note | Rotate 360° | Loop | 3000ms |
| Progress dot | Glow pulse | Playing | 1500ms loop |

### Entrance Animations

| Screen | Animation | Trigger |
|---------|-----------|---------|
| Sidebar buttons | Stagger fade-in from right | Reel appears |
| Author info | Fade up from bottom | Reel appears |
| Comments sheet | Slide up + fade | Open |
| Share sheet | Slide up + fade | Open |
| Reaction picker | Scale + fade | Long press |

### Gesture-based

| Gesture | Action | Feedback |
|---------|--------|----------|
| Tap video | Play/Pause | Icon flash |
| Double tap | Like + heart animation | Big heart + particles |
| Swipe up | Next reel | Scroll snap |
| Swipe down | Previous reel | Scroll snap |
| Swipe left on sheet | Dismiss sheet | Slide + fade |
| Long press like | Open reaction picker | Picker appears |

---

## 12. Responsive Behavior

### Mobile (< 640px)
- Full bleed video
- Sidebar: 56px buttons, 16px gap
- Header: compact 44px
- Safe area: respect iOS notch

### Tablet (640px - 1024px)
- Same as mobile
- Slightly larger touch targets (60px)

### Desktop (> 1024px)
- Center-aligned video, max-width 450px
- Sidebar appears on hover
- Keyboard shortcuts enabled

---

## 13. Accessibility

- Minimum touch target: 44×44px
- Color contrast: minimum 4.5:1 for text
- Focus indicators for keyboard nav
- Screen reader announcements for state changes
- Reduced motion: respect `prefers-reduced-motion`
