# SVG Optimization

## Описание

Скилл для работы с SVG: оптимизация размера, выбор inline vs file, accessibility, анимация SVG-элементов. Критично для иконок, иллюстраций и data-visualization.

## Когда использовать

- Добавление иконок и иллюстраций
- Оптимизация bundle size (SVG часто 30-70% от исходного)
- Анимация SVG paths, morphing
- Создание доступных иконок для screen readers
- Responsive иллюстрации

## Чеклист

- [ ] SVGO обработка: удалить metadata, comments, editor data
- [ ] Убрать `width`/`height`, оставить `viewBox` для масштабирования
- [ ] Иконки < 2KB — inline через React-компонент
- [ ] Иллюстрации > 5KB — отдельный файл + lazy load
- [ ] `aria-hidden="true"` на декоративных SVG
- [ ] `role="img"` + `aria-label` на смысловых SVG
- [ ] `currentColor` вместо hardcoded цветов (наследует от parent)
- [ ] Stroke-based иконки: `stroke-width` через CSS custom property

## Пример: иконка-компонент

```tsx
interface IconProps {
  size?: number
  className?: string
  label?: string
}

function ChevronIcon({ size = 24, className, label }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
```

## Пример: SVGO конфиг

```js
// svgo.config.js
module.exports = {
  plugins: [
    'preset-default',
    'removeDimensions',
    { name: 'removeAttrs', params: { attrs: ['data-name', 'class'] } },
    { name: 'addAttributesToSVGElement', params: { attributes: [{ fill: 'none' }] } },
  ],
}
```

## Пример: animated SVG path

```tsx
import { motion } from 'framer-motion'

function CheckmarkAnimated() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24}>
      <motion.path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  )
}
```

## Inline vs File — решение

| Критерий | Inline (React-компонент) | File (img src / lazy) |
|---|---|---|
| Размер < 2KB | Да | Нет |
| Нужна стилизация через CSS | Да | Нет |
| Нужна анимация paths | Да | Нет |
| Иллюстрация > 5KB | Нет | Да |
| Повторяется 10+ раз на странице | Sprite или font | Да |

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| SVG без `viewBox` | Не масштабируется, фиксированный размер | Убрать `width`/`height`, оставить `viewBox` |
| `fill="#000000"` hardcoded | Не работает с dark mode | `fill="currentColor"` |
| Иконка без accessibility | Screen reader не понимает | `aria-hidden` или `role="img" + aria-label` |
| 200KB SVG inline | Блокирует рендер, раздувает JS bundle | Отдельный файл + `<img>` или lazy import |
| `dangerouslySetInnerHTML` для SVG | XSS уязвимость | React-компонент или sanitize |
| `<img src="icon.svg">` для 16px иконки | HTTP-запрос ради 200 байт | Inline компонент |
