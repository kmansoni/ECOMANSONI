---
name: advanced-debugger
description: "Продвинутый дебаггер: React profiling, Web Vitals, Supabase RLS trace, WebRTC debugging, memory leaks, bundle analysis, Capacitor native debugging. Use when: тормозит, ре-рендеры, утечка памяти, RLS не работает, запрос медленный, EXPLAIN ANALYZE, WebRTC не подключается, ICE failed, bundle большой, LCP медленный, CLS прыгает, Capacitor баг, native bridge, Logcat."
argument-hint: "[тип проблемы: render | vitals | rls | webrtc | memory | bundle | capacitor]"
user-invocable: true
---

# Advanced Debugger — Продвинутая диагностика

Систематическая диагностика сложных проблем производительности, сети, рендеринга, БД и нативной платформы. Каждая проблема — чёткий протокол: симптомы → метрики → root cause → fix → verify.

## Принцип

> Не «посмотри console.log». Профессиональная диагностика с конкретными метриками, flamechart-ами, query plan-ами и network waterfall-ами. Каждый баг имеет числовое доказательство.

---

## 1. React Profiling: ре-рендеры

### 1.1. Диагностика избыточных ре-рендеров

```
Протокол:
1. React DevTools → Profiler → Record interaction
2. Highlight updates (настройки DevTools → Components → "Highlight updates")
3. Найти компоненты с > 3 ре-рендеров за одно действие
4. Для каждого: WHY did this render? (props changed? state changed? context?)
```

### 1.2. Типичные причины ре-рендеров

| Причина | Как обнаружить | Решение |
|---------|---------------|---------|
| Нестабильная ref объекта/массива в props | Profiler → "Why did?" → props changed | `useMemo` / `useCallback` |
| Zustand store без selectors | Каждое изменение store → ре-рендер всех подписчиков | `useStore(s => s.field)` |
| Context provider value без memo | Все потребители ре-рендерятся | `useMemo` на value |
| Inline object/array в JSX | `style={{...}}` или `data={[...]}` | Вынести в константу или useMemo |
| Parent re-render | Все children ре-рендерятся | `React.memo` на дочерних |
| TanStack Query refetch | staleTime = 0 (default) | Установить `staleTime: 30_000` |

### 1.3. Чеклист оптимизации рендеринга

```
☐ React.memo на КАЖДОМ элементе списка (MessageBubble, PostCard, ProductCard)
☐ useCallback на ВСЕХ handler-ах, передаваемых в дочерние компоненты
☐ useMemo на тяжёлых вычислениях (sort, filter, map) и объектах-props
☐ Zustand: используй атомарные selectors (s => s.field), не (s => s)
☐ Context: разделить большой контекст на несколько маленьких
☐ TanStack Query: staleTime ≥ 30s для неволатильных данных
☐ Виртуализация: > 50 элементов → @tanstack/react-virtual
☐ Проверить: нет ли useEffect, который вызывает setState, который вызывает ре-рендер
```

### 1.4. React.memo — аудит

```typescript
// Скрипт для поиска компонентов без memo в списках:
// 1. Найти все .map() в JSX
// 2. Проверить: обёрнут ли рендеримый компонент в React.memo
// 3. Если нет и компонент > 20 строк → рекомендовать memo

// Паттерн:
const MemoizedItem = React.memo(function ItemComponent({ data }: { data: Item }) {
  return <div>{/* ... */}</div>;
});
// В списке: items.map(item => <MemoizedItem key={item.id} data={item} />)
```

---

## 2. Web Vitals: FCP, LCP, CLS, INP

### 2.1. Метрики и целевые значения

| Метрика | Good | Needs Improvement | Poor | Что измеряет |
|---------|------|-------------------|------|-------------|
| **FCP** | ≤ 1.8s | 1.8–3.0s | > 3.0s | Первый видимый контент |
| **LCP** | ≤ 2.5s | 2.5–4.0s | > 4.0s | Самый большой элемент |
| **CLS** | ≤ 0.1 | 0.1–0.25 | > 0.25 | Сдвиги layout-а |
| **INP** | ≤ 200ms | 200–500ms | > 500ms | Задержка интерактивности |
| **TTFB** | ≤ 800ms | 800–1800ms | > 1800ms | Time to first byte |

### 2.2. Диагностика LCP

