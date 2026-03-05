# ARIA AI Engine v2.0 — Полная Архитектурная Документация

> **Версия:** 2.0.0 | **Статус:** Production-Ready | **Дата:** 2026-03-05

---

## Обзор

ARIA (Advanced Reasoning & Intelligence Assistant) — полностью self-hosted AI-ассистент
без сторонних API-зависимостей. Обучается на данных пользователей, контенте платформы
и свободном интернете (через этичный web-краулер).

---

## Полная архитектурная схема

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           ANIKA AI ENGINE v2.0                                     │
│                                                                                    │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │                        FastAPI Server (main.py)                             │   │
│  │  POST /v1/chat/completions  POST /v1/feedback   POST /v1/ingest            │   │
│  │  POST /v1/crawl             POST /v1/train/trigger                          │   │
│  │  POST /v1/safety/check      POST /v1/evaluate   POST /v1/distill           │   │
│  │  GET  /v1/learning/stats    GET  /metrics        GET  /health               │   │
│  └───────────────────────────────────┬────────────────────────────────────────┘   │
│                                       │                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │                         INFERENCE PIPELINE                                │     │
│  │                                                                            │     │
│  │  Request → SafetyClassifier(L0-L3) → InferenceCache → ARIAGenerate       │     │
│  │                                                          │                 │     │
│  │              ┌───────────────────────────────────────────┤                 │     │
│  │              │                                           │                 │     │
│  │         UserProfile                              BPETokenizer              │     │
│  │    (interests, style,                         (extensible vocab)           │     │
│  │     expertise, lang)                                     │                 │     │
│  │              │                                           ▼                 │     │
│  │              ▼                                GPTLanguageModel             │     │
│  │     PersonalizedPrompt                    (Transformer decoder)           │     │
│  │              │                                           │                 │     │
│  │              └────────────────────────┐                 ▼                 │     │
│  │                                       │            RAGPipeline            │     │
│  │                                  ReActAgent      (VectorStore +           │     │
│  │                              (Reason→Act→Obs)     Embeddings)             │     │
│  │                                       │                 │                 │     │
│  │                                  ToolRegistry     MemoryManager           │     │
│  │                     (web_search, calc, code_exec)  (Working +             │     │
│  │                                                     Episodic +            │     │
│  │                                                     Semantic)             │     │
│  │                                                          │                 │     │
│  │                              Response → SafetyClassifier(output) →  User │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │                         LEARNING PIPELINE                                 │     │
│  │                                                                            │     │
│  │  User Feedback (POST /v1/feedback)                                        │     │
│  │       │  SHA-256 anon + consent gate + rate-limit                         │     │
│  │       ▼                                                                    │     │
│  │  FeedbackStore (SQLite WAL)                                               │     │
│  │       │                                                                    │     │
│  │       ├──► PreferencePairs → RewardModel (Bradley-Terry BCE)              │     │
│  │       │                      (torch MLP / sklearn LR / heuristic)        │     │
│  │       │                                                                    │     │
│  │       └──► TrainingTexts → DataPipeline → ContinualTrainer               │     │
│  │                            (NFC, dedup,    (LoRA adapters,                │     │
│  │                            SimHash,         EWC safety,                   │     │
│  │                            quality)         replay buffer)                │     │
│  │                                                                            │     │
│  │  Web Content (POST /v1/crawl)                                             │     │
│  │       │                                                                    │     │
│  │       ▼                                                                    │     │
│  │  WebCrawler (robots.txt, rate-limit, BFS depth≤3)                        │     │
│  │       │                                                                    │     │
│  │       ▼                                                                    │     │
│  │  DataPipeline → FeedbackStore.ingest_content() → RAG VectorStore         │     │
│  │                                                                            │     │
│  │  Self-Distillation (POST /v1/distill)                                     │     │
│  │       Teacher (full model) → best-of-N → safety filter                   │     │
│  │       → Student (4L/256d) KL + CE loss → compressed model                │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │                      BACKGROUND SCHEDULER                                 │     │
│  │                                                                            │     │
│  │  Every 6h:  purge_expired()     — GDPR: удал. non-consent > 24h          │     │
│  │  Every 4h:  auto_train()        — обучение при ≥50 preference pairs      │     │
│  │  Every 12h: scheduled_crawl()   — web-краулинг seed-списка               │     │
│  │  Every 8h:  eval_model()        — безопасность + регрессионный guard     │     │
│  │  Every 24h: expand_tokenizer()  — расширение BPE словаря                 │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │                        OBSERVABILITY                                       │     │
│  │                                                                            │     │
│  │  ARIAMetrics → Prometheus text format (GET /metrics)                     │     │
│  │  Ключевые метрики: latency p50/p95/p99, cache hit rate, safety blocks,  │     │
│  │                    training runs, crawl pages, safety_score, distinct-1  │     │
│  │  OpenTelemetry spans (optional): aria.generate, rag.retrieve, safety    │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Структура файлов (полная)

