# AI Engine — Training Seeds

Эталонная коллекция production-ready мини-примеров кода. Каждый файл демонстрирует лучшие практики конкретного направления и служит обучающим паттерном для ИИ-движка.

---

## Как использовать эти seeds

1. **Обучение ИИ** — файлы загружаются в контекст ИИ как примеры «правильного» кода
2. **Code review baseline** — новый сгенерированный код сравнивается со структурой seeds
3. **Template library** — разработчики используют как отправную точку для новых модулей
4. **Документация паттернов** — каждый файл объясняет архитектурные решения в комментариях

---

## Таблица файлов

| Файл | Направление | Ключевые паттерны | Зависимости |
|------|-------------|-------------------|-------------|
| [`01_web_fullstack.py`](01_web_fullstack.py) | Web Full-Stack | FastAPI, SQLAlchemy ORM, JWT (HS256), Pydantic v2, Repository pattern, DI | `fastapi`, `sqlalchemy`, `pyjwt`, `pydantic[email]`, `passlib[bcrypt]`, `uvicorn` |
| [`02_react_typescript.tsx`](02_react_typescript.tsx) | React / TypeScript | Custom hooks, Zustand store, Error Boundary, мемоизация, ARIA | `react`, `zustand`, TypeScript strict |
| [`03_data_science.py`](03_data_science.py) | Data Science & ML | sklearn Pipeline, ColumnTransformer, RandomForest, CV, Feature Engineering | `pandas`, `scikit-learn`, `matplotlib`, `numpy` |
| [`04_devops_infrastructure.py`](04_devops_infrastructure.py) | DevOps & IaC | Docker Compose generator, K8s manifest builder, Health check, Prometheus metrics, JSON structured logging | `pyyaml` |
| [`05_cybersecurity.py`](05_cybersecurity.py) | Cybersecurity | bcrypt hashing, JWT management, Sliding window rate limiter, CSRF tokens, Input sanitization, Audit log | `bcrypt`, `pyjwt` |
| [`06_algorithms.py`](06_algorithms.py) | Algorithms & DS | QuickSort/MergeSort/HeapSort, BFS/DFS/Dijkstra/Topological sort, LCS/Knapsack/Coin change, Binary search variants | stdlib only |
| [`07_database_patterns.py`](07_database_patterns.py) | Database Patterns | Connection Pool, Repository, Unit of Work, UPSERT idempotency, Migration runner, Query Builder | stdlib (`sqlite3`) |
| [`08_api_design.py`](08_api_design.py) | API Design | REST Router + middleware chain, Rate limiting middleware, GraphQL resolver pattern, WebSocket + heartbeat | stdlib + `asyncio` |
| [`09_testing_patterns.py`](09_testing_patterns.py) | Testing | AAA pattern, MagicMock/AsyncMock, Factory pattern, pytest fixtures (scoped), parametrize, integration tests | `pytest`, `pytest-asyncio` |
| [`10_blockchain_web3.py`](10_blockchain_web3.py) | Blockchain / Web3 | ECDSA wallet, Transaction signing, Merkle Tree, PoW blockchain, Nakamoto consensus, tamper detection | `ecdsa` (опционально) |
| [`11_nlp_ml_pipeline.py`](11_nlp_ml_pipeline.py) | NLP / ML | Text preprocessing, TF-IDF pipeline, Sentiment classification, Regex NER, Cross-validation | `scikit-learn`, `numpy` |
| [`12_system_design.py`](12_system_design.py) | System Design | LRU Cache (O(1)), Circuit Breaker (3 states), Message Queue + DLQ + backpressure, Service Registry, Load balancer | stdlib + `asyncio` |
| [`13_financial_analysis.py`](13_financial_analysis.py) | Financial Analysis | Markowitz MVO, VaR/CVaR Historical, Sharpe/MaxDrawdown, SMA/EMA/RSI/MACD/BB, Monte Carlo GBM | `numpy`, `pandas`, `scipy` |
| [`14_game_development.py`](14_game_development.py) | Game Development | ECS (World/Components/Systems), AABB Collision, Game State Machine, Event Bus, Fixed-timestep Game Loop | stdlib only |

---

## Архитектурные принципы, применённые во всех seeds

### Безопасность
- Type hints везде (`from __future__ import annotations`)
- Явные error paths — никаких `except pass`
- Секреты только через `os.environ`, никогда хардкодом

### Качество кода
- Docstrings с объяснением Time/Space complexity где применимо
- Разделение данных и логики (dataclass + service)
- Детерминированная логика — одинаковый input → одинаковый output

### Масштабируемость
- Примечания где менять in-memory реализацию на Redis/PostgreSQL/Kafka
- Stateless сервисы где возможно
- Явное указание O-сложности критических операций

### Тестируемость
- Dependency Injection во всех сервисах
- Нет глобального состояния кроме явно обозначенного
- Фабрики вместо хардкода тестовых данных

---

## Установка зависимостей

```bash
# Базовые зависимости
pip install fastapi uvicorn sqlalchemy pyjwt passlib[bcrypt] pydantic[email]

# Data Science
pip install pandas scikit-learn matplotlib scipy numpy

# Прочие
pip install pyyaml ecdsa pytest pytest-asyncio

# React/TypeScript seeds запускаются в Node.js окружении
npm install zustand react react-dom
npm install -D typescript @types/react
```

---

## Структура директории

```
ai_engine/training_seeds/
├── README.md                    ← этот файл
├── 01_web_fullstack.py          ← FastAPI + SQLAlchemy + JWT
├── 02_react_typescript.tsx      ← React + Zustand + TypeScript strict
├── 03_data_science.py           ← Pandas + sklearn Pipeline
├── 04_devops_infrastructure.py  ← Docker Compose + K8s + Prometheus
├── 05_cybersecurity.py          ← bcrypt + JWT + Rate limiting + CSRF
├── 06_algorithms.py             ← Sorting + Graph + DP + Binary Search
├── 07_database_patterns.py      ← Repository + UoW + Connection Pool
├── 08_api_design.py             ← REST + GraphQL + WebSocket
├── 09_testing_patterns.py       ← pytest + mocks + factories
├── 10_blockchain_web3.py        ← Blockchain + Merkle + ECDSA
├── 11_nlp_ml_pipeline.py        ← TF-IDF + Sentiment + NER
├── 12_system_design.py          ← LRU Cache + Circuit Breaker + MQ
├── 13_financial_analysis.py     ← Markowitz + VaR + MACD + Monte Carlo
└── 14_game_development.py       ← ECS + State Machine + Game Loop
```