```
Протокол:
1. Chrome DevTools → Performance → Record page load
2. Найти LCP element (зелёная метка в timeline)
3. Определить тип LCP: image / text / video

Если LCP = image:
  → Preload: <link rel="preload" as="image" href="..." />
  → Формат: WebP/AVIF вместо PNG/JPEG
  → Размер: не больше viewport (srcset + sizes)
  → CDN: Supabase Storage с transform

Если LCP = text:
  → Font loading: font-display: swap
  → Preload font: <link rel="preload" as="font" />
  → Inline critical CSS

Если LCP = API data:
  → SSR / pre-fetch
  → Skeleton вместо пустого контейнера
  → Кэширование (staleTime, localStorage)
```

### 2.3. Диагностика CLS

```
Протокол:
1. Chrome DevTools → Performance → Layout Shift (розовые блоки)
2. Каждый сдвиг: какой элемент двинулся, на сколько px, почему

Типичные причины:
  → Image без width/height → добавить aspect-ratio или explicit dimensions
  → Font swap (FOUT) → font-display: optional, preload
  → Dynamic content insertion (ad, banner) → reserve space
  → Async loaded content → placeholder с фиксированной высотой
  → Skeleton → real content размер не совпадает → выровнять
```

### 2.4. Диагностика INP

```
Протокол:
1. Chrome DevTools → Performance → Interactions (синие блоки)
2. Для каждого interaction: processing time + presentation delay
3. > 200ms → профилировать handler

Оптимизации:
  → Тяжёлые вычисления в handler → requestIdleCallback / Web Worker
  → Длинный DOM update → виртуализация, batch updates
  → Синхронный localStorage → async (IndexedDB)
  → Debounce input handlers: 150ms для поиска, 300ms для resize
```

---

## 3. Supabase Debugging: RLS + Query Plan

### 3.1. RLS policy trace

```sql
-- Диагностика: почему RLS не пускает?

-- 1. Проверить что RLS включён:
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- 2. Посмотреть все политики таблицы:
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE tablename = '{table}';

-- 3. Проверить от имени конкретного пользователя:
-- В Edge Function (service_role):
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "user-uuid-here"}';
SELECT * FROM {table} LIMIT 10;
RESET role;

-- 4. Типичные ошибки:
-- ❌ EXISTS подзапрос без индекса → full table scan на каждую строку
-- ❌ auth.uid() IS NULL (пользователь не авторизован)
-- ❌ WITH CHECK в INSERT не совпадает → row violates policy
-- ❌ SECURITY DEFINER функция в RLS без проверки auth внутри
```

### 3.2. Query Plan анализ

```sql
-- Диагностика медленных запросов:

-- 1. EXPLAIN ANALYZE (ВСЕГДА с ANALYZE — показывает реальное время):
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM messages
WHERE channel_id = 'xxx'
ORDER BY sort_key DESC
LIMIT 50;

-- 2. Что искать в плане:
-- Seq Scan → нужен индекс
-- Nested Loop + Seq Scan → нужен индекс на FK
-- Sort → если > 1000 rows, нужен индекс с правильным ORDER
-- Hash Join → OK для больших таблиц
-- Bitmap Index Scan → OK, но следить за recheck
-- actual time > 100ms → проблема

-- 3. Создание индекса:
-- Выбрать поля WHERE + ORDER BY + LIMIT
EXPLAIN (ANALYZE) SELECT ...;
CREATE INDEX CONCURRENTLY idx_name ON table(field1, field2);
EXPLAIN (ANALYZE) SELECT ...; -- сравнить

-- 4. Суpabase Dashboard → SQL Editor → "Explain" кнопка
```

### 3.3. Realtime debugging

```
Протокол:
1. Supabase Dashboard → Realtime → Inspector
2. Проверить channel subscriptions (активные)
3. Проверить RLS (Realtime уважает RLS!)
4. Network tab → WS frame inspection

Типичные проблемы:
  → Нет events: RLS блокирует → проверить SELECT policy
  → Too many channels: > 200 concurrent → throttle connections
  → Message too large: > 256KB payload → уменьшить select
  → Heartbeat timeout: сеть нестабильна → проверить reconnect logic
```

---

## 4. WebRTC Debugging

### 4.1. ICE / TURN / STUN

```
Протокол:
1. chrome://webrtc-internals/ → найти PeerConnection
2. ICE candidates tab → проверить gathered candidates

Типичные проблемы:
  → "ICE failed" → TURN server недоступен или credentials expired
  → Только host candidates → firewall блокирует STUN
  → No relay candidates → TURN не настроен
  → ICE disconnected → сеть нестабильна → нужен ICE restart

Диагностика:
  → Проверить TURN connectivity: 
    curl -v turn:server:3478
    или web-based TURN tester (Trickle ICE)
  → Проверить credentials: lifetime, username format
  → Проверить firewall: UDP 3478, TCP 443 (TURNS)
```

### 4.2. Codec negotiation

