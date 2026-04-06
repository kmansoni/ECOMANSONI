---
name: font-loading-strategy
description: "Стратегия загрузки шрифтов: font-display swap, preconnect, variable fonts, FOUT/FOIT. Use when: шрифты, font loading, FOUT, FOIT, preload font, font-display, performance шрифты."
---

# Font Loading Strategy — Загрузка шрифтов

---

## font-display: swap (обязательно)

```css
/* Всегда указывать font-display: swap */
/* Пока шрифт загружается — показывать системный (нет FOIT) */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;   /* Критически важно для LCP */
}
```

---

## Preload критических шрифтов (index.html)

```html
<head>
  <!-- Preconnect к Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

  <!-- Preload самостоятельно хостируемых шрифтов -->
  <link
    rel="preload"
    href="/fonts/inter-var.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
  <!-- crossorigin обязателен для preload шрифтов! -->
</head>
```

---

## Tailwind: системный стек как fallback

```typescript
// tailwind.config.ts
export default {
  theme: {
    fontFamily: {
      sans: [
        'Inter',
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        'sans-serif',
      ],
      mono: [
        '"JetBrains Mono"',
        '"Fira Code"',
        '"Courier New"',
        'monospace',
      ],
    },
  },
};
```

---

## Variable fonts (один файл вместо многих)

```css
/* ❌ Плохо: 6 файлов для каждого weight */
@font-face { font-family: 'Inter'; src: url('inter-400.woff2'); font-weight: 400; }
@font-face { font-family: 'Inter'; src: url('inter-500.woff2'); font-weight: 500; }
@font-face { font-family: 'Inter'; src: url('inter-700.woff2'); font-weight: 700; }

/* ✅ Хорошо: один variable font ~80KB */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-weight: 100 900;  /* Весь диапазон */
  font-display: swap;
}
```

---

## Самостоятельный хостинг шрифтов

```
Преимущества:
- Нет CORS предупреждений
- Работает offline (PWA)
- Нет privacy leak к Google

Источники variable fonts:
- https://fontsource.org/ — npm пакеты
- https://fonts.google.com/ — скачать TTF → конвертировать в WOFF2

Конвертация в WOFF2:
npm install ttf2woff2 -g
ttf2woff2 < inter.ttf > inter-var.woff2
```

---

## Диагностика

```javascript
// Проверить загрузку шрифтов
document.fonts.ready.then(() => {
  console.log('Шрифты загружены:', [...document.fonts].map(f => `${f.family} ${f.weight}`));
});

// Проверить FOIT (Flash of Invisible Text)
// Network DevTools → замедлить сеть → посмотреть появляются ли пустые блоки
```

---

## Чеклист

- [ ] `font-display: swap` на всех @font-face правилах
- [ ] preload для главного шрифта в `<head>`
- [ ] `crossorigin` атрибут на preload `<link>`
- [ ] преimulsive шрифты хранятся в `/public/fonts/` (не CDN)
- [ ] systemный fallback stack в Tailwind
- [ ] Variable font вместо множества файлов per weight
- [ ] Только нужные подмножества символов (Latin + Cyrillic)
