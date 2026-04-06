---
name: circuit-breaker
description: "Circuit Breaker паттерн: предотвращение каскадных сбоев при недоступности внешних сервисов. States: CLOSED → OPEN → HALF_OPEN. Use when: внешние API, Supabase недоступен, предотвратить каскадные ошибки, resilience."
argument-hint: "[сервис или модуль для защиты]"
---

# Circuit Breaker — Прерыватель каскадных сбоев

Circuit Breaker останавливает запросы к недоступному сервису, давая ему время восстановиться, вместо того чтобы накапливать ошибки и таймауты.

---

## Реализация

```typescript
type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CBConfig {
  failureThreshold: number;   // Сколько ошибок до открытия (default: 5)
  recoveryTimeout: number;    // Мс до попытки восстановления (default: 30000)
  successThreshold: number;   // Успехов в HALF_OPEN для закрытия (default: 2)
}

class CircuitBreaker {
  private state: CBState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly name: string,
    private readonly config: CBConfig = {
      failureThreshold: 5,
      recoveryTimeout: 30_000,
      successThreshold: 2,
    }
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() { return this.state; }
  reset() { this.state = 'CLOSED'; this.failures = 0; }
}
```

---

## Использование в проекте

```typescript
// src/lib/circuit-breakers.ts
const supabaseBreaker = new CircuitBreaker('supabase', {
  failureThreshold: 3,
  recoveryTimeout: 15_000,
  successThreshold: 1,
});

const anthropicBreaker = new CircuitBreaker('anthropic', {
  failureThreshold: 2,
  recoveryTimeout: 60_000,
  successThreshold: 1,
});

// Использование в хуке
async function fetchMessages(channelId: string) {
  try {
    return await supabaseBreaker.call(() =>
      supabase.from('messages').select('*').eq('channel_id', channelId).limit(50)
    );
  } catch (err) {
    if (err.message.includes('is OPEN')) {
      // Показать кэшированные данные или offline state
      return getCachedMessages(channelId);
    }
    throw err;
  }
}
```

---

## Состояния и переходы

```
CLOSED (нормальная работа)
  │ failures >= threshold
  ▼
OPEN (блокировка) ──── recoveryTimeout истёк ──→ HALF_OPEN
                                                    │successes >= threshold
                                                    ▼
                                                  CLOSED
                         при любой ошибке ──────→ OPEN
```

---

## Чеклист

- [ ] Circuit breaker для каждого внешнего сервиса (Supabase, Anthropic, FCM)
- [ ] Fallback при OPEN состоянии (кэш, graceful degradation)
- [ ] Метрики состояния в мониторинге
- [ ] Ручной сброс через admin команду
- [ ] Логирование переходов между состояниями