```
Протокол:
1. webrtc-internals → Stats → outbound-rtp / inbound-rtp
2. Проверить: какой кодек negotiated (VP8, VP9, H.264, AV1)
3. Проверить: resolution и framerate

Оптимизации:
  → VP8: универсальный, низкая CPU нагрузка
  → VP9: лучшее сжатие, выше CPU → для экономии bandwidth
  → H.264: hardware acceleration на мобильных
  → Opus: единственный аудио-кодек для WebRTC, настраивать bitrate

  → Degradation preference:
    sender.setParameters({ degradationPreference: 'maintain-framerate' }) // для видеозвонков
    sender.setParameters({ degradationPreference: 'maintain-resolution' }) // для screen sharing
```

### 4.3. Quality metrics

```
Ключевые метрики (из getStats()):
  → jitter: > 30ms = проблема качества
  → packetsLost / packetsSent * 100: > 5% = плохое качество
  → roundTripTime: > 300ms = заметная задержка
  → framesPerSecond: < 15 = деградация видео
  → bytesReceived increase rate = effective bitrate

Alerting thresholds:
  🟢 Good:   jitter < 15ms, loss < 1%, RTT < 150ms
  🟡 Fair:   jitter < 30ms, loss < 3%, RTT < 300ms
  🔴 Poor:   jitter > 30ms, loss > 5%, RTT > 500ms
  💀 Failed: no packets for 5s → ICE restart
```

---

## 5. Memory Leak Detection

### 5.1. Паттерны утечек в React

```typescript
// Чеклист:
// ☐ useEffect с subscription без cleanup
// ☐ setInterval/setTimeout без clearInterval/clearTimeout
// ☐ addEventListener без removeEventListener
// ☐ Supabase channel без unsubscribe
// ☐ WebSocket без close
// ☐ AbortController не abort-ится
// ☐ Замыкание удерживает ссылку на DOM node
// ☐ Глобальный store растёт без cleanup (array.push без trim)
// ☐ IndexedDB/localStorage хранит устаревшие данные
// ☐ TanStack Query кэш: gcTime слишком большой

// Диагностика:
// 1. Chrome DevTools → Memory → Heap Snapshot
// 2. Перейти на страницу → уйти → Heap Snapshot
// 3. Comparison view: retained objects с предыдущей страницы
// 4. Искать: Detached DOM trees, EventListener count growth

// Fix pattern:
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  
  const channel = supabase.channel('name').subscribe();
  const timer = setInterval(tick, 1000);
  
  return () => {
    controller.abort();
    channel.unsubscribe();
    clearInterval(timer);
  };
}, []);
```

### 5.2. Store memory growth

```typescript
// Zustand: лимитировать history
// ✅ Хранить max N элементов
set((s) => ({
  messages: [...s.messages, newMsg].slice(-500), // keep last 500
}));

// ✅ TanStack Query: разумный gcTime
useQuery({
  queryKey: [...],
  gcTime: 5 * 60 * 1000, // 5 минут (default), уменьшить для heavy data
});
```

---

## 6. Network & Bundle Analysis

### 6.1. API waterfall

```
Протокол:
1. Chrome DevTools → Network → Disable cache → Reload
2. Отсортировать по Waterfall (timeline)
3. Найти: последовательные запросы (waterfall chain)
4. Найти: дублирующиеся запросы (same URL, different time)
5. Найти: большие responses (> 100KB)

Оптимизации:
  → Sequential → Parallel: Promise.all / useQueries
  → Duplicate → Deduplicate: TanStack Query кэширование
  → Large response → Pagination (.range()) + select конкретных полей
  → Slow TTFB → Индекс в БД (EXPLAIN ANALYZE)
```

### 6.2. Bundle size analysis

```bash
# Визуализация bundle:
npx vite-bundle-visualizer

# Целевые размеры:
# Total JS (gzipped): < 200KB для mobile
# Initial load JS: < 100KB (critical path)
# Largest chunk: < 50KB
# Vendor chunk: separate, cached

# Типичные проблемы:
# → Весь lodash вместо lodash-es/specific import
# → moment.js (300KB) → date-fns или dayjs (2KB)
# → Полный @supabase/supabase-js: tree-shaking
# → Неиспользуемые компоненты из ui/ → lazy import
# → Source maps в production → отключить или separate
```

### 6.3. Chunk splitting

```typescript
// vite.config.ts → build.rollupOptions.output.manualChunks
// Стратегия:
// 1. vendor-react (react, react-dom) — кэшируется надолго
// 2. vendor-ui (radix, shadcn) — средне обновляется
// 3. vendor-query (tanstack) — редко обновляется
// 4. По модулям: chat, taxi, marketplace — lazy load по route
// 5. Heavy libs: maps, media, charts — отдельные chunks, lazy
```

