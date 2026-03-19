# Аудит relayStats.ts — Полный цикл исправления

**Дата:** 2026-03-19  
**Статус:** 🔴 Критические проблемы найдены, готовы к исправлению

---

## 1. НАЙДЕННЫЕ ПРОБЛЕМЫ

### 🔴 КРИТИЧЕСКИЕ (Блокирующие production)

| ID | Проблема | Влияние | Severity |
|----|----|----|----|
| **C1** | Нет логирования TURN relay событий | Невозможно отследить relay fallback | ⚠️ CRITICAL |
| **C2** | Отсутствует отправка метрик | Нет visibility в relay usage rate | ⚠️ CRITICAL |
| **C3** | Incomplete type validation | Может привести к runtime errors | ⚠️ CRITICAL |
| **C4** | Unused utility exports | File incomplete, not fully integrated | ⚠️ CRITICAL |

### 🟠 ВЫСОКИЕ (Должны быть исправлены)

| ID | Проблема | Влияние | Fix |
|----|----|----|---|
| **H1** | Нет JSDoc комментариев на типы | Bad DX, IDE support плохой | Добавить JSDoc |
| **H2** | toEntries() может упасть на null | Edge case error | Добавить null check |
| **H3** | Нет stats aggregation | Нельзя собрать исторические данные | Добавить collector |
| **H4** | extractSelectedIcePair может return null без context | Непонятно почему null | Улучшить диагностику |
| **H5** | Отсутствует bandwidth metrics | Недостаточная информация о качестве | Добавить bytesReceived/bytesSent |

### 🟡 СРЕДНИЕ (Улучшения)

| ID | Проблема | Влияние | Fix |
|----|----|----|---|
| **M1** | normalizeCandidateType может быть case-sensitive | Edge case с разными регистрами | Уже fixed (toLowerCase) |
| **M2** | State string в fallback logic может быть null | Потенциальный null coercion | Улучшить проверку |
| **M3** | No RTCStats bandwidth/quality extraction | Metrics incomplete | Добавить stats extraction |
| **M4** | exports missing from index.ts | Module не полностью интегрирован | Добавить exports |

### 🟢 НИЗКИЕ (Рекомендации)

| ID | Проблема | Влияние | Fix |
|----|----|----|---|
| **L1** | Нет примеров использования | Developers не знают, как использовать | Добавить примеры в comments |
| **L2** | Type StatsLike может быть более стройным | Code clarity | Consider union type |
| **L3** | No performance logging | Slow relay detection? | Add timing |

---

## 2. ROOT CAUSES

### Причина 1: Незавершённая реализация
- `relayStats.ts` имеет только базовые extract функции
- Нет layer для **сбора метрик**, **логирования**, **мониторинга**
- Функции не используются в основном коде (нет grep matches в sfuMediaManager, wsClient, etc.)

### Причина 2: Отсутствие структурированного логирования
- Когда relay fallback происходит, нет logging точек
- Невозможно отследить: когда, почему, как долго до recovery

### Причина 3: Неполная интеграция модуля
- `relayStats` не экспортируется из `calls-v2/index.ts`
- Consumers должны импортировать напрямую из .ts файла (bad practice)
- Не используется в sfuMediaManager или wsClient

### Причина 4: Отсутствие edge case handling
- `toEntries()` не проверяет null/undefined
- `extractSelectedIcePair()` не логирует причину null return
- `normalizeCandidateType()` молчаливо degraded к "unknown"

---

## 3. ПЛАН ИСПРАВЛЕНИЯ

### Phase 1: Улучшить базовый модуль
```
✓ Добавить JSDoc/типизацию
✓ Улучшить error handling
✓ Добавить diagnostic logging
✓ Добавить bandwidth metrics extraction
```

### Phase 2: Добавить stats collection
```
✓ RelayStatsCollector — собирает метрики за period
✓ Отслеживает relay_connect_time_ms
✓ Отслеживает relay_fallback_rate  
✓ Отслеживает bytes_over_relay
```

