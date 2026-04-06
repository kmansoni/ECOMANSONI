# CSS Animation Patterns

## Описание

Скилл для реализации анимаций: CSS transitions, keyframes, Framer Motion spring physics, gesture-анимации. Покрывает перфоманс, accessibility и mobile-специфику.

## Когда использовать

- Анимация появления/исчезновения компонентов
- Переходы между состояниями (tab switch, accordion, modal)
- Gesture-driven UI (swipe, drag, pinch)
- Микроанимации: hover, focus, press feedback
- Skeleton shimmer, progress indicators

## Стек проекта

- Framer Motion (`motion`, `AnimatePresence`, `useSpring`)
- CSS transitions/keyframes для простых случаев
- TailwindCSS `animate-*` утилиты

## Чеклист

- [ ] `prefers-reduced-motion` — отключить/упростить анимации
- [ ] GPU-ускорение: анимировать только `transform` и `opacity`
- [ ] `will-change` только перед анимацией, убрать после
- [ ] `AnimatePresence` для exit-анимаций (не `display: none`)
- [ ] Touch feedback: `whileTap={{ scale: 0.97 }}` на интерактивных элементах
- [ ] Duration: 150-300ms для UI, 300-500ms для layout shifts
- [ ] `layout` prop для анимации изменения позиции в списках
- [ ] Не анимировать `height: auto` через CSS — использовать Framer Motion

## Пример: анимированный список

```tsx
import { motion, AnimatePresence } from 'framer-motion'

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -100 },
}

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <AnimatePresence initial={false}>
      {messages.map(msg => (
        <motion.div
          key={msg.id}
          variants={item}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          layout
        >
          <MessageBubble message={msg} />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
```

## Пример: gesture swipe-to-dismiss

```tsx
function SwipeCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 120) onDismiss()
      }}
      whileDrag={{ scale: 0.95 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* content */}
    </motion.div>
  )
}
```

## Паттерн: reduced motion

```tsx
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const transition = prefersReduced
  ? { duration: 0 }
  : { type: 'spring', stiffness: 300, damping: 30 }
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `transition: all 0.3s` | Анимирует layout properties (width, height, top) — дёргается | Указать конкретно: `transition: transform 0.2s, opacity 0.2s` |
| `animation` на `margin`/`padding` | Вызывает layout recalc каждый кадр | `transform: translateX()` |
| `setTimeout` для последовательных анимаций | Рассинхрон, не отменяется | `transition={{ delay: 0.1 }}` или `staggerChildren` |
| Анимация без `AnimatePresence` | Элемент исчезает мгновенно при unmount | Обернуть в `AnimatePresence` + `exit` prop |
| `will-change` на всех элементах | Создаёт composite layer для каждого — жрёт память | Только на активно анимируемых, убрать после |
| Бесконечный `animate` без `prefers-reduced-motion` | Accessibility violation, motion sickness | Проверять media query |
