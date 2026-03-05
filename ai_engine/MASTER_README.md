# ARIA AI Engine — Полная документация

> **Уровень:** Codex 5.3 | **Версия:** 1.0.0 | **Статус:** Production-Ready

ARIA AI Engine — это автономный, модульный движок искусственного интеллекта, реализующий полный стек современных AI-архитектур: от обучаемого Transformer (GPT-архитектура) до агентного режима ReAct с долгосрочной памятью и RAG-пайплайном. Спроектирован по принципам Vibe Coding, Clean Architecture и Zero Trust.

---

## Архитектурная схема

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARIA AI ENGINE                               │
├────────────────┬───────────────┬────────────────┬───────────────────┤
│  Transformer   │      RAG      │     Agent      │      Memory       │
│  (GPT arch)    │  (Retrieval)  │   (ReAct)      │    (3-layer)      │
│                │               │                │                   │
│ • GPTLanguage  │ • RAGPipeline │ • ReActAgent   │ • WorkingMemory   │
│   Model        │ • VectorStore │ • TaskPlanner  │ • EpisodicMemory  │
│ • BPETokenizer │ • Embeddings  │ • ToolRegistry │ • SemanticMemory  │
│ • MultiHead    │ • DocProc     │ • Tool (base)  │ • MemoryManager   │
│   Attention    │               │                │                   │
└────────────────┴───────────────┴────────────────┴───────────────────┘
         ↕                ↕               ↕                 ↕
┌─────────────────────────────────────────────────────────────────────┐
│                       IntegrationDemo                                │
│              (integration_demo.py — точка входа)                    │
├─────────────────────────────────────────────────────────────────────┤
│                      Vibe Coding Example                             │
│           (vibe_coding/ — FastAPI Production App)                   │
├─────────────────────────────────────────────────────────────────────┤
│                      Training Seeds (×14)                            │
│        (training_seeds/ — обучающие данные по доменам)              │
└─────────────────────────────────────────────────────────────────────┘
```

**Поток данных:**
```
Входной текст
    │
    ▼
BPETokenizer (подсловная токенизация)
    │
    ▼
GPTLanguageModel (Transformer decoder, multi-head attention)
    │
    ├──► RAGPipeline (поиск по документам → аугментация контекста)
    │         └──► VectorStore → EmbeddingModel
    │
    ├──► ReActAgent (Reason → Act → Observe → цикл)
    │         └──► ToolRegistry (web_search, calculator, code_exec, ...)
    │
    └──► MemoryManager
              ├──► WorkingMemory  (текущий контекст, TTL-буфер)
              ├──► EpisodicMemory (история сессий, временны́е метки)
              └──► SemanticMemory (долгосрочные факты, векторный поиск)
