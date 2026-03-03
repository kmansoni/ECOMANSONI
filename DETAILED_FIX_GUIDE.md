# ДЕТАЛЬНОЕ РУКОВОДСТВО ПО ИСПРАВЛЕНИЮ БАГОВ

## Содержание

1. [XSS уязвимости](#1-xss-уязвимости)
2. [TypeScript проблемы с `any`](#2-typescript-проблемы-с-any)
3. [Пустые catch блоки](#3-пустые-catch-блоки)
4. [Баги в страховых расчётах](#4-баги-в-страховых-расчётах)
5. [Утечки памяти](#5-утечки-памяти)
6. [Рекомендации по качеству кода](#6-рекомендации-по-качеству-кода)

---

## 1. XSS УЯЗВИМОСТИ

### 1.1 SettingsPage.tsx — QR Code

**Файл:** `src/pages/SettingsPage.tsx:1943`

**Проблема:**
```tsx
dangerouslySetInnerHTML={{ __html: mfaEnroll.totp.qr_code }}
```

**Риск:** Если `qr_code` содержит пользовательский ввод или данные из внешнего API, возможен XSS.

**Методология исправления:**
1. Использовать библиотеку `qrcode.react` для рендеринга QR
2. Или валидировать что qr_code содержит только валидный URI scheme

**Исправление:**
```tsx
// Вариант 1: Использовать компонент QRCodeRenderer
import { QRCodeSVG } from 'qrcode.react';

<QRCodeSVG 
  value={mfaEnroll.totp.qr_code} 
  size={200}
  level="M"
/>

// Вариант 2: Если нужен именно img тег, валидировать URI
const isValidDataURI = (str: string): boolean => {
  return /^data:image\/png;base64,/.test(str) || 
         /^https?:\/\//.test(str);
};

// Валидация перед рендерингом
const safeQrCode = isValidDataURI(mfaEnroll.totp.qr_code) 
  ? mfaEnroll.totp.qr_code 
  : '';
  
<img src={safeQrCode} alt="2FA QR Code" />
```

---

### 1.2 Chart.tsx — Динамические стили

**Файл:** `src/components/ui/chart.tsx:70`

**Проблема:**
```tsx
<style
  dangerouslySetInnerHTML={{
    __html: Object.entries(THEMES)
      .map(([theme, prefix]) => `...`)
      .join("")
  }}
/>
```

**Риск:** Средний — данные генерируются локально, но pattern опасный.

**Методология исправления:**
Использовать CSS-in-JS или CSS переменные без dangerouslySetInnerHTML.

**Исправление:**
```tsx
// Вариант 1: Использовать CSS переменные
const ChartStyles = useMemo(() => {
  return Object.entries(THEMES).map(([theme, prefix]) => (
    <style key={theme}>{`
      ${prefix} [data-chart=${id}] {
        ${colorConfig.map(([key, config]) => 
          config.theme?.[theme] 
            ? `--color-${key}: ${config.theme[theme]};`
            : config.color 
              ? `--color-${key}: ${config.color};`
              : ''
        ).join('\n')}
      }
    `}</style>
  ));
}, [id, colorConfig]);

// Вариант 2: Использовать inline styles с CSS variables
<div 
  style={{ 
    '--chart-colors': colorConfig.map(c => c.color).join(', ')
  } as React.CSSProperties}
>
```

---

## 2. TYPESCRIPT ПРОБЛЕМЫ С `any`

### 2.1 Insurance API — Типизация Supabase

**Файл:** `src/lib/insurance/api.ts:25-86`

**Проблема:**
```typescript
const db = supabase as any;  // ❌ Потеря типизации
let query = (supabase as any).from(table)  // ❌ any повсюду
```

**Методология исправления:**
Создать типизированную обёртку над Supabase клиентом.

**Исправление:**
```typescript
// Шаг 1: Создать типы для таблиц
interface InsuranceTables {
  insurance_companies: InsuranceCompany;
  insurance_products: InsuranceProduct;
  insurance_applications: InsuranceApplication;
  insurance_policies: InsurancePolicy;
  insurance_claims: InsuranceClaim;
}

// Шаг 2: Создать типизированный клиент
class TypedSupabaseClient {
  constructor(private client: SupabaseClient) {}

  from<T extends keyof InsuranceTables>(
    table: T
  ): SupabaseQueryBuilder<InsuranceTables[T]> {
    return this.client.from(table);
  }
  
  rpc<T = unknown>(
    fn: string, 
    args: Record<string, unknown>
  ): Promise<{ data: T | null; error: Error | null }> {
    return this.client.rpc(fn, args);
  }
}

// Шаг 3: Использовать
const typedDb = new TypedSupabaseClient(supabase);
const { data, error } = await typedDb
  .from('insurance_companies')
  .select('*')
  .eq('id', companyId)
  .single();
```

---

### 2.2 Chat Hooks — Типизация сообщений

**Файл:** `src/hooks/useChat.tsx:165`

**Проблема:**
```typescript
{ data: any[] | null; error: any }
```

**Исправление:**
```typescript
// Определить типы сообщений
interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  // ... другие поля
}

interface QueryResult<T> {
  data: T[] | null;
  error: Error | null;
}

// Использовать
const result: QueryResult<ChatMessage> = await query;
```

---

## 3. ПУСТЫЕ CATCH БЛОКИ

### 3.1 LiveViewerRoom.tsx

**Файл:** `src/pages/live/LiveViewerRoom.tsx:131`

**Проблема:**
```typescript
} catch { /* игнорируем */ }
```

**Риск:** Потеря ошибок без логирования, невозможность диагностики проблем.

**Исправление:**
```typescript
// Вариант 1: Логирование
} catch (error) {
  console.error('Failed to process chat message:', error);
  // Опционально: отправить в error tracking (Sentry)
  captureException(error);
}

// Вариант 2: С локализованным пользовательским сообщением  
} catch (error) {
  console.error('Chat message processing failed:', error);
  toast.error('Не удалось загрузить сообщение. Попробуйте позже.');
}

// Вариант 3: Для не критических ошибок
} catch (error) {
  // Не блокируем UI, но логируем
  console.warn('Non-critical chat error:', error);
}
```

---

### 3.2 InsuranceApplyPage.tsx

**Файл:** `src/pages/insurance/InsuranceApplyPage.tsx:197`

**Проблема:**
```typescript
try { setFormData(JSON.parse(saved)); return; } catch { /* ignore */ }
```

**Исправление:**
```typescript
try { 
  setFormData(JSON.parse(saved)); 
  return; 
} catch (parseError) {
  // Логируем, но не блокируем - данные могут быть повреждены
  console.warn('Failed to parse saved form data:', parseError);
  // Очищаем повреждённые данные
  localStorage.removeItem('insurance_form_data');
}
```

---

### 3.3 ARFilterEditor.tsx

**Файл:** `src/components/ar/ARFilterEditor.tsx:45`

**Проблема:**
```typescript
} catch { /* no camera */ }
```

**Исправление:**
```typescript
} catch (error) {
  console.warn('Camera access denied or unavailable:', error);
  setCameraActive(false);
  toast.warn('Камера недоступна. Проверьте разрешения браузера.');
}
```

---

## 4. БАГИ В СТРАХОВЫХ РАСЧЁТАХ

### 4.1 OSAGO — Использование среднего значения

**Файл:** `src/lib/insurance/calculations.ts:71`

**Проблема:**
```typescript
const { min: tbMin, max: tbMax } = OSAGO_BASE_RATES[request.vehicle_type];
const tb = (tbMin + tbMax) / 2;  // ❌ Среднее значение некорректно
```

**Риск:** Клиент получает неточную оценку, возможны юридические последствия.

**Методология исправления:**
Вернуть диапазон или использовать минимальное/максимальное значение с объяснением.

**Исправление:**
```typescript
// Вариант 1: Вернуть диапазон
interface OsagoCalculationResult {
  min: number;
  max: number;
  average: number;
  breakdown: {
    base: number;
    kt: number;
    kbm: number;
    kvs: number;
    ko: number;
    km: number;
    ks: number;
    kp: number;
    kn: number;
  };
}

export function calculateOsagoPremium(
  request: OsagoCalculationRequest
): OsagoCalculationResult {
  const { min: tbMin, max: tbMax } = 
    OSAGO_BASE_RATES[request.vehicle_type] || OSAGO_BASE_RATES.car;
  
  // ... расчёт коэффициентов ...
  
  const breakdown = {
    base: tbMin, // Используем минимальное как базу
    kt, kbm, kvs, ko, km, ks, kp, kn
  };
  
  const minPremium = tbMin * kt * kbm * kvs * ko * km * ks * kp * kn;
  const maxPremium = tbMax * kt * kbm * kvs * ko * km * ks * kp * kn;
  
  return {
    min: Math.round(minPremium),
    max: Math.round(maxPremium),
    average: Math.round((minPremium + maxPremium) / 2),
    breakdown
  };
}

// Вариант 2: Использовать минимальное с пометкой "от"
export function calculateOsagoPremium(
  request: OsagoCalculationRequest
): { price: number; note: string } {
  // ... расчёт ...
  return {
    price: Math.round(premium),
    note: 'Минимальная стоимость. Итоговая цена зависит от страховой компании.'
  };
}
```

---

### 4.2 OSAGO — Неизвестный регион

**Файл:** `src/lib/insurance/calculations.ts:74-75`

**Проблема:**
```typescript
const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);
const kt = region?.coefficient ?? 1.0;  // ❌ Неизвестный регион = 1.0
```

**Исправление:**
```typescript
const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);

if (!region) {
  // Вариант 1: Бросить ошибку
  throw new Error(`Неизвестный код региона: ${request.region_code}`);
  
  // Вариант 2: Вернуть с предупреждением (для UI)
  return {
    error: true,
    message: `Регион с кодом ${request.region_code} не найден в справочнике`,
    suggestedRegions: OSAGO_REGIONS.slice(0, 5).map(r => r.code)
  };
  
  // Вариант 3: Использовать значение по умолчанию с логированием
  console.warn(`Unknown region code: ${request.region_code}, using default KT`);
}

const kt = region.coefficient; // Теперь без ?? 1.0
```

---

### 4.3 OSAGO — KBM класс

**Файл:** `src/lib/insurance/calculations.ts:78`

**Проблема:**
```typescript
const kbm = KBM_TABLE[Math.max(0, Math.min(13, request.kbm_class))] ?? 1.0;
```

**Проблема:** KBM может быть 0.5 (для безаварийных водителей), а не только 0-13.

**Исправление:**
```typescript
// Расширить таблицу KBM
const KBM_TABLE: Record<number, number> = {
  0: 3.92,   // M
  1: 2.94,   // 0
  2: 2.25,   // 1
  3: 1.76,   // 2
  4: 1.17,   // 3
  5: 1.00,   // 4 (класс 4 = коэф 1.0)
  6: 0.91,   // 5
  7: 0.83,   // 6
  8: 0.78,   // 7
  9: 0.74,   // 8
  10: 0.70,  // 9
  11: 0.67,  // 10
  12: 0.63,  // 11
  13: 0.58,  // 12
  // Добавить для новых диапазонов
};

// Валидация входящих данных
const safeKbmClass = request.kbm_class ?? 4; // По умолчанию класс 4
const kbm = KBM_TABLE[Math.max(0, Math.min(13, safeKbmClass))];

if (kbm === undefined) {
  throw new Error(`Некорректный класс КБМ: ${request.kbm_class}`);
}
```

---

## 5. УТЕЧКИ ПАМЯТИ

### 5.1 ReelsPage — Таймеры без очистки

**Файл:** `src/pages/ReelsPage.tsx:228-235`

**Проблема:**
```typescript
const timer = setTimeout(() => {
  if (!impressionRecordedForReel.current.get(reelId)) {
    // ... запись impression
  }
}, 2000);
// ❌ Нет cleanup при размонтировании
```

**Исправление:**
```typescript
// Добавить в useEffect return с очисткой
useEffect(() => {
  // ... existing code ...
  
  // Очистка таймеров при размонтировании или изменении
  return () => {
    // Очистить все visibility timers
    visibilityTimers.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    visibilityTimers.current.clear();
    
    // Очистить prefetch таймеры
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
    }
  };
}, [currentIndex, reels]);

// Для индивидуальных таймеров
useEffect(() => {
  const timerId = setTimeout(() => {
    // ... logic
  }, 2000);
  
  return () => clearTimeout(timerId);
}, [reelId]); // Добавить правильные зависимости
```

---

### 5.2 VideoCall — Stream без очистки

**Файл:** `src/hooks/useVideoCall.ts:702`

**Проблема:**
```typescript
const stream = await navigator.mediaDevices.getUserMedia(constraints);
// При ошибке стрим может остаться в системе
```

**Исправление:**
```typescript
let stream: MediaStream | null = null;

try {
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  setLocalStream(stream);
  
  // ... rest of logic
  
} catch (mediaErr) {
  // Обязательно очистить стрим при ошибке
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  // ... handle error
}

// При размонтировании компонента
useEffect(() => {
  return () => {
    // Очистить все медиа треки
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Закрыть peer connection
    if (pcRef.current) {
      pcRef.current.close();
    }
    
    // Очистить каналы
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.close();
    }
    
    // Очистить таймеры
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
  };
}, []);
```

---

### 5.3 Admin KPI Dashboard — setInterval

**Файл:** `src/pages/admin/KpiDashboardPage.tsx:21`

**Проблема:**
```typescript
const interval = setInterval(loadDashboardData, 60000); // Refresh every minute
return () => clearInterval(interval);  // ✅ Есть cleanup, но...
```

**Проблема:** Нет проверки на mounted state, возможны утечки при быстром переходе между страницами.

**Исправление:**
```typescript
const [data, setData] = useState<KpiData | null>(null);
const mountedRef = useRef(true);

useEffect(() => {
  const loadData = async () => {
    if (!mountedRef.current) return; // Проверка mounted
    
    try {
      const result = await fetchKpiData();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (error) {
      if (mountedRef.current) {
        setError(error);
      }
    }
  };

  loadData();
  const interval = setInterval(loadData, 60000);
  
  return () => {
    mountedRef.current = false;
    clearInterval(interval);
  };
}, []);
```

---

## 6. РЕКОМЕНДАЦИИ ПО КАЧЕСТВУ КОДА

### 6.1 eslint-config — Добавить правила

```javascript
// eslint.config.js
module.exports = {
  rules: {
    // Запретить any
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    
    // Обязательный catch с параметрами
    'no-empty': ['error', { allowEmptyCatch: false }],
    
    // Требовать cleanup в useEffect
    'react-hooks/exhaustive-deps': 'warn',
    
    // Запретить dangerouslySetInnerHTML
    'react/no-danger': 'error',
  }
};
```

### 6.2 Шаблон для новых хуков

```typescript
// src/hooks/useExample.ts
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseExampleOptions {
  onSuccess?: (data: Data) => void;
  onError?: (error: Error) => void;
}

export function useExample(id: string, options: UseExampleOptions = {}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Ref для отслеживания mounted state
  const mountedRef = useRef(true);
  
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.getData(id);
      
      if (mountedRef.current) {
        setData(result);
        options.onSuccess?.(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      
      if (mountedRef.current) {
        setError(error);
        options.onError?.(error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [id, options]);
  
  // Автоматическая загрузка
  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id, fetchData]);
  
  return { data, error, loading, refetch: fetchData };
}
```

---

## ЧЕК-ЛИСТ ПРОВЕРКИ

- [ ] Все `dangerouslySetInnerHTML` заменены на безопасные альтернативы
- [ ] Все пустые catch блоки имеют обработку ошибок
- [ ] Все useEffect с таймерами имеют cleanup
- [ ] TypeScript используется правильно, нет `any` без необходимости
- [ ] Страховые расчёты возвращают диапазоны, а не средние значения
- [ ] Добавлены eslint правила для предотвращения проблем

---

*Создано в рамках Code Skeptic анализа*
*Дата: 2026-03-03*
