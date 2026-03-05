# ARIA Learning Module — Документация

> **Версия:** 1.0.0 | **Статус:** Production-Ready | **Зависимости Python:** stdlib + опционально torch, sklearn, aiohttp, langdetect

Модуль реализует полный цикл **self-hosted continual learning**:
пользовательский feedback → reward model → LoRA fine-tuning → web crawl → RAG-индекс.

---

## Архитектурная схема

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARIA LEARNING PIPELINE                            │
│                                                                          │
│  User Interaction                                                        │
│       │                                                                  │
│       ▼                                                                  │
│  FeedbackStore ──────── GDPR (consent flag, 24h retention)              │
│  (SQLite WAL)           SHA-256 user anonymisation                       │
│       │                                                                  │
│       ├──► PreferencePairs (chosen vs rejected)                          │
│       │         │                                                        │
│       │         ▼                                                        │
│       │    RewardModel  (Bradley-Terry / MLP / sklearn / heuristic)     │
│       │         │                                                        │
│       │         └──► score(prompt, response) → filter candidates        │
│       │                                                                  │
│       └──► TrainingTexts (consent=1, rating≥1)                          │
│                 │                                                        │
│                 ▼                                                        │
│          DataPipeline ──── Unicode NFC, NSFW filter, SimHash dedup      │
│                 │                                                        │
│                 ▼                                                        │
│          ContinualTrainer ─── LoRA adapters, gradient checkpoint,       │
│          (PyTorch / no-op)    replay buffer, EWC safety penalty         │
│                                                                          │
│  Web Crawler                                                             │
│       │                                                                  │
│       ▼                                                                  │
│  WebCrawler ─────────── robots.txt (RFC 9309), blacklist, rate-limit   │
│  (aiohttp async)        BFS depth≤3, SimHash dedup, quality filter      │
│       │                                                                  │
│       ▼                                                                  │
│  FeedbackStore.ingest_content()  →  RAG VectorStore  →  inference       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Файлы модуля

| Файл | Назначение |
|------|------------|
| [`__init__.py`](./__init__.py) | Публичный API модуля |
| [`feedback_store.py`](./feedback_store.py) | SQLite WAL хранилище взаимодействий + GDPR |
| [`data_pipeline.py`](./data_pipeline.py) | Нормализация, фильтрация, SimHash dedup, chunking |
| [`web_crawler.py`](./web_crawler.py) | Async BFS краулер с robots.txt + quality filter |
| [`continual_trainer.py`](./continual_trainer.py) | LoRA fine-tuning, replay buffer, EWC, rollback |
| [`reward_model.py`](./reward_model.py) | RLHF-lite reward model из preference pairs |

---

## API Endpoints (FastAPI)

### `POST /v1/feedback`
Принять оценку ответа от пользователя.

```json
{
  "user_id": "user-123",
  "prompt": "Как настроить JWT?",
  "response": "Ответ ARIA...",
  "rating": -1,
  "correction": "Правильный ответ...",
  "consent": true,
  "session_id": "uuid"
}
```

**Гарантии безопасности:**
- `user_id` → SHA-256(salt + user_id), сырой ID не хранится
- Rate limit: 100 записей/час на пользователя
- Без `consent=true` → удаление через 24 ч (GDPR)
- Idempotency: повторный `interaction_id` игнорируется

---

### `POST /v1/ingest`
Добавить документ/статью в knowledge base.

```json
{
  "text": "Полный текст документа...",
  "source_url": "https://example.com/article",
  "source_type": "web",
  "language": "ru",
  "quality_score": 0.8
}
```

- Harm filter → DataPipeline
- Немедленное обновление RAG VectorStore
- Асинхронное добавление в обучающий датасет

---

### `POST /v1/crawl`
Запустить web-краулер для сбора обучающих данных.

```json
{
  "seeds": ["https://en.wikipedia.org/wiki/Python"],
  "max_pages": 100,
  "max_depth": 2,
  "allowed_langs": ["en", "ru"]
}
```

**Ограничения:**
- Одна активная сессия одновременно
- Max 500 страниц
- robots.txt принудительно соблюдается
- Blacklist: exploit-db, nulled.to, onion domains и др.

---

### `POST /v1/train/trigger`
Принудительный запуск инкрементального обучения.

```json
{
  "min_pairs": 10,
  "epochs": 3
}
```

Алгоритм:
1. Загрузить preference pairs (consent=1)
2. Обучить RewardModel (Bradley-Terry BCE loss)
3. Загрузить training texts
4. ContinualTrainer: LoRA fine-tuning с gradient checkpointing
5. Логировать метрики в `training_runs` таблицу

---

### `GET /v1/learning/stats`
Статус learning layer: backend, training_running, crawl_running.