```
ai_engine/
│
├── ARCHITECTURE_V2.md          ← этот файл
├── MASTER_README.md            ← Phase 1 документация
├── requirements.txt            ← torch (минимум)
├── all_requirements.txt        ← полные зависимости
│
├── transformer_text_generator.py  ← GPT decoder (PyTorch)
├── bpe_tokenizer.py               ← BPE tokenizer
├── gpt_with_bpe.py               ← интеграция GPT + BPE
├── integration_demo.py           ← демо всех модулей
│
├── agent/                  ← ReAct агент
│   ├── react_agent.py      ← Reason→Act→Observe цикл
│   ├── planner.py          ← планировщик задач
│   └── tools.py            ← web_search, calc, code_exec
│
├── memory/                 ← 3-уровневая память
│   ├── working_memory.py   ← TTL-буфер (256 токенов)
│   ├── episodic_memory.py  ← история сессий
│   └── semantic_memory.py  ← долгосрочные факты
│   └── memory_manager.py   ← оркестрация
│
├── rag/                    ← Retrieval-Augmented Generation
│   ├── rag_pipeline.py     ← главный RAG цикл
│   ├── vector_store.py     ← in-memory HNSW
│   ├── embeddings.py       ← TF-IDF + sentence embeddings
│   └── document_processor.py ← chunking + preprocessing
│
├── learning/               ← ★ Phase 1: Continual Learning
│   ├── feedback_store.py   ← SQLite WAL + GDPR + SHA-256 anon
│   ├── data_pipeline.py    ← NFC + NSFW filter + SimHash dedup
│   ├── web_crawler.py      ← robots.txt + rate-limit + BFS
│   ├── continual_trainer.py ← LoRA + EWC + replay buffer
│   ├── reward_model.py     ← Bradley-Terry BCE + MLP/LR/heuristic
│   └── tokenizer_trainer.py ← BPE vocab expansion
│
├── evaluation/             ← ★ Phase 2: Auto-Evaluation
│   └── evaluator.py        ← perplexity + distinct + safety probes
│
├── safety/                 ← ★ Phase 2: Safety Filter
│   └── safety_classifier.py ← L0 blocklist + L1 rules + L2 heuristic + L3 ML
│
├── distillation/           ← ★ Phase 2: Self-Distillation
│   └── self_distill.py     ← teacher best-of-N → KL student training
│
├── personalization/        ← ★ Phase 3: User Personalization
│   └── user_profile.py     ← интересы + expertise + style (decay)
│
├── serving/                ← ★ Phase 3: Production Serving
│   └── inference_cache.py  ← двухуровневый LRU + SimHash semantic cache
│
├── monitoring/             ← ★ Phase 3: Observability
│   └── metrics.py          ← Prometheus + OpenTelemetry + built-in fallback
│
├── server/                 ← FastAPI API Server
│   ├── main.py             ← 15+ endpoints + lifespan scheduler
│   ├── background_tasks.py ← asyncio periodic tasks
│   ├── requirements.txt    ← зависимости сервера
│   ├── Dockerfile         ← production контейнер
│   └── DEPLOY.md          ← инструкции по деплою
│
├── training_seeds/         ← 14 seed-датасетов по доменам
│   ├── 01_web_fullstack.py
│   ├── 02_react_typescript.tsx
│   ├── ...
│   └── 14_game_development.py
│
└── vibe_coding/            ← Production FastAPI пример (vibe coding)
    ├── app/
    └── tests/
```

---

## Полная матрица API эндпоинтов

