---
name: bundle-analyzer
description: "Анализ бандла: rollup-plugin-visualizer, tree-shaking, code splitting, chunk optimization. Use when: медленная загрузка, большой бандл, оптимизация First Load JS."
argument-hint: "[цель: analyze|optimize|split]"
user-invocable: true
---

# Bundle Analyzer — Анализ и оптимизация бандла

Скилл для анализа размера бандла и его оптимизации. Цель: First Load JS < 200KB, Time to Interactive < 3s.

## Когда использовать

- First Load JS > 200KB
- Новая тяжёлая зависимость (карты, графики, редактор)
- Перед релизом — проверка что ничего не раздулось
- Жалобы на медленную загрузку

## Протокол анализа

1. **Сгенерируй отчёт** — `rollup-plugin-visualizer` в Vite
2. **Найди крупнейшие chunks** — что занимает больше 50KB?
3. **Проверь дубли** — одна библиотека в нескольких chunks?
4. **Проверь tree-shaking** — импортируешь всю библиотеку ради одной функции?
5. **Code splitting** — lazy routes, dynamic imports для тяжёлых компонентов
6. **Оптимизируй** — замены, lazy loading, chunk splitting
7. **Измерь результат** — сравни до/после

## Настройка визуализатора

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
})
```

## Lazy routes

```typescript
import { lazy, Suspense } from 'react'

const ShopPage = lazy(() => import('./pages/ShopPage'))
const CRMPage = lazy(() => import('./pages/CRMPage'))
const InsurancePage = lazy(() => import('./pages/insurance/InsurancePage'))

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/crm/*" element={<CRMPage />} />
        <Route path="/insurance/*" element={<InsurancePage />} />
      </Routes>
    </Suspense>
  )
}
```

## Dynamic import тяжёлых компонентов

```typescript
// Карта загружается только когда нужна
const MapView = lazy(() => import('./components/MapView'))

function TaxiPage() {
  const [showMap, setShowMap] = useState(false)
  return (
    <div>
      <button onClick={() => setShowMap(true)}>Показать карту</button>
      {showMap && (
        <Suspense fallback={<MapSkeleton />}>
          <MapView />
        </Suspense>
      )}
    </div>
  )
}
```

## Типичные оптимизации

| Проблема | Решение | Экономия |
|---|---|---|
| `import _ from 'lodash'` | `import debounce from 'lodash/debounce'` | ~70KB |
| `import * as Icons from 'lucide-react'` | `import { Search } from 'lucide-react'` | ~200KB |
| `moment.js` | `date-fns` или `dayjs` | ~60KB |
| Все routes в одном chunk | `lazy()` + code splitting | 50-80% |
| Полифиллы для IE | `browserslist` target modern | ~30KB |

## Бюджет бандла

| Метрика | Бюджет |
|---|---|
| Initial JS (gzip) | < 200KB |
| Largest chunk | < 100KB |
| Total assets | < 2MB |
| Vendor chunk | < 150KB |

## Чеклист

- [ ] `rollup-plugin-visualizer` настроен
- [ ] Все routes — lazy loaded
- [ ] Нет barrel imports (`import * from`)
- [ ] Тяжёлые компоненты — dynamic import
- [ ] ManualChunks для vendor-библиотек
- [ ] Нет дублирования библиотек в разных chunks
- [ ] Initial JS < 200KB gzip

## Anti-patterns

- **Barrel import** — `import { Button } from '@/components'` тянет всё дерево
- **Синхронный import тяжёлого** — карта, редактор, графики в main bundle
- **Нет manualChunks** — React попадает в каждый chunk
- **Полифиллы для мёртвых браузеров** — поддержка IE в 2024+
- **console.log в production** — не влияет на размер, но тормозит runtime
- **Unused dependencies** — `npm ls --depth=0` vs реальные imports