---

## Continual Learning: защита от catastrophic forgetting

```
Epoch N  →  LoRA delta только (B·r·A матрицы, rank=8)
            Базовые веса заморожены

EWC:        Safety neurons (harm classifier) → Fisher matrix constraint
            L_total = L_CE + λ·Σ Fᵢ·(θᵢ - θᵢ*)²

Replay:     10% случайных примеров из предыдущих эпох в каждом батче

Early stop: patience=3, monitor validation loss
Rollback:   если val_loss > best_loss * 1.1 → restore checkpoint
```

---

## GDPR / Privacy

| Аспект | Реализация |
|--------|------------|
| User anonymisation | SHA-256(salt + user_id) — необратимо |
| Consent gate | consent=False → данные НЕ используются для обучения |
| Retention | Non-consent записи удаляются через 24 ч (`purge_expired_non_consent()`) |
| Right to erasure | `DELETE FROM interactions WHERE user_hash = ?` |
| Data minimisation | Только prompt + response + rating хранится |

---

## Зависимости

### Обязательные (stdlib only — работает без установки)
Без внешних зависимостей: heuristic reward scoring, SimHash dedup, BoW features.

### Опциональные
```bash
pip install aiohttp certifi          # WebCrawler (async HTTP)
pip install torch                    # ContinualTrainer (LoRA), RewardModel MLP
pip install scikit-learn             # RewardModel sklearn backend
pip install langdetect               # Language detection в DataPipeline
```

### Полный стек
```bash
pip install aiohttp certifi torch scikit-learn langdetect
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `ARIA_FEEDBACK_DB` | `aria_feedback.db` | Путь к SQLite базе |
| `ARIA_REWARD_CKPT` | `aria_reward_model.pkl` | Checkpoint reward model |
| `ARIA_USER_ID_SALT` | `aria-feedback-v1` | Соль для хэширования user_id |
| `ARIA_AUTO_TRAIN_THRESHOLD` | `50` | Число пар для авто-запуска обучения |

---

## Схема данных SQLite

```sql
-- Взаимодействия пользователей
CREATE TABLE interactions (
    interaction_id TEXT PRIMARY KEY,   -- SHA-256(user_hash:prompt:ts)
    user_hash      TEXT NOT NULL,      -- SHA-256(salt:user_id)
    prompt         TEXT NOT NULL,
    response       TEXT NOT NULL,
    rating         INTEGER DEFAULT 0,  -- -1, 0, 1
    correction     TEXT,               -- исправленный ответ
    consent        INTEGER DEFAULT 0,  -- 0=no, 1=yes
    timestamp      REAL NOT NULL,      -- Unix seconds
    session_id     TEXT NOT NULL,
    language       TEXT DEFAULT 'und'
);

-- Внешний контент (краулер + user uploads)
CREATE TABLE content_items (
    content_id       TEXT PRIMARY KEY,  -- SHA-256(text[:1024])
    source_url       TEXT,
    source_type      TEXT NOT NULL,     -- 'web'|'user_upload'|'platform'
    text             TEXT NOT NULL,
    language         TEXT DEFAULT 'und',
    quality_score    REAL DEFAULT 0.5,
    ingested_at      REAL NOT NULL,
    used_in_training INTEGER DEFAULT 0  -- помечаем после использования
);

-- Аудит тренировочных прогонов
CREATE TABLE training_runs (
    run_id      TEXT PRIMARY KEY,
    started_at  REAL NOT NULL,
    finished_at REAL,
    samples     INTEGER DEFAULT 0,
    loss_before REAL,
    loss_after  REAL,
    status      TEXT DEFAULT 'running'  -- 'running'|'done'|'failed'
);
```

---

## Threat Model (Security Audit)

| Угроза | Митигация |
|--------|-----------|
| **Data poisoning** | Harm filter + quality score + reward model confidence gate |
| **Reward hacking** | Length penalty + offline RLHF (не online PPO) + EMA нормализация |
| **Catastrophic forgetting** | LoRA (frozen base), EWC safety penalty, replay buffer |
| **Prompt injection via feedback** | Параметризованные SQL запросы, размерные ограничения |
| **Mass ingestion DoS** | Rate limit 100/hour/user + max_pages краулера |
| **PII в обучающих данных** | Анонимизация user_id + consent gate + 24h retention |
| **Adversarial web content** | robots.txt + domain blacklist + NSFW filter + quality≥0.35 |
| **Training run race condition** | `_training_running` boolean lock + asyncio single task |
| **Unicode injection** | NFC нормализация + control character strip |
| **Safety bypass через fine-tuning** | Safety-frozen layers (EWC) + harm classifier заморожен |