---

## 7. Capacitor / Native Debugging

### 7.1. Android Logcat

```bash
# Подключить устройство или эмулятор
adb logcat -s "Capacitor" "Capacitor/Console" "WebView" "chromium"

# Фильтры:
# Capacitor — plugin calls, bridge messages
# Capacitor/Console — console.log из WebView
# WebView — loading, errors, navigation
# chromium — JS errors, network errors
```

### 7.2. Типичные проблемы Capacitor

```
| Проблема | Диагностика | Решение |
|----------|-------------|---------|
| Plugin not available | Capacitor.isPluginAvailable() | Проверить install, sync |
| White screen on start | Logcat → WebView error | Проверить index.html path |
| Keyboard overlay | resize event + viewport | adjustResize в AndroidManifest |
| Deep link не работает | intent-filter в AndroidManifest | Проверить scheme + host |
| Background task killed | Android: max 10 min | Foreground service для calls |
| Camera permission denied | Permissions.request() | Повторный запрос + rationale |
| Status bar overlay | StatusBar plugin | setOverlaysWebView(false) |
| Safe area ignored | CSS env() | Проверить viewport-fit=cover |
```

### 7.3. Native bridge debugging

```typescript
// Capacitor bridge calls: отслеживание
// 1. Логировать все plugin вызовы:
import { Capacitor } from '@capacitor/core';

// 2. Проверить доступность:
if (Capacitor.isNativePlatform()) {
  // native code path
} else {
  // web fallback
}

// 3. Error handling для native calls:
try {
  const result = await Camera.getPhoto({ /* ... */ });
} catch (err) {
  if ((err as Error).message.includes('User cancelled')) {
    // Пользователь отменил — не ошибка
    return;
  }
  // Реальная ошибка
  toast.error('Не удалось открыть камеру');
  logger.error('Camera plugin error', err);
}
```

---

## 8. Logging Strategy

### 8.1. Structured logging

```typescript
// Уровни:
// ERROR — ошибки, которые влияют на пользователя (отправить в Sentry)
// WARN  — подозрительное поведение, но приложение работает
// INFO  — важные бизнес-события (login, message sent, call started)
// DEBUG — детали для дебага (render count, cache hit, query time)

// Формат:
logger.error('[Chat] Failed to send message', { 
  channelId, 
  messageLength: content.length,
  error: err.message,
  // НИКОГДА: content (приватность!), token, password
});

// Correlation ID: связать frontend → Edge Function → DB
const correlationId = crypto.randomUUID();
// Передать в header: X-Correlation-ID
// Логировать с тем же ID на всех уровнях
```

---

## 9. Source Map Debugging

```typescript
// Production error → source location:
// 1. Sentry/error tracker → source maps uploaded at build
// 2. Manual: Supabase → Edge Function logs → stack trace

// vite.config.ts:
build: {
  sourcemap: 'hidden', // генерировать, но не отдавать клиенту
  // 'hidden' → .map файлы создаются, но не referenced в JS
  // Upload .map в Sentry при деплое
}
```

---

## 10. Workflow

### Фаза 1: Воспроизведение
1. Определить точный сценарий воспроизведения
2. Определить тип проблемы (render / network / native / DB)
3. Открыть соответствующие DevTools

### Фаза 2: Измерение
1. Собрать метрики ДО исправления (baseline)
2. Записать конкретные числа: ms, bytes, count renders
3. Определить target (целевую метрику)

### Фаза 3: Root cause
1. Использовать протокол из соответствующей секции выше
2. Найти КОНКРЕТНУЮ строку / запрос / компонент
3. Доказать причинно-следственную связь

### Фаза 4: Fix
1. Минимально инвазивное исправление
2. Не ломать существующую функциональность

### Фаза 5: Verify
1. Повторить измерение ПОСЛЕ исправления
2. Сравнить с baseline: разница > 20% = значимо
3. Проверить: нет ли побочных эффектов

---

## Маршрутизация в оркестраторе

**Триггеры**: тормозит, медленно, ре-рендер, re-render, утечка памяти, memory leak, RLS не работает, запрос медленный, EXPLAIN, query plan, WebRTC не подключается, ICE failed, bundle большой, LCP, CLS, INP, FCP, Web Vitals, профилирование, profiling, Capacitor баг, native, Logcat, source map, debug, дебаг, отладка, network waterfall, chunk size

**Агенты**:
- `debug` — основной агент-исполнитель
- `review` — при аудите производительности
- `codesmith` — при реализации fix-ов