| Endpoint | Метод | Auth | Описание |
|----------|-------|------|---------|
| `/health` | GET | — | Health check |
| `/metrics` | GET | — | Prometheus metrics |
| `/v1/models` | GET | Bearer | Список моделей |
| `/v1/chat/completions` | POST | Bearer | OpenAI-совместимый inference (stream/non-stream) |
| `/v1/feedback` | POST | Bearer | User feedback (consent, rating, correction) |
| `/v1/ingest` | POST | Bearer | Загрузить документ в KB |
| `/v1/crawl` | POST | Bearer | Запустить web-краулинг |
| `/v1/train/trigger` | POST | Bearer | Принудительный запуск обучения |
| `/v1/safety/check` | POST | Bearer | Проверить текст (L0-L3) |
| `/v1/evaluate` | POST | Bearer | Авто-оценка модели |
| `/v1/distill` | POST | Bearer | Self-distillation в фоне |
| `/v1/learning/stats` | GET | Bearer | Статус learning layer |

---

## Полный обучающий цикл

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARIA LEARNING LOOP                                │
│                                                                       │
│  1. ДАННЫЕ ПОЛЬЗОВАТЕЛЕЙ:                                            │
│     User → chat → feedback(rating, correction, consent=True)        │
│          ↓                                                           │
│     FeedbackStore (SQLite WAL, SHA-256 anon)                        │
│          ↓                                                           │
│     При ≥50 preference pairs → auto_train()                         │
│                                                                       │
│  2. WEB-КРАУЛИНГ:                                                    │
│     BackgroundScheduler (каждые 12ч) → WebCrawler                   │
│     seeds: Wikipedia, arXiv, GitHub Docs, ...                       │
│          ↓                                                           │
│     DataPipeline (NFC → NSFW filter → quality ≥ 0.35 → SimHash)   │
│          ↓                                                           │
│     FeedbackStore.ingest_content() + RAGPipeline.ingest()           │
│                                                                       │
│  3. ОБУЧЕНИЕ:                                                        │
│     RewardModel.train(preference_pairs)                              │
│          Bradley-Terry BCE loss                                       │
│          → score(prompt, response) → filter candidates              │
│                                                                       │
│     ContinualTrainer.train(training_texts)                           │
│          LoRA adapters (rank=8, base frozen)                         │
│          + EWC safety penalty (Fisher matrix)                        │
│          + Replay buffer 10%                                         │
│          + Early stopping (patience=3)                               │
│          + Rollback при loss > best * 1.1                           │
│                                                                       │
│  4. ОЦЕНКА (после каждого train run):                                │
│     ModelEvaluator.evaluate()                                        │
│          safety_score ≥ 0.85 (7 adversarial probes)                 │
│          distinct-1 ≥ 0.10 (anti-collapse)                          │
│          perplexity < 800                                            │
│          → regression? → ALERT + rollback                           │
│                                                                       │
│  5. РАСШИРЕНИЕ СЛОВАРЯ (каждые 24ч):                                │
│     TokenizerTrainer.expand(corpus)                                  │
│     Новые BPE пары (freq ≥ 5, не NSFW)                              │
│     Atomic save → patch живого токенизатора                          │
│                                                                       │
│  6. SELF-DISTILLATION (по запросу):                                 │
│     Teacher (full model) → best-of-N → Safety filter               │
│     → Student (4L/256d) KL + CE distillation loss                   │
│     → Compressed model (50% меньше RAM) для edge deploy             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `ARIA_API_KEY` | `local-dev-only-key` | API ключ для Bearer auth |
| `ARIA_FEEDBACK_DB` | `aria_feedback.db` | Путь к SQLite базе данных |
| `ARIA_REWARD_CKPT` | `aria_reward_model.pkl` | Checkpoint reward model |
| `ARIA_SAFETY_MODEL` | `aria_safety_model.pkl` | Checkpoint safety ML classifier |
| `ARIA_USER_ID_SALT` | `aria-feedback-v1` | Соль для SHA-256 анонимизации |
| `ARIA_VOCAB_PATH` | `aria_vocab.json` | Путь к BPE vocab файлу |
| `ARIA_AUTO_TRAIN_THRESHOLD` | `50` | Порог авто-запуска обучения |
| `ARIA_CRAWL_SEEDS` | `wikipedia.org\|arxiv.org\|...` | Seed URLs для краулинга |
| `ARIA_CRAWL_MAX_PAGES` | `100` | Максимум страниц за сессию |
| `ARIA_PURGE_INTERVAL_S` | `21600` | Интервал GDPR purge (6ч) |
| `ARIA_TRAIN_INTERVAL_S` | `14400` | Интервал auto-train (4ч) |
| `ARIA_CRAWL_INTERVAL_S` | `43200` | Интервал crawl (12ч) |
| `ARIA_EVAL_INTERVAL_S` | `28800` | Интервал eval (8ч) |
| `ARIA_TOKENIZER_INTERVAL_S` | `86400` | Интервал tokenizer expand (24ч) |
| `PORT` | `8000` | HTTP порт сервера |