```

---

## Полная структура файлов

```
ai_engine/
│
├── MASTER_README.md              ← этот файл
├── README.md                     ← краткий обзор движка
├── requirements.txt              ← минимальные зависимости (torch)
├── all_requirements.txt          ← полные зависимости всех модулей
│
├── transformer_text_generator.py ← GPT-архитектура с нуля (PyTorch)
├── bpe_tokenizer.py              ← BPE-токенизатор (Byte-Pair Encoding)
├── gpt_with_bpe.py               ← интеграция GPT + BPE
├── integration_demo.py           ← демо всех модулей вместе
│
├── agent/                        ← агентный модуль ReAct
│   ├── __init__.py               ← публичный API модуля
│   ├── react_agent.py            ← главный агентный цикл (ReAct)
│   ├── planner.py                ← планировщик задач
│   ├── tools.py                  ← реестр и реализации инструментов
│   └── README.md                 ← документация агента
│
├── memory/                       ← трёхуровневая система памяти
│   ├── __init__.py               ← публичный API модуля
│   ├── memory_manager.py         ← оркестратор всех типов памяти
│   ├── working_memory.py         ← рабочая память (короткий контекст)
│   ├── episodic_memory.py        ← эпизодическая память (история)
│   ├── semantic_memory.py        ← семантическая память (факты)
│   └── README.md                 ← документация памяти
│
├── rag/                          ← RAG-пайплайн (Retrieval-Augmented Gen)
│   ├── __init__.py               ← публичный API модуля
│   ├── rag_pipeline.py           ← основной пайплайн RAG
│   ├── vector_store.py           ← векторное хранилище (FAISS/cosine)
│   ├── embeddings.py             ← модели эмбеддингов
│   ├── document_processor.py     ← парсинг и чанкинг документов
│   └── README.md                 ← документация RAG
│
├── vibe_coding/                  ← пример ProductionApp по Vibe Coding
│   ├── README.md                 ← описание Vibe Coding стандарта
│   ├── architecture.md           ← архитектурные решения
│   ├── Dockerfile                ← контейнеризация
│   ├── requirements.txt          ← зависимости FastAPI-приложения
│   └── app/
│       ├── main.py               ← точка входа FastAPI
│       ├── config.py             ← конфигурация (Pydantic Settings)
│       ├── domain/
│       │   ├── models.py         ← доменные модели (чистые классы)
│       │   ├── events.py         ← доменные события
│       │   └── exceptions.py     ← типизированные исключения
│       ├── application/
│       │   ├── services.py       ← бизнес-логика (use cases)
│       │   └── dto.py            ← Data Transfer Objects
│       ├── infrastructure/
│       │   ├── database.py       ← SQLAlchemy async ORM
│       │   ├── repositories.py   ← репозитории (паттерн Repository)
│       │   └── security.py       ← JWT, хэширование паролей
│       └── presentation/
│           ├── api.py            ← REST API эндпоинты
│           └── middleware.py     ← rate limiting, logging, CORS
│
└── training_seeds/               ← обучающие примеры по доменам (×14)
    ├── README.md                 ← описание всех сидов
    ├── 01_web_fullstack.py       ← Full-Stack Web разработка
    ├── 02_react_typescript.tsx   ← React + TypeScript паттерны
    ├── 03_data_science.py        ← Data Science / pandas / sklearn
    ├── 04_devops_infrastructure.py ← DevOps / Docker / K8s
    ├── 05_cybersecurity.py       ← Кибербезопасность
    ├── 06_algorithms.py          ← Алгоритмы и структуры данных
    ├── 07_database_patterns.py   ← БД паттерны / SQL / ORM
    ├── 08_api_design.py          ← REST / gRPC / GraphQL дизайн
    ├── 09_testing_patterns.py    ← TDD / BDD тестирование
    ├── 10_blockchain_web3.py     ← Blockchain / Web3 / Smart Contracts
    ├── 11_nlp_ml_pipeline.py     ← NLP / ML Pipeline
    ├── 12_system_design.py       ← Системное проектирование
    ├── 13_financial_analysis.py  ← Финансовый анализ
    └── 14_game_development.py    ← Разработка игр
```

---

## Быстрый старт

### 1. Установка зависимостей

```bash
pip install -r ai_engine/all_requirements.txt
```

### 2. Запуск интеграционного демо

```bash
python ai_engine/integration_demo.py
```

### 3. Запуск Vibe Coding FastAPI-приложения

```bash
cd ai_engine/vibe_coding
docker build -t aria-vibe-app .
docker run -p 8000:8000 aria-vibe-app
```

### 4. Использование отдельных модулей

```python
# Transformer — генерация текста
from ai_engine.transformer_text_generator import GPTLanguageModel, GPTConfig

config = GPTConfig(vocab_size=50257, n_embd=768, n_head=12, n_layer=12)
model = GPTLanguageModel(config)

# RAG — поиск по документам
from ai_engine.rag import RAGPipeline

rag = RAGPipeline()
rag.add_documents(["документ 1...", "документ 2..."])
answer = rag.query("Что такое ARIA?")

# Agent — агентный режим
from ai_engine.agent import ReActAgent

agent = ReActAgent(model=model, tools=["web_search", "calculator"])
result = agent.run("Посчитай 2^32 и найди статью про Python")

# Memory — трёхуровневая память
from ai_engine.memory import MemoryManager

