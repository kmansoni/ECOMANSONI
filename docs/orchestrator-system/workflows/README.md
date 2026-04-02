# Рабочие процессы (Workflows)

> Типовые сценарии использования системы, шаблоны задач и best practices для продуктивной работы с AI агентом.

---

## Содержание

- [Обзор](#обзор)
- [Workflow: Реализация фичи](#workflow-реализация-фичи)
- [Workflow: Отладка ошибки](#workflow-отладка-ошибки)
- [Workflow: Code Review](#workflow-code-review)
- [Workflow: Написание тестов](#workflow-написание-тестов)
- [Workflow: Рефакторинг](#workflow-рефакторинг)
- [Workflow: Исследование кодовой базы](#workflow-исследование-кодовой-базы)
- [Workflow: Документирование](#workflow-документирование)
- [Шаблоны задач](#шаблоны-задач)
- [Best Practices](#best-practices)
- [Anti-patterns](#anti-patterns)

---

## Обзор

Каждый рабочий процесс (workflow) — это **типовой сценарий** взаимодействия пользователя с агентной системой. Система автоматически определяет тип workflow и активирует нужных агентов.

```
Пользовательский запрос
        │
        ▼
  Workflow Classifier
  ├── feature_implementation
  ├── bug_fixing
  ├── code_review
  ├── test_writing
  ├── refactoring
  ├── codebase_exploration
  └── documentation
        │
        ▼
  DAG Builder → Параллельное выполнение агентов
        │
        ▼
  Synthesizer → Финальный результат
```

---

## Workflow: Реализация фичи

**Триггер**: "Напиши", "Реализуй", "Добавь функцию/метод/класс"

### DAG выполнения

```
research_codebase
        │
        ▼
  analyze_patterns ──────────────────────────────┐
        │                                         │
  ┌─────▼──────┐  ┌──────────────────────┐        │
  │ write_code │  │ write_types/interfaces│        │
  └─────┬──────┘  └──────────┬───────────┘        │
        │                    │                    │
        └──────────┬─────────┘                    │
                   ▼                              │
             write_tests  ◄────────────────────────┘
                   │
                   ▼
           run_tests_verify
                   │
                   ▼
         update_documentation
```

### Пример диалога

```
👤 Пользователь: Напиши функцию для отправки email через SMTP с поддержкой
                 HTML и вложений

🤖 Агент: Понял. Несколько уточнений:
   1. Использовать sync или async (asyncio)?
   2. Нужны ли retry при ошибках?

   → [Async + retry] [Sync, просто] [Async без retry]

👤 Пользователь: Async + retry

🤖 Агент: [Research Phase] Изучаю существующий email код...
          Нашёл: src/email/sender.py использует smtplib
          Паттерн проекта: async/await + tenacity для retry

          [Code Phase] Реализую EmailSender...

          ✅ Готово! Создал:
          - src/email/async_sender.py (EmailSender класс)
          - tests/test_async_sender.py (12 тестов, 100% coverage)

          Показать diff?
```

### Агенты, задействованные в workflow

| Агент | Задача |
|-------|--------|
| Research Agent | Анализ existing кода, паттернов проекта |
| Code Implementation Agent | Написание основного кода |
| Test Writing Agent | Написание тестов |
| Terminal Agent | Запуск тестов для верификации |
| Documentation Agent | Обновление docstrings/README |

---

## Workflow: Отладка ошибки

**Триггер**: "Ошибка", "Не работает", "Exception", "Fix", стек трейс в тексте

### DAG выполнения

```
parse_error_context
        │
        ├── read_error_location
        ├── analyze_stack_trace
        └── search_similar_issues
                │
                ▼
        identify_root_cause
                │
                ▼
        ┌───────┴────────┐
        │                │
  propose_fix    check_side_effects
        │                │
        └───────┬─────────┘
                ▼
          apply_fix
                │
                ▼
         run_tests
```

### Пример диалога

```
👤 Пользователь: TypeError: 'NoneType' object is not subscriptable
                 File "src/auth/jwt.py", line 87, in decode_token
                   return payload['user_id']

🤖 Агент: [Читаю jwt.py строка 87...]

          🔍 Диагноз: payload = None — jwt.decode() вернул None

          Причина: флаг verify=False отключает проверку подписи,
          но если токен невалиден, библиотека возвращает None
          вместо выброса исключения.

          Решение:
          ```python
          # Было:
          payload = jwt.decode(token, options={"verify_signature": False})
          return payload['user_id']

          # Стало:
          try:
              payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
          except jwt.InvalidTokenError as e:
              raise AuthError(f"Invalid token: {e}") from e
          return payload['user_id']
          ```

          Применить исправление? [Да] [Показать полный diff] [Нет]
```

---

## Workflow: Code Review

**Триггер**: "Проверь код", "Review", "Что думаешь о", "Есть ли проблемы"

### Структура ревью

```
READ  Читаю файл...
        │
        ▼
ANALYZE
  ├── Correctness    (логические ошибки, edge cases)
  ├── Security       (инъекции, открытые секреты, OWASP)
  ├── Performance    (O(n²) алгоритмы, N+1 запросы)
  ├── Maintainability (naming, complexity, SOLID)
  └── Test Coverage  (непокрытые ветки)
        │
        ▼
REPORT
  ├── 🚨 Critical (блокирует)
  ├── ⚠️ Warning (желательно исправить)
  └── 💡 Suggestion (улучшение)
```

### Формат ревью-отчёта

```markdown
## Code Review: src/auth/jwt.py

### 🚨 Critical (требует исправления)

**[Line 45] SQL Injection**
```python
# Проблема:
query = f"SELECT * FROM users WHERE id = {user_id}"

# Исправление:
query = "SELECT * FROM users WHERE id = $1"
result = await db.fetch(query, user_id)
```

### ⚠️ Warnings

**[Line 23] Hardcoded secret**
`SECRET_KEY = "my-secret-123"` — вынести в переменную окружения

### 💡 Suggestions

**[Lines 60-80] Avoid code duplication**
Функции `validate_access_token()` и `validate_refresh_token()`
дублируют 15 строк. Вынести общую логику.

---
Score: 6/10 | Critical: 1 | Warnings: 3 | Suggestions: 5
```

---

## Workflow: Написание тестов

**Триггер**: "Напиши тесты", "Покрой тестами", "Добавь unit tests"

### DAG выполнения

```
read_source_code
        │
        ▼
  analyze_public_api
        │
        ▼
  identify_test_cases
  ├── happy_path
  ├── edge_cases
  ├── error_cases
  └── boundary_values
        │
        ▼
  ┌─────┴──────┐
  │            │
write_unit  write_integration
  tests         tests
  │            │
  └──────┬──────┘
         ▼
   run_and_verify
```

### Шаблон тест-кейсов

```python
# Автоматически генерируемый шаблон
class TestClassName:
    """Tests for ClassName."""

    # Happy path
    def test_method_name_success(self): ...

    # Edge cases
    def test_method_name_empty_input(self): ...
    def test_method_name_none_input(self): ...
    def test_method_name_max_boundary(self): ...

    # Error cases
    def test_method_name_raises_on_invalid_input(self): ...
    def test_method_name_raises_on_missing_required(self): ...
```

---

## Workflow: Рефакторинг

**Триггер**: "Отрефактори", "Улучши читаемость", "Уменьши сложность"

### Шаги рефакторинга

1. **Анализ**: Измерить цикломатическую сложность, найти дублирование
2. **Планирование**: Определить технику рефакторинга (Extract Method, Rename, etc.)
3. **Тесты перед**: убедиться, что тесты есть (или написать snapshot тесты)
4. **Применение**: поэтапные изменения
5. **Верификация**: все тесты проходят после рефакторинга

```
Техники рефакторинга, которые агент применяет автоматически:

Extract Method        → функция > 30 строк
Extract Variable      → сложное выражение использ. 2+ раз
Rename               → неинформативное имя (tmp, x, data2)
Remove Duplication   → блок кода встречается 2+ раз
Simplify Conditional → вложенность if > 3 уровней
Replace Magic Number → число без константы
Guard Clause         → remove arrow anti-pattern
```

---

## Workflow: Исследование кодовой базы

**Триггер**: "Как работает", "Объясни архитектуру", "Найди где", "Покажи структуру"

### Карта исследования

```
Запрос: "Как реализована аутентификация?"
        │
        ▼
  find_entry_points        ← поиск по "auth", "login", "token"
        │
        ▼
  build_call_graph         ← трассировка вызовов
        │
        ▼
  extract_key_components   ← классы, функции, endpoints
        │
        ▼
  generate_explanation     ← архитектурный обзор
```

### Формат объяснения архитектуры

```markdown
## Архитектура: Аутентификация

### Entry Points
- `POST /api/auth/login` → `AuthController.login()`
- `POST /api/auth/refresh` → `AuthController.refresh()`

### Поток данных
```
login() → validate_credentials() → generate_tokens()
              │                         │
         UserRepository             JWTService
         .find_by_email()           .create_access_token()
                                    .create_refresh_token()
```

### Ключевые файлы
| Файл | Роль |
|------|------|
| `src/auth/jwt.py` | Создание/валидация JWT токенов |
| `src/auth/service.py` | Бизнес-логика аутентификации |
| `src/user/repository.py` | Доступ к данным пользователей |
```

---

## Workflow: Документирование

**Триггер**: "Задокументируй", "Напиши README", "Добавь docstrings"

### Типы документации

| Тип | Триггер | Результат |
|-----|---------|-----------|
| Docstrings | "добавь docstrings" | Google/NumPy style docstrings |
| README | "напиши README для модуля" | Markdown README с примерами |
| API docs | "задокументируй API" | OpenAPI / docstring |
| Architecture | "опиши архитектуру" | ADR или архитектурный обзор |
| Changelog | "обнови CHANGELOG" | CHANGELOG.md в Keep a Changelog формате |

---

## Шаблоны задач

### Формулировки, которые дают лучшие результаты

| Вместо... | Пиши... |
|-----------|---------|
| "Сделай что-нибудь с этим" | "Оптимизируй функцию `parse_csv()` — сейчас O(n²), нужно O(n)" |
| "Исправь всё" | "Исправь ошибки из output pylint в файле auth.py" |
| "Напиши тесты" | "Напиши pytest тесты для класса `EmailSender`, покрытие 100%" |
| "Этот код плохой" | "Отрефактори `process_data()` — убери дублирование, добавь типы" |

### Структура эффективного запроса

```
[Действие] + [Объект] + [Контекст/Ограничения]

Примеры:
✅ "Реализуй пагинацию для endpoint /api/posts — cursor-based, max 20 items"
✅ "Найди все места где используется requests.get без timeout"
✅ "Отрефактори auth.py — вынести валидацию в отдельный класс"

❌ "Сделай получше"
❌ "Почини баги"
❌ "Напиши весь backend"
```

---

## Best Practices

### Для пользователя

1. **Давайте контекст**: укажите файл, если задача касается конкретного кода
2. **Подтверждайте diff**: всегда просматривайте изменения перед применением
3. **Итеративно**: лучше несколько маленьких задач, чем одна огромная
4. **Сохраняйте сессию**: `end_session()` при завершении работы — знания сохранятся
5. **Исправляйте агента**: если результат неверный — скажите конкретно что не так

### Для оркестратора

1. **Research First**: всегда изучать кодовую базу перед действием
2. **Fail Fast**: при невозможности выполнить — сразу сообщить, не тратить время
3. **Atomicity**: каждое изменение файла — отдельная атомарная операция
4. **Rollback**: хранить предыдущую версию файла до изменений

---

## Anti-patterns

| Anti-pattern | Проблема | Решение |
|-------------|----------|---------|
| Большие монолитные задачи | Агент теряет контекст | Декомпозировать на шаги |
| "Исправь всё в проекте" | Неопределённый scope | Указать конкретный файл/модуль |
| Игнорирование diff | Потеря важного кода | Всегда просматривать изменения |
| Работа без тестов | Сложная верификация | Всегда запрашивать тесты |
| Прерывание исследования | Агент действует без контекста | Дать закончить Research Phase |

---

## Связанные разделы

- [Рой агентов](../agents/README.md) — какие агенты задействованы в каждом workflow
- [Ядро оркестратора](../orchestrator-core/README.md) — как строится DAG для workflow
- [Технические спецификации](../technical-specs/README.md) — форматы сообщений

---

*Версия: 1.0.0*