---

## Безопасность — Threat Model

| Угроза | Уровень | Митигация |
|--------|---------|-----------|
| **Data poisoning** | Критical | Harm filter + quality score + reward model gate |
| **Jailbreak через prompt** | Critical | Safety dual-check (input + output), L0 absolutes |
| **Reward hacking** | High | Length penalty + offline RLHF + EMA нормализация |
| **Catastrophic forgetting** | High | LoRA (frozen base), EWC safety penalty, replay buffer |
| **CSAM/weapon output** | Critical | L0 absolute regex blocklist + L2 category filter |
| **Prompt injection via feedback** | High | Параметризованный SQL + размерные ограничения |
| **Mass ingestion DoS** | Medium | Rate limit 100/ч/user + max_pages краулера |
| **PII в обучающих данных** | High | SHA-256 анонимизация + consent gate + 24h retention |
| **Adversarial web content** | Medium | robots.txt обязателен + domain blacklist + quality≥0.35 |
| **Training race condition** | Medium | asyncio boolean locks + single task per type |
| **Safety bypass via fine-tuning** | Critical | Safety-frozen layers (EWC) + eval regression guard |
| **Model regression after update** | High | Eval suite после каждого train + auto-rollback |
| **Profile privacy inference** | Medium | Только vector weights, не raw텍스트 + AES-256 шифрование |
| **Cache poisoning** | Low | Cached только после safety check; invalidate on train |

---

## GDPR Compliance

| Требование | Реализация |
|------------|-----------|
| Право на забвение | `FeedbackStore.purge_expired_non_consent()` + `UserProfileStore.delete_profile()` |
| Согласие | `consent=True` обязательно для обучения |
| Анонимизация | SHA-256(salt + user_id) → необратимо |
| Минимизация | Хранятся только prompt + response + rating |
| Retention | Non-consent: 24ч. Consent: без ограничений |
| Datamap | Три хранилища: `aria_feedback.db`, `aria_profiles/`, `aria_vocab.json` |

---

## Производительность

| Операция | Latency (CPU) | Latency (GPU) |
|----------|--------------|--------------|
| Safety check L0-L2 | < 1 ms | < 1 ms |
| Cache lookup (exact) | < 0.1 ms | < 0.1 ms |
| Cache lookup (semantic) | < 2 ms (200 scan) | < 2 ms |
| RAG retrieve (top-3) | 5-20 ms | 2-5 ms |
| Transformer generate (256 tokens) | 2-30 s | 0.1-1 s |
| Reward model score | < 10 ms | < 5 ms |
| Training (LoRA, 1K samples) | 5-30 min | 1-5 min |
| Web crawl (100 pages) | 3-10 min | 3-10 min |

---

## Зависимости

### Обязательные (stdlib only)
Система работает без внешних зависимостей в degraded режиме.

### Опциональные (полная функциональность)
```bash
pip install fastapi uvicorn pydantic           # HTTP API server
pip install aiohttp certifi                    # WebCrawler
pip install torch                              # Transformer + LoRA training
pip install scikit-learn                       # RewardModel + SafetyClassifier ML
pip install langdetect                         # Language detection
pip install prometheus-client                  # Prometheus metrics
pip install opentelemetry-api opentelemetry-sdk # Distributed tracing
```

### Минимальный production сетап
```bash
pip install -r ai_engine/server/requirements.txt
uvicorn ai_engine.server.main:app --host 0.0.0.0 --port 8000
```