### Phase 3: Интегрировать в систему
```
✓ Экспортировать из index.ts
✓ Использовать в sfuMediaManager
✓ Логировать в wsClient при fallback
✓ Отправлять метрики на бэкенд
```

### Phase 4: Тестирование
```
✓ Unit tests для stats collection
✓ Integration test с real RTCStatsReport
✓ Edge case tests (null, empty, missing fields)
✓ Performance test (no memory leak)
```

---

## 4. ДЕТАЛЬНЫЕ ИСПРАВЛЕНИЯ

### 4.1 Проблема C1: Нет логирования TURN relay

**Текущий код:**
```typescript
export function isRelaySelected(stats: StatsLike): boolean {
  const selected = extractSelectedIcePair(stats);
  return selected?.localCandidateType === "relay";
}
```

**Проблема:** Просто возвращает boolean, не логирует событие

**Исправление:**
```typescript
export interface RelaySelectionEvent {
  timestamp: number;
  isRelaySelected: boolean;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  pairId: string;
  bytesReceived?: number;
  bytesSent?: number;
}

export function extractRelayMetrics(stats: StatsLike): RelaySelectionEvent | null {
  const selected = extractSelectedIcePair(stats);
  if (!selected) {
    logger.debug("[relayStats] No selected pair found", { stats: Array.from(toEntries(stats)).map(([k]) => k) });
    return null;
  }

  const isRelay = selected.localCandidateType === "relay";
  const entries = toEntries(stats);
  const byId = new Map(entries);
  const pair = byId.get(selected.pairId);

  return {
    timestamp: Date.now(),
    isRelaySelected: isRelay,
    localCandidateType: selected.localCandidateType,
    remoteCandidateType: selected.remoteCandidateType,
    pairId: selected.pairId,
    bytesReceived: (pair as AnyStats)?.bytesReceived,
    bytesSent: (pair as AnyStats)?.bytesSent,
  };
}
```

### 4.2 Проблема C2: Отсутствует stats aggregation

**Новый класс:**
```typescript
export class RelayStatsCollector {
  private samples: RelaySelectionEvent[] = [];
  private readonly maxHistorySize = 100;
  private startTime = Date.now();
  private fallbackCount = 0;

  recordSample(event: RelaySelectionEvent): void {
    if (event.isRelaySelected && !this.didPreviouslySwitchToRelay()) {
      this.fallbackCount++;
      logger.info("[relayStats] RELAY FALLBACK detected", { 
        count: this.fallbackCount, 
        uptime: Date.now() - this.startTime 
      });
    }
    
    this.samples.push(event);
    if (this.samples.length > this.maxHistorySize) {
      this.samples.shift();
    }
  }

  getRelayUsageRate(): number {
    if (this.samples.length === 0) return 0;
    const relayCount = this.samples.filter(s => s.isRelaySelected).length;
    return relayCount / this.samples.length;
  }

  getFallbackCount(): number {
    return this.fallbackCount;
  }

  getMetrics() {
    return {
      relay_usage_rate: this.getRelayUsageRate(),
      relay_fallback_count: this.fallbackCount,
      total_samples: this.samples.length,
      uptime_ms: Date.now() - this.startTime,
      avg_bytes_over_relay: this.getAverageBytesOverRelay(),
    };
  }
}
```

### 4.3 Проблема H2: toEntries() может упасть

**Текущий код:**
```typescript
function toEntries(stats: StatsLike): Array<[string, AnyStats]> {
  if (stats instanceof Map) {
    return Array.from(stats.entries());
  }
  // ... может упасть если stats is null/undefined
}
```

**Исправление:**
```typescript
function toEntries(stats: StatsLike): Array<[string, AnyStats]> {
  if (!stats) {
    logger.warn("[relayStats] toEntries called with null/undefined stats");
    return [];
  }
  
  if (stats instanceof Map) {
    return Array.from(stats.entries());
  }

  if (typeof (stats as { forEach?: unknown }).forEach === "function") {
    // ... exists code
  }

  try {
    return Array.from(stats as Iterable<[string, AnyStats]>);
  } catch (error) {
    logger.error("[relayStats] toEntries failed to iterate stats", error);
    return [];
  }
}
```

