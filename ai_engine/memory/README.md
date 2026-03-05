# Memory System — Многоуровневая память AI агента

## Обзор

Трёхуровневая система памяти, имитирующая когнитивную архитектуру:

| Тип | Аналог | Хранит | Персистентность |
|-----|--------|--------|-----------------|
| Working Memory | Рабочая память | Текущая сессия | В памяти (RAM) |
| Episodic Memory | Эпизодическая память | История сессий | JSON файл |
| Semantic Memory | Семантическая память | База знаний | JSON файл |

## Архитектура

```
┌──────────────────────────────────────────────────┐
│                MemoryManager                     │
│                                                  │
│  process_message() ──► WorkingMemory             │
│                   ──► SemanticMemory (auto)      │
│                                                  │
│  get_relevant_context() ◄── WorkingMemory        │
│                         ◄── EpisodicMemory.recall│
│                         ◄── SemanticMemory       │
│                         ◄── UserProfile          │
│                                                  │
│  end_session() ──► EpisodicMemory.store_episode  │
│               ──► save(JSON)                     │
└──────────────────────────────────────────────────┘
```

## Компоненты

### `WorkingMemory`
- Скользящее контекстное окно (max_tokens=4096)
- Автоматическое обрезание старых сообщений
- Подсчёт токенов (~4 символа = 1 токен)
- `summarize()` — краткое резюме сессии

### `EpisodicMemory`
- Поиск по TF-IDF cosine similarity (sklearn) или keyword fallback
- Построение UserProfile из всех эпизодов
- Взвешенный поиск: score × importance_score

### `SemanticMemory`
- Организация по темам: `dict[topic -> list[Fact]]`
- Belief revision: `update_belief(fact_id, new_confidence)`
- Export/import для переноса знаний

### `MemoryManager`
- Единый входной API для всех типов
- Автосохранение при `end_session()`
- `get_enriched_prompt()` — обогащение промпта контекстом
- Автоматическая экстракция фактов из ответов ассистента

## Использование

```python
from ai_engine.memory import MemoryManager

manager = MemoryManager(storage_path="./memory_data")

# Обработка диалога
manager.process_message("user", "Что такое RAG?")
manager.process_message("assistant", "RAG — Retrieval-Augmented Generation...")

# Добавление знания
manager.add_knowledge("rag", "RAG использует векторный поиск", confidence=0.9)

# Обогащение промпта
enriched = manager.get_enriched_prompt("Ты AI ассистент.", "как работает RAG")

# Завершение сессии (автосохранение)
manager.end_session()
```

## Персистентность

```
./memory_data/
├── episodic_memory.json   # История сессий
└── semantic_memory.json   # База знаний
```

Данные сохраняются автоматически при вызове `end_session()`.
При следующем запуске MemoryManager загружает данные автоматически.
