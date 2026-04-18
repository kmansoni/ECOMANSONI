# 🧠 Super Agent System — AI Agent нового поколения

## Обзор

Полнофункциональный AI агент с возможностями:
- 💾 **Долгосрочная память** (1000+ запросов)
- 🧠 **Единый мозг** с самообучением
- 🔬 **Глубокое исследование** (web + фактчекинг)
- 🔐 **E2EE шифрование** 
- 🏗️ **Архитектурное проектирование** "на 10000 шагов вперёд"
- 💰 **Cost-based AI routing** (бесплатные vs платные провайдеры)
- 💭 **Критическое мышление** (дебаты с самим собой)
- 🔍 **Security аудит** (утечки, SQL injection, XSS)

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SUPER AGENT                         │
├─────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │   React     │───▶│   Memory     │───▶│   Brain  │  │
│  │   Agent     │    │   System     │    │   System │  │
│  └──────────────┘    └──────────────┘    └──────────┘  │
│         │                   │                   │             │
│         ▼                   ▼                   ▼         │
│  ┌─────────────────────────────────────────────────┐    │
│  │             ToolRegistry (25+ tools)             │    │
│  │  • calculator  • web_search  • deep_research   │    │
│  │  • think      • remember    • recall          │    │
│  │  • audit_security  • encrypt_message         │    │
│  │  • design_architecture  • fact_check        │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │     Security System (E2EE + KeyVault)          │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## Компоненты

### 💾 Memory System (`memory_system.py`)

Долгосрочная память с поддержкой:
- SQLite-хранилище (до 100k+ записей)
- Векторный поиск через embedding hash
- Иерархия памяти: episodes → facts → insights → plans
- Консолидация и обобщение
- Context window до 1,000,000 токенов
- Session management (1000+ запросов)

```python
from ai_engine.agent import MemoryManager, MemoryType, Importance

mgr = MemoryManager()
mgr.start_session("user_123")

# Запоминаем
mgr.remember(
    "E2EE шифрование обязательно для мессенджеров",
    memory_type=MemoryType.FACT,
    importance=Importance.CRITICAL,
)

# Вспоминаем
results = mgr.recall("шифрование")
```

### 🧠 Brain System (`brain_system.py`)

"Единый мозг" агента:
- Глубокое исследование тем
- Архитектурное проектирование
- Cost-based AI routing (ollama → openai → claude)
- Дебаты с самим собой
- Knowledge graph

```python
from ai_engine.agent import BrainSystem

brain = BrainSystem(llm=my_llm, web_search=search)

# Думаем глубоко
result = brain.think("Создай безопасный мессенджер", depth="deep")

# Дебаты
debate = brain.debate("Мессенджер должен быть децентрализованным")
```

### 🔬 Research System (`research_system.py`)

Исследовательская система:
- Мульти-запросы (до 10 параллельно)
- Чтение URL и книг
- Fact-checking
- Intelligent snippet extraction
- Source ranking

```python
from ai_engine.agent import ResearchManager

rm = ResearchManager()
result = rm.investigate("Python async best practices", deep=True)
```

### 🔐 Security System (`security_system.py`)

Безопасность и ключи:
- KeyVault (HSM-like, шифрование ключей)
- E2EE шифрование (AES-256-GCM, XChaCha20-Poly1305)
- Security аудит кода
- DNS аудит
- Blacklist паттернов (утечки ключей)

```python
from ai_engine.agent import SecuritySystem

security = SecuritySystem()

# Генерируем ключ
key = security.generate_session_key()

# Аудит кода
audit = security.audit_code("password = 'hardcoded'")

# Тест шифрования
test = security.test_encryption(key.id)
```

### 🛠️ Инструменты (25+)

| Инструмент | Описание |
|-----------|----------|
| `calculator` | Математика (safe eval) |
| `current_datetime` | Текущее время |
| `web_search` | DuckDuckGo |
| `code_executor` | Python sandbox (5s) |
| `text_analyzer` | Статистика текста |
| **НОВЫЕ:** |||
| `deep_research` | Глубокое исследование |
| `read_url` | Чтение URL |
| `think` | Мозг агента |
| `remember` | В долгосрочную память |
| `recall` | Поиск в памяти |
| `debate` | Критические дебаты |
| `audit_security` | Аудит безопасности |
| `generate_key` | Криптографический ключ |
| `encrypt_message` | E2EE шифрование |
| `decrypt_message` | E2EE расшифровка |
| `design_architecture` | Проектирование системы |
| `fact_check` | Проверка фактов |
| `memory_stats` | Статистика памяти |
| `brain_dump` | Дамп мозга |
| `test_encryption` | Тест шифрования |
| `dns_audit` | Аудит DNS |
| `get_plan` | Архитектурный план |
| `read_topics` | Чтение нескольких тем |
| `learn_from_experience` | Обучение на опыте |