### 4.4 Проблема H1: Нет JSDoc

**Исправление:** Добавить JSDoc комментарии ко всем exports:

```typescript
/**
 * ICE Candidate типы согласно RFC 5245
 *
 * - "host" — локальный IP адрес
 * - "srflx" — Server Reflexive (NAT mapped)
 * - "prflx" — Peer Reflexive
 * - "relay" — TURN relay (промежуточный сервер)
 * - "unknown" — других или неизвестный тип
 */
export type IceCandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

/**
 * Результат анализа выбранной ICE пары.
 *
 * @property pairId - Уникальный ID пары кандидатов (transport.selectedCandidatePairId)
 * @property localCandidateType - Тип локального кандидата (обычно нас интересует "relay")
 * @property remoteCandidateType - Тип удалённого кандидата
 * @property localCandidateId - ID локального кандидата (для доп. исследований)
 * @property remoteCandidateId - ID удалённого кандидата
 */
export interface SelectedIcePair {
  pairId: string;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  localCandidateId?: string;
  remoteCandidateId?: string;
}
```

### 4.5 Проблема C4: Не экспортируется из index.ts

**Исправление в calls-v2/index.ts:**
```typescript
export { SfuMediaManager } from './sfuMediaManager';
export { CallKeyExchange } from './callKeyExchange';
export { CallMediaEncryption } from './callMediaEncryption';
export { CallsWsClient } from './wsClient';
export { RekeyStateMachine, DEFAULT_REKEY_CONFIG } from './rekeyStateMachine';
export { EpochGuard } from './epochGuard';
// ✨ NEW:
export { 
  extractSelectedIcePair, 
  isRelaySelected,
  extractRelayMetrics,
  RelayStatsCollector,
} from './relayStats';
export type { 
  SelectedIcePair, 
  IceCandidateType,
  RelaySelectionEvent,
} from './relayStats';
// ... rest of exports
```

---

## 5. IMPLEMENTATION SUMMARY

### Files to modify:
1. ✅ `src/calls-v2/relayStats.ts` — Основной файл, добавить все функции
2. ✅ `src/calls-v2/index.ts` — Добавить exports
3. ✅ `src/test/calls-v2-relay-candidate.test.ts` — Уже хороший, добавить collector tests

### New utilities needed:
- `RelayStatsCollector` — сбор и агрегация метрик
- `extractRelayMetrics()` — полная информация о relay state
- Better error handling & logging в всех функциях

### Compatibility:
- ✅ Backward compatible (new exports, old functions still work)
- ✅ No breaking changes
- ✅ Works with existing tests

---

## 6. AUDIT CHECKLIST

- [ ] Все функции имеют JSDoc
- [ ] Все edge cases обработаны (null, undefined, empty arrays)
- [ ] Логирование добавлено на критические точки
- [ ] Метрики собираются и аггрегируются
- [ ] Exports полные в index.ts
- [ ] Tests покрывают новый функционал
- [ ] Performance tests pass (no memory leak)
- [ ] Integration test с relayStats в sfuMediaManager
- [ ] Deploy готов

---

## 7. METRICS THAT WILL BE TRACKED

После исправлений, система будет отслеживать:

```typescript
{
  relay_usage_rate: 0.75,           // 75% of samples used relay
  relay_fallback_count: 2,           // fallbacks triggered
  total_samples: 100,                // samples collected
  uptime_ms: 3600000,                // 1 hour
  avg_bytes_over_relay: 2048000,    // ~2MB
}
```

Это позволит:
- 📊 Отследить relay fallback rate в production
- 📈 Оптимизировать TURN provisioning
- 🔍 Диагностировать connectivity issues
- 📱 Измерить impact технических улучшений

---

**Status:** Ready for implementation
**Time Estimate:** 30-45 minutes
