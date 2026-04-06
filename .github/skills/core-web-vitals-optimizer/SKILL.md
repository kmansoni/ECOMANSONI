---
name: core-web-vitals-optimizer
description: "Оптимизация Core Web Vitals: LCP, CLS, INP, FID. Lighthouse, image optimization, lazy loading, критический CSS. Use when: Core Web Vitals, LCP, CLS, INP, производительность страницы, Lighthouse score."
argument-hint: "[метрика: LCP | CLS | INP | all]"
---

# Core Web Vitals Optimizer

Метрики: **LCP** (Largest Contentful Paint ≤2.5s), **CLS** (Cumulative Layout Shift ≤0.1), **INP** (Interaction to Next Paint ≤200ms).

---

## Измерение

```typescript
// src/lib/web-vitals.ts — измерение и репортинг
import { onCLS, onINP, onLCP } from 'web-vitals';

export function reportWebVitals(analyticsEndpoint?: string) {
  const send = (metric: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.table({ name: metric.name, value: metric.value, rating: metric.rating });
    }
    if (analyticsEndpoint) {
      navigator.sendBeacon(analyticsEndpoint, JSON.stringify({
        name: metric.name, value: metric.value, id: metric.id,
        url: location.href, ts: Date.now(),
      }));
    }
  };

  onLCP(send, { reportAllChanges: false });
  onCLS(send, { reportAllChanges: false });
  onINP(send, { reportAllChanges: true });
}
```

---

## LCP — оптимизация

```html
<!-- index.html: preload для LCP image -->
<link rel="preload" as="image" href="/hero-image.webp" fetchpriority="high">

<!-- Шрифты: display=swap чтобы не блокировать рендер -->
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

```typescript
// Vite: разделение критического бандла
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],         // Стабильный чанк
          ui: ['@radix-ui/react-dialog', '...'],  // UI компоненты
          supabase: ['@supabase/supabase-js'],    // Supabase отдельно
        },
      },
    },
    cssCodeSplit: true,  // CSS разбивается по чанкам
  },
});
```

---

## CLS — предотвращение сдвигов

```typescript
// ❌ CLS: изображение без размеров
<img src={avatarUrl} className="rounded-full" />

// ✅ Явные размеры предотвращают layout shift
<img
  src={avatarUrl}
  width={40}
  height={40}
  className="w-10 h-10 rounded-full"
  alt={userName}
/>

// ❌ CLS: элемент появляется и сдвигает контент
{isLoaded && <Alert>Новые сообщения</Alert>}

// ✅ Резервировать место заранее
<div className="min-h-[40px]">
  {isLoaded && <Alert>Новые сообщения</Alert>}
</div>
```

---

## INP — отзывчивость

```typescript
// ❌ Тяжёлый обработчик блокирует UI thread
const handleSearch = (query: string) => {
  setQuery(query);
  const results = searchMessages(allMessages, query); // Синхронный тяжёлый поиск
  setResults(results);
};

// ✅ Debounce + startTransition для плавного UI
import { startTransition, useTransition } from 'react';

const [isPending, startPendingTransition] = useTransition();
const handleSearch = useDebouncedCallback((query: string) => {
  startTransition(() => {
    setResults(searchMessages(allMessages, query));
  });
}, 150);

// ✅ Web Worker для тяжёлых вычислений (поиск, шифрование)
const worker = new Worker('/search-worker.js');
worker.postMessage({ query, messages: allMessages });
worker.onmessage = (e) => setResults(e.data);
```

---

## Checklist по метрикам

| Метрика | Цель | Основные оптимизации |
|---|---|---|
| LCP | ≤ 2.5s | Preload hero image, шрифты без блокировки, code splitting |
| CLS | ≤ 0.1 | Размеры изображений, резервированное место |
| INP | ≤ 200ms | Debounce, startTransition, Web Workers |

- [ ] `web-vitals` библиотека установлена и репортит метрики
- [ ] Изображения имеют явные width/height
- [ ] Tяжёлые операции в startTransition или Web Worker
- [ ] Критические ресурсы с rel="preload"
- [ ] Lighthouse score: Performance ≥ 90 в production