memory = MemoryManager()
memory.store("user_name", "Алиса", memory_type="semantic")
recalled = memory.recall("user_name")
```

---

## Описание модулей

### 1. Transformer Text Generator

**Файлы:** [`transformer_text_generator.py`](transformer_text_generator.py:1), [`gpt_with_bpe.py`](gpt_with_bpe.py:1), [`bpe_tokenizer.py`](bpe_tokenizer.py:1)

Реализует GPT-архитектуру (decoder-only Transformer) с нуля на PyTorch:

- **Multi-Head Self-Attention** с масками для авторегрессии
- **Position Embeddings** (абсолютные, обучаемые)
- **Feed-Forward Network** с активацией GELU
- **Layer Normalization** (pre-norm, стабильность обучения)
- **BPE-токенизатор** — Byte-Pair Encoding, совместимый с GPT-2
- **Beam Search / Top-K / Nucleus Sampling** для генерации
- Поддержка **gradient checkpointing** для экономии памяти

**Ключевые параметры конфига:**
| Параметр | Значение по умолчанию | Описание |
|---|---|---|
| `vocab_size` | 50257 | Размер словаря |
| `n_embd` | 768 | Размерность эмбеддингов |
| `n_head` | 12 | Количество голов внимания |
| `n_layer` | 12 | Количество слоёв |
| `block_size` | 1024 | Максимальная длина контекста |
| `dropout` | 0.1 | Dropout для регуляризации |

---

### 2. RAG Pipeline (Retrieval-Augmented Generation)

**Файлы:** [`rag/rag_pipeline.py`](rag/rag_pipeline.py:1), [`rag/vector_store.py`](rag/vector_store.py:1), [`rag/embeddings.py`](rag/embeddings.py:1), [`rag/document_processor.py`](rag/document_processor.py:1)

Реализует полный цикл RAG:

1. **Document Processing** — парсинг PDF/TXT/HTML, рекурсивный чанкинг с перекрытием
2. **Embedding** — векторизация чанков (sentence-transformers / собственная реализация)
3. **Vector Store** — хранение и поиск по косинусному сходству (FAISS-совместимо)
4. **Retrieval** — Top-K поиск релевантных фрагментов
5. **Augmented Generation** — инжекция контекста в промпт и генерация ответа

**Защита от атак:**
- Ограничение размера документов (DoS-защита)
- Санитизация входных строк запросов
- Rate limiting на уровне пайплайна

---

### 3. Agent Mode (ReAct)

**Файлы:** [`agent/react_agent.py`](agent/react_agent.py:1), [`agent/planner.py`](agent/planner.py:1), [`agent/tools.py`](agent/tools.py:1)

Реализует паттерн **ReAct (Reason + Act)**:

```
Thought: "Нужно найти курс доллара"
Action: web_search("USD RUB exchange rate")
Observation: "1 USD = 89.5 RUB"
Thought: "Теперь могу ответить"
Answer: "Текущий курс: 89.5 рублей за доллар"
```

**Встроенные инструменты:**
| Инструмент | Класс | Описание |
|---|---|---|
| `web_search` | `WebSearchTool` | Поиск в интернете |
| `calculator` | `CalculatorTool` | Математические вычисления |
| `code_executor` | `CodeExecutorTool` | Выполнение Python-кода (sandbox) |
| `file_reader` | `FileReaderTool` | Чтение файлов |
| `memory_tool` | `MemoryTool` | Доступ к памяти агента |

**Безопасность:**
- Sandbox-изоляция выполнения кода (ограниченные `builtins`)
- Таймаут на каждый вызов инструмента
- Максимальное количество шагов рассуждения (защита от бесконечных циклов)

---

### 4. Memory System (Трёхуровневая память)

**Файлы:** [`memory/memory_manager.py`](memory/memory_manager.py:1), [`memory/working_memory.py`](memory/working_memory.py:1), [`memory/episodic_memory.py`](memory/episodic_memory.py:1), [`memory/semantic_memory.py`](memory/semantic_memory.py:1)

```
┌─────────────────────────────────────────────────┐
│              MemoryManager                       │
├─────────────┬──────────────┬───────────────────┤
│  Working    │   Episodic   │    Semantic        │
│  Memory     │   Memory     │    Memory          │
│             │              │                    │
│ Текущий     │ История      │ Долгосрочные       │
│ контекст    │ сессий       │ факты + векторы    │
│ TTL: сессия │ TTL: недели  │ TTL: постоянно     │
│ ~4K токенов │ ~100K записей│ ~∞ (индексирование)│
└─────────────┴──────────────┴───────────────────┘
```

- **WorkingMemory**: кольцевой буфер с вытеснением LRU, thread-safe
- **EpisodicMemory**: временны́е метки, поиск по промежуткам времени, компрессия
- **SemanticMemory**: векторный поиск фактов, дедупликация, hierarchical indexing

---

### 5. Vibe Coding Example

**Директория:** [`vibe_coding/`](vibe_coding/)

Полнофункциональное FastAPI-приложение, демонстрирующее стандарты Vibe Coding:

- **Clean Architecture**: Domain → Application → Infrastructure → Presentation
- **Domain-Driven Design**: чистые доменные модели без зависимостей от фреймворков
- **CQRS-паттерн**: разделение команд и запросов в сервисах
- **Repository паттерн**: абстракция над хранилищем данных
- **Async/await**: полностью асинхронный стек (asyncpg + SQLAlchemy async)
- **Security**: JWT аутентификация, bcrypt хэширование, rate limiting
- **Observability**: структурированное логирование, middleware для метрик

---

### 6. Training Seeds (Обучающие данные)

**Директория:** [`training_seeds/`](training_seeds/)

14 высококачественных обучающих файлов по ключевым доменам разработки:

| # | Файл | Домен | Паттерны |
|---|---|---|---|
| 01 | [`01_web_fullstack.py`](training_seeds/01_web_fullstack.py:1) | Full-Stack Web | REST, JWT, CORS |
| 02 | [`02_react_typescript.tsx`](training_seeds/02_react_typescript.tsx:1) | React + TypeScript | Hooks, Context, HOC |
| 03 | [`03_data_science.py`](training_seeds/03_data_science.py:1) | Data Science | pandas, sklearn, viz |
| 04 | [`04_devops_infrastructure.py`](training_seeds/04_devops_infrastructure.py:1) | DevOps | Docker, K8s, CI/CD |
| 05 | [`05_cybersecurity.py`](training_seeds/05_cybersecurity.py:1) | Cybersecurity | Crypto, Auth, XSS/SQLI |
| 06 | [`06_algorithms.py`](training_seeds/06_algorithms.py:1) | Algorithms | O-сложность, DP, Graph |
| 07 | [`07_database_patterns.py`](training_seeds/07_database_patterns.py:1) | Databases | ORM, индексы, транзакции |
| 08 | [`08_api_design.py`](training_seeds/08_api_design.py:1) | API Design | REST, gRPC, GraphQL |
| 09 | [`09_testing_patterns.py`](training_seeds/09_testing_patterns.py:1) | Testing | TDD, BDD, mocking |
| 10 | [`10_blockchain_web3.py`](training_seeds/10_blockchain_web3.py:1) | Blockchain | Smart Contracts, DeFi |
| 11 | [`11_nlp_ml_pipeline.py`](training_seeds/11_nlp_ml_pipeline.py:1) | NLP / ML | Pipeline, tokenizers |
| 12 | [`12_system_design.py`](training_seeds/12_system_design.py:1) | System Design | Scale, CAP, распред. |
| 13 | [`13_financial_analysis.py`](training_seeds/13_financial_analysis.py:1) | Finance | Quant, risk, backtests |
| 14 | [`14_game_development.py`](training_seeds/14_game_development.py:1) | Game Dev | ECS, physics, rendering |

---

## Таблица всех Python-классов

| Класс | Файл | Назначение |
|---|---|---|
| `GPTLanguageModel` | [`transformer_text_generator.py`](transformer_text_generator.py:1) | Главная GPT-модель (decoder Transformer) |
| `GPTConfig` | [`transformer_text_generator.py`](transformer_text_generator.py:1) | Конфигурация гиперпараметров GPT |
| `MultiHeadAttention` | [`transformer_text_generator.py`](transformer_text_generator.py:1) | Многоголовое самовнимание |
| `FeedForward` | [`transformer_text_generator.py`](transformer_text_generator.py:1) | FFN-блок (GELU активация) |
| `TransformerBlock` | [`transformer_text_generator.py`](transformer_text_generator.py:1) | Один блок Transformer (Attn + FFN + LN) |
| `BPETokenizer` | [`bpe_tokenizer.py`](bpe_tokenizer.py:1) | Byte-Pair Encoding токенизатор |
| `GPTWithBPE` | [`gpt_with_bpe.py`](gpt_with_bpe.py:1) | Обёртка GPT + BPE для генерации |
| `IntegrationDemo` | [`integration_demo.py`](integration_demo.py:1) | Демонстрация всех модулей |
| `ReActAgent` | [`agent/react_agent.py`](agent/react_agent.py:1) | Агентный цикл Reason-Act-Observe |
| `TaskPlanner` | [`agent/planner.py`](agent/planner.py:1) | Декомпозиция задач на подзадачи |
| `ToolRegistry` | [`agent/tools.py`](agent/tools.py:1) | Реестр доступных инструментов |
| `BaseTool` | [`agent/tools.py`](agent/tools.py:1) | Базовый класс инструмента агента |
| `WebSearchTool` | [`agent/tools.py`](agent/tools.py:1) | Инструмент веб-поиска |
| `CalculatorTool` | [`agent/tools.py`](agent/tools.py:1) | Математический калькулятор |
| `CodeExecutorTool` | [`agent/tools.py`](agent/tools.py:1) | Sandbox выполнение Python-кода |
| `MemoryManager` | [`memory/memory_manager.py`](memory/memory_manager.py:1) | Оркестратор системы памяти |
| `WorkingMemory` | [`memory/working_memory.py`](memory/working_memory.py:1) | Рабочая память (текущий контекст) |
| `EpisodicMemory` | [`memory/episodic_memory.py`](memory/episodic_memory.py:1) | Эпизодическая память (история) |
| `SemanticMemory` | [`memory/semantic_memory.py`](memory/semantic_memory.py:1) | Семантическая память (факты) |
| `RAGPipeline` | [`rag/rag_pipeline.py`](rag/rag_pipeline.py:1) | Полный RAG-пайплайн |
| `VectorStore` | [`rag/vector_store.py`](rag/vector_store.py:1) | Векторное хранилище с cosine-поиском |
| `EmbeddingModel` | [`rag/embeddings.py`](rag/embeddings.py:1) | Модель эмбеддингов текста |
| `DocumentProcessor` | [`rag/document_processor.py`](rag/document_processor.py:1) | Парсинг и чанкинг документов |
| `TaskService` | [`vibe_coding/app/application/services.py`](vibe_coding/app/application/services.py:1) | Бизнес-логика задач (use cases) |
| `TaskRepository` | [`vibe_coding/app/infrastructure/repositories.py`](vibe_coding/app/infrastructure/repositories.py:1) | Репозиторий задач (async SQLAlchemy) |
| `SecurityService` | [`vibe_coding/app/infrastructure/security.py`](vibe_coding/app/infrastructure/security.py:1) | JWT + bcrypt безопасность |
| `RateLimitMiddleware` | [`vibe_coding/app/presentation/middleware.py`](vibe_coding/app/presentation/middleware.py:1) | Rate limiting middleware |

---

## Принципы разработки

### Vibe Coding Standard

Vibe Coding — методология разработки, при которой каждая строка кода:
1. **Читается как документация** — имена переменных и функций самодокументируемы
2. **Выражает намерение, а не механику** — "что", а не "как"
3. **Следует принципу наименьшего удивления** — поведение предсказуемо

### SOLID

| Принцип | Реализация в проекте |
|---|---|
| **S**ingle Responsibility | Каждый модуль отвечает за один аспект (RAG, Agent, Memory, Transformer) |
| **O**pen/Closed | `BaseTool` расширяется без изменения `ToolRegistry` |
| **L**iskov Substitution | `WorkingMemory` / `EpisodicMemory` / `SemanticMemory` взаимозаменяемы через интерфейс |
| **I**nterface Segregation | Отдельные `__init__.py` экспортируют только публичный API |
| **D**ependency Inversion | `MemoryManager` зависит от абстракций, не от конкретных классов |

### DRY и Clean Architecture

- Нет дублирования логики токенизации между модулями
- Доменный слой (`vibe_coding/domain/`) не имеет зависимостей от FastAPI/SQLAlchemy
- Конфигурация через `Pydantic Settings`, не захардкоженные значения
- Все секреты через переменные окружения (`.env`), не в коде

### Security by Default

- **Sandbox-исполнение кода**: ограниченный `exec()` с белым списком builtins
- **Rate Limiting**: защита всех эндпоинтов от брутфорса
- **JWT с коротким TTL**: access token 15 мин, refresh 7 дней
- **Input Validation**: Pydantic на всех входных точках
- **No Secrets in Repo**: `.env.example` вместо реальных значений

---

## Дорожная карта

### Ближайшие улучшения (v1.1)

| Задача | Приоритет | Сложность | Описание |
|---|---|---|---|
| **Fine-tuning Pipeline** | 🔴 Высокий | Высокая | LoRA / QLoRA адаптеры для domain-specific дообучения |
| **FastAPI Product Wrapper** | 🔴 Высокий | Средняя | REST API обёртка над всем движком для production |
| **Streaming Generation** | 🟡 Средний | Средняя | Server-Sent Events для потоковой генерации токенов |
| **Persistent Vector Store** | 🟡 Средний | Средняя | Замена in-memory FAISS на Qdrant / Weaviate |

### Среднесрочные (v1.2–v2.0)

| Задача | Приоритет | Описание |
|---|---|---|
| **Multimodal Support (Vision)** | 🟡 Средний | CLIP-интеграция, image-to-text, visual RAG |
| **Distributed Inference** | 🟡 Средний | Tensor Parallelism, pipeline parallelism (vLLM) |
| **Quantization** | 🟢 Низкий | INT8/INT4 квантизация через bitsandbytes |
| **RLHF Pipeline** | 🟢 Низкий | Reward model + PPO для RLHF дообучения |
| **Multi-Agent Framework** | 🔴 Высокий | Координация нескольких агентов (AutoGen-стиль) |

### Долгосрочное видение (v3.0+)

- **Federated Learning** — обучение без централизации данных
- **Neuromorphic Computing** — поддержка нейроморфных чипов (Intel Loihi)
- **Constitutional AI** — встроенные ограничения безопасности на уровне модели
- **Homomorphic Encryption** — вычисления над зашифрованными данными

---

## Observability и мониторинг

```python
# Все операции логируются структурированно
import logging
logger = logging.getLogger("aria.engine")

