# Mansoni Feed v1.1 — Engineering Package

Полный инженерный пакет для системы ленты Mansoni. Не Instagram-клон, а Unified Attention System для супер-мессенджера.

## Структура

```
docs/feed/
├── specs/                              # JSON-спецификации
│   ├── feed_score_spec.json            # Весовая модель скоринга (10 компонентов)
│   ├── feed_policy_budget_matrix.json  # Бюджетные окна и caps
│   ├── feed_negative_feedback_matrix.json # Матрица негативных сигналов
│   ├── feed_freshness_registry.json    # Кривые свежести per content type
│   └── feed_degradation_matrix.json    # Режимы отказоустойчивости
│
├── db/                                 # SQL миграции
│   ├── 001_feed_core_tables.sql        # Core таблицы
│   ├── 002_feed_indexes.sql            # Индексы
│   ├── 003_feed_policy_seed.sql        # Начальная policy
│   └── 004_feed_constraints.sql        # CHECK constraints
│
├── redis/
│   └── feed_redis_key_spec.md          # Redis key patterns + TTL + payloads
│
└── README.md                           # Этот файл

src/types/feed/
├── feed_types.ts                       # Базовые доменные типы
├── feed_policy_types.ts                # Policy/budget типы
├── feed_event_schema.ts                # Event контракты
├── feed_cursor_spec.ts                 # Курсор пагинации
├── feed_decision_log_schema.ts         # Decision log (backend-only)
└── index.ts                            # Barrel export
```

## Scoring Formula

```
BaseScore =
  0.24 × Relationship + 0.17 × Relevance + 0.13 × Freshness +
  0.12 × Quality + 0.10 × Trust + 0.08 × Conversation +
  0.05 × Utility + 0.04 × Diversity + 0.03 × LocalContext +
  0.04 × Fairness

FinalScore = BaseScore × TrustMod × AbuseMod × FatigueMod × SessionMod × PolicyMod
```

## Pipeline

```
Stage 0 — Eligibility Gate  (blocked/muted/policy-violating → remove)
Stage 1 — Candidate Retrieval (8 pools → ~1000 candidates)
Stage 2 — Lightweight Rank   (cheap features → ~300 candidates)
Stage 3 — Heavy Rank         (full scoring → ordered list)
Stage 4 — Policy Re-rank     (budgets, caps, diversity, fatigue)
Stage 5 — Delivery           (hydration, cursor, prefetch hints)
```

## Non-Functional Requirements

| Metric | Target |
|--------|--------|
| Feed API P95 | < 220 ms |
| Candidate Service P95 | < 70 ms |
| Rank Service P95 | < 50 ms |
| Policy Re-rank P95 | < 20 ms |
| Redis hot path total | < 25 ms |
| Zero duplicate entities per page | ✓ |

## Rollout Plan

| Phase | Scope |
|-------|-------|
| V1 | follow_recent, trust gates, seen-set, batch events, cached pages |
| V2 | content embeddings, QAE model, topic similarity, experiment framework |
| V3 | unified graph, session intent, creator fairness, explainability UI |
