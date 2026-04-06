# Threat Modeling — Моделирование угроз

## Методология STRIDE

| Угроза | Описание | Пример |
|---|---|---|
| **S**poofing | Подмена идентичности | Подделка JWT, session hijacking |
| **T**ampering | Изменение данных | Модификация запроса, SQL injection |
| **R**epudiation | Отрицание действий | Удаление логов, анонимные действия |
| **I**nformation Disclosure | Утечка данных | Verbose errors, RLS bypass, PII в логах |
| **D**enial of Service | Отказ в обслуживании | DDoS, resource exhaustion, ReDoS |
| **E**levation of Privilege | Повышение привилегий | Admin bypass, horizontal escalation |

## Процесс для каждого модуля

### 1. Data Flow Diagram
```
[User] → [React App] → [Supabase Client] → [PostgREST/RLS] → [PostgreSQL]
                ↓                    ↓
          [Edge Functions]    [Realtime]
                ↓                    ↓
          [External APIs]    [WebSocket]
```

### 2. Trust Boundaries
- Browser ↔ Supabase API (JWT validation)
- Edge Function ↔ Database (service role)
- Client ↔ Realtime (channel auth)
- App ↔ External API (API key)

### 3. Attack Surface per Module

#### Мессенджер
| Вектор | STRIDE | Risk | Mitigation |
|---|---|---|---|
| Чтение чужих сообщений | I | Critical | RLS: auth.uid() = sender OR receiver |
| Подделка отправителя | S | High | server-side user_id from JWT |
| XSS в сообщении | T | High | DOMPurify |
| Спам-бот | D | Medium | Rate limiting |

#### Маркетплейс
| Вектор | STRIDE | Risk | Mitigation |
|---|---|---|---|
| Изменение цены | T | Critical | Server-side price calculation |
| IDOR: чужой заказ | I | Critical | RLS |
| Fake reviews | S | Medium | Verified purchase check |
| Stock manipulation | T | High | Atomic decrement |

#### Звонки
| Вектор | STRIDE | Risk | Mitigation |
|---|---|---|---|
| Перехват медиа | I | Critical | E2EE (SFrame) |
| MITM signaling | S,T | Critical | TLS + JWT |
| Caller ID spoofing | S | High | Server-verified auth |
| DoS flooding | D | High | Rate limit |

### 4. Risk Scoring
```
Risk = Impact (1-5) × Likelihood (1-5)

Impact:
5 — Data breach, финансовые потери
4 — Unauthorized access, PII exposure
3 — Service degradation, data corruption
2 — Minor data leak, UX issue
1 — Cosmetic, no data impact

Likelihood:
5 — Trivial to exploit, no auth needed
4 — Easy with basic tools
3 — Requires specific knowledge
2 — Requires insider access
1 — Theoretical, complex chain
```

### 5. Mitigation Priority
- Risk ≥ 20: BLOCK release, fix immediately
- Risk 10-19: Fix before next release
- Risk 5-9: Plan fix in backlog
- Risk < 5: Accept or monitor