# Метрики генерации
logger.info("generation_complete", extra={
    "tokens_generated": 256,
    "latency_ms": 1240,
    "model": "GPT-768M",
    "method": "nucleus_sampling"
})
```

Рекомендуемый стек для production:
- **Prometheus** — метрики (latency, tokens/sec, memory usage)
- **Grafana** — дашборды
- **Jaeger** — distributed tracing для цепочек RAG + Agent
- **Sentry** — error tracking

---

## Зависимости

| Пакет | Версия | Назначение |
|---|---|---|
| `torch` | ≥2.0 | PyTorch — основа Transformer |
| `numpy` | ≥1.24 | Векторные операции |
| `fastapi` | ≥0.100 | Web-фреймворк (vibe_coding) |
| `sqlalchemy` | ≥2.0 | Async ORM |
| `pydantic` | ≥2.0 | Валидация данных |
| `sentence-transformers` | ≥2.2 | Эмбеддинги для RAG |
| `faiss-cpu` | ≥1.7 | Векторный поиск |
| `tiktoken` | ≥0.5 | BPE токенизатор (OpenAI-совместимый) |

Полный список: [`all_requirements.txt`](all_requirements.txt)

---

*ARIA AI Engine — Codex 5.3 | Разработано по стандартам Vibe Coding*