## Пример: Создание мессенджера "на 10000 шагов вперёд"

```python
from ai_engine.agent import (
    ReActAgent, ToolRegistry,
    MemoryManager, BrainSystem,
    SecuritySystem, ResearchManager
)

# Инициализация
registry = ToolRegistry()
brain = BrainSystem(llm=llm_callable, web_search=web_search)
security = SecuritySystem()
memory = MemoryManager()

# 1. Начинаем сессию
memory.start_session("user_creator")

# 2. Генерируем ключ для мессенджера
key = security.generate_session_key()

# 3. Глубокое исследование
research_result = brain.think(
    "Создай безопасный мессенджер с E2EE, WebSocket, сервером, базой данных", 
    depth="deep"
)

# Результат включает:
# - Полная архитектура
# - Компоненты (frontend, backend, DB, websocket)
# - Потоки данных
# - Модель безопасности
# - Инфраструктура
# - Недостающие функции
# - DNS настройки
# - E2EE шифрование

# 4. Запоминаем вывод
memory.remember(
    research_result,
    memory_type=MemoryType.ARCHITECTURE,
    importance=Importance.CRITICAL,
)

print(research_result)
```

### ReAct промпт формат (расширенный)

```
Thought: [рассуждение с учётом памяти]
Action: think
Action Input: {"problem": "Создай мессенджер", "depth": "deep"}
Observation: [архитектурный план от мозга]
...
Thought: Теперь нужен ключ для шифрования
Action: generate_key
Action Input: {"key_type": "session", "level": "secret"}
Observation: Ключ создан: abc123
Thought: Теперь создам код
Action: code_executor
Action Input: {"code": "..."}
...
Final Answer: [готовый мессенджер]
```

## Cost-based Routing

```python
#Автоматический выбор провайдера
# TRIVIAL/SIMPLE → ollama (бесплатно)
# MEDIUM → litellm (бесплатно)
# COMPLEX → openai/gpt-4
# IMPOSSIBLE → claude-3-opus

brain.select_provider(TaskComplexity.COMPLEX)  # → openai
```

## Безопасность

### Заблокированные паттерны в коде
```python
BLACKLIST = [
    r"sk-[a-zA-Z0-9]+",      # OpenAI ключ
    r"ghp_[a-zA-Z0-9]+",     # GitHub token
    r'password\s*=\s*"',      # Hardcoded password
    r'\beval\s*\(',           # eval()
]
```

### E2EE Шифрование
- AES-256-GCM (fallback)
- XChaCha20-Poly1305 (рекомендуется)
- Ключи хранятся в KeyVault
- Аудит всех операций

## Использование

```python
from ai_engine.agent import ReActAgent, ToolRegistry

def my_llm(prompt: str) -> str:
    # Ваш LLM (openai, anthropic, ollama...)
    return llm.chat(prompt)

registry = ToolRegistry()
agent = ReActAgent(llm_callable=my_llm, tool_registry=registry, max_steps=20)

result = agent.run("Создай мессенджер с E2EE шифрованием")

print(result.final_answer)
print(f"Шагов: {len(result.steps)}, Успех: {result.success}")
```

## Дополнительные рекомендации

### 1. Самообучение (Self-Learning)
- ✅Агент учится на каждом запросе через `learn_from_experience`
- ✅Инсайты сохраняются в долгосрочную память
- ✅ `memory.consolidate()` создаёт обобщения из повторяющихся паттернов

### 2. Критическое мышление
- ✅ `brain.debate()` — защита позиции + критика + итог
- ✅ Полезно для архитектурных решений

### 3. Fact-Checking
- ✅ `researcher.fact_check()` проверяет факты
- ✅ Ищет подтверждения и опровержения

### 4. Security-First
- ✅ Аудит кода при генерации
- ✅ E2EE шифрование обязательно
- ✅ no secrets в production

### 5. Архитектура "на 10000 шагов вперёд"
- ✅ `think(depth="deep")` прорабатывает полную архитектуру
- ✅ Все компоненты, потоки, безопасность
- ✅ DNS, CDN, деплой

---

## Технические детали

| Параметр | Значение |
|----------|----------|
| Max context tokens | 1,000,000 |
| Max session requests | 1,000 |
| Memory entries | 100,000+ |
| Max steps (ReAct) | 20 |
| Code timeout | 5 сек |
| Search results | 10 |
| Research depth | 10 |

## Установка

```bash
pip install cryptography httpx
```

## Лицензия

MIT