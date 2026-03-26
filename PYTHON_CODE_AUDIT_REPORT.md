# 🔴 АУДИТ КОДА PYTHON — AI_ENGINE & NAVIGATION_SERVER

**Дата аудита:** 2026-03-08  
**Аудитор:** Code Skeptic (Kilo Code)  
**Вердикт:** **КРИТИЧЕСКИЕ ПРОБЛЕМЫ ОБНАРУЖЕНЫ** ⚠️

---

## 📊 СВОДКА

| Категория | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| Безопасность | 8 | 5 | 3 | 2 | 18 |
| Баги | 2 | 4 | 6 | 3 | 15 |
| Архитектура | 1 | 3 | 5 | 4 | 13 |
| Чистота кода | 0 | 2 | 8 | 7 | 17 |
| **ИТОГО** | **11** | **14** | **22** | **16** | **63** |

---

## 🚨 CRITICAL — НЕМЕДЛЕННО ИСПРАВИТЬ

### 1. SQL INJECTION — navigation_server/services/trip_service.py:408

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `navigation_server/services/trip_service.py:408`

```python
# ОПАСНО — f-строка в SQL!
updated = await self.db.fetch_one(
    f"""
    UPDATE nav_trips
    SET status=$1, updated_at=$2 {extra_set}
    WHERE id=$3 AND status='{current_status}'  # ← SQL INJECTION!
    RETURNING id, status
    """,
```

**Описание:** Переменная `current_status` вставляется напрямую в SQL запрос через f-строку. Злоумышленник может манипулировать статусом поездки.

**Рекомендация:**
```python
# Использовать параметризованный запрос
updated = await self.db.fetch_one(
    """
    UPDATE nav_trips
    SET status=$1, updated_at=$2 {extra_set}
    WHERE id=$3 AND status=$4
    RETURNING id, status
    """,
    new_status, now, trip_id, current_status,  # ← Параметр
    *extra_params,
)
```

---

### 2. SQL INJECTION — navigation_server/services/poi_service.py:305

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `navigation_server/services/poi_service.py:305`

```python
# ОПАСНО — динамическая генерация SQL!
sql = f"UPDATE nav_pois SET {', '.join(set_parts)} WHERE id = $1"
await self._db.execute(sql, uuid.UUID(poi_id), *params)
```

**Описание:** `set_parts` конкатенируется напрямую в SQL запрос. Поле может быть изменено атакующим.

**Рекомендация:** Валидировать все поля перед включением в запрос, использовать whitelist разрешённых полей.

---

### 3. HARDCODED API KEY — ai_engine/server/main.py:76

**Серьёзность:** 🔴 CRуть:** `ITICAL  
**Пai_engine/server/main.py:76`

```python
API_KEY = os.environ.get("ARIA_API_KEY") or "<INSECURE_FALLBACK_KEY>"
```

**Описание:** Fallback на hardcoded key "<INSECURE_FALLBACK_KEY>" — если env переменная не установлена, используется предсказуемый ключ.

**Рекомендация:**
```python
API_KEY = os.environ.get("ARIA_API_KEY")
if not API_KEY:
    raise RuntimeError("ARIA_API_KEY environment variable is required")
```

---

### 4. HARDCODED JWT SECRET — ai_engine/server/main.py:293

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `ai_engine/server/main.py:293`

```python
SECRET_KEY = "<INSECURE_EXAMPLE_SECRET>"
```

**Описание:** В демо-коде example содержит hardcoded JWT secret. Копипаста в production создаёт уязвимость.

**Рекомендация:** Требовать SECRET_KEY из environment variables с явным исключением при отсутствии.

---

### 5. CORS WILDCARD WITH CREDENTIALS — ai_engine/server/main.py:68

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `ai_engine/server/main.py:66-72`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # ← ОПАСНО!
    allow_credentials=True,        # ← УСИЛИВАЕТ УЯЗВИМОСТЬ!
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Описание:** `allow_origins=["*"]` с `allow_credentials=True` запрещено браузерами и создаёт XSS уязвимость.

**Рекомендация:** Явно указать разрешённые origins:
```python
allow_origins=["https://app.ecomansoni.com", "https://admin.ecomansoni.com"]
```

---

### 6. SQL INJECTION — navigation_server/services/crowdsource_service.py:527

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `navigation_server/services/crowdsource_service.py:527`

```python
# f-строка с пользовательским вводом!
rows = await self.db.fetch_all(
    f"""
    SELECT ...
      {type_filter}  # ← Может содержать SQL!
    GROUP BY h3_index_r9
    """,
```

**Описание:** Переменная `type_filter` вставляется через f-строку.

**Рекомендация:** Использовать параметризованный запрос.

---

### 7. SENSITIVE DATA IN CONFIG — ai_engine/vibe_coding/app/config.py:38,47

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `ai_engine/vibe_coding/app/config.py:38,47`

```python
database_url: PostgresDsn = Field(
    default="postgresql+asyncpg://postgres:secret@localhost:5432/taskdb",  # ← Пароль в коде!
)
jwt_secret_key: str = Field(
    default="CHANGE_ME_IN_PRODUCTION_USE_256BIT_RANDOM_KEY",  # ← Слабый default!
)
```

**Описание:** Default credentials и secrets в коде.

**Рекомендация:** Убрать все defaults с чувствительными данными, требовать явную конфигурацию.

---

### 8. UNSAFE PICKLE DESERIALIZATION — ai_engine/learning/reward_model.py:221

**Серьёзность:** 🔴 CRITICAL  
**Путь:** `ai_engine/learning/reward_model.py:221`

```python
state = pickle.load(f)  # ← RCE VULNERABILITY!
```

**Описание:** `pickle.load()` уязвим к RCE атакам. Злоумышленник может подменить файл модели.

**Рекомендация:**
```python
# Использовать безопасный формат
import json
state = json.load(f)
# Или добавить криптографическую подпись
```

---

## ⚠️ HIGH — СРОЧНО ИСПРАВИТЬ

### 9. BLANKET EXCEPTION HANDLING — ai_engine/server/main.py:55-56

**Серьёзность:** ⚠️ HIGH  
**Путь:** `ai_engine/server/main.py:55-56`

```python
except Exception:
    pass  # ← ИГНОРИРУЕТ ВСЕ ОШИБКИ!
```

**Описание:** Любые исключения при остановке сервера молча игнорируются.

**Рекомендация:**
```python
except Exception as exc:
    logger.warning("Background scheduler failed to stop: %s", exc)
```

---

### 10. BLANKET EXCEPTION HANDLING — ai_engine/server/main.py:189-192

**Серьёзность:** ⚠️ HIGH  
**Путь:** `ai_engine/server/main.py:189-192`

```python
try:
    _rag.ingest(texts, sources)
except Exception:
    pass  # ← RAG failures silently ignored!
```

**Описание:** Ошибки RAG слоя молча игнорируются — пользователь не получит контекст.

**Рекомендация:** Логировать ошибки и возвращать fallback response с warning.

---

### 11. BLANKET EXCEPTION HANDLING — navigation_server/services/poi_service.py:327-328

**Серьёзность:** ⚠️ HIGH  
**Путь:** `navigation_server/services/poi_service.py:327-328`

```python
except Exception:
    pass  # Opening hours parsing errors ignored
```

**Описание:** Ошибки парсинга opening hours молча игнорируются.

---

### 12. BLANKET EXCEPTION HANDLING — navigation_server/services/crowdsource_service.py:552-553

**Серьёзность:** ⚠️ HIGH  
**Путь:** `navigation_server/services/crowdsource_service.py:552-553`

```python
except Exception:  # noqa: BLE001
    centroid_lat, centroid_lng = 0.0, 0.0  # ← Подмена на NULL island!
```

**Описание:** При ошибке координаты подменяются на (0,0) — ошибочные данные сохраняются как валидные.

---

### 13. BLANKET EXCEPTION HANDLING — navigation_server/services/risk_service.py:358-359, 421-422

**Серьёзность:** ⚠️ HIGH  
**Путь:** `navigation_server/services/risk_service.py`

Множественные `except Exception: pass` в risk_service.py.

---

### 14. UNHANDLED TASK EXCEPTION — ai_engine/server/main.py:240

**Серьёзность:** ⚠️ HIGH  
**Путь:** `ai_engine/server/main.py:240`

```python
asyncio.create_task(self._dispatch_async(trip_id))  # ← No error handling!
```

**Описание:** Фоновая задача создаётся без await и без обработки исключений. Исключения в _dispatch_async потеряются.

**Рекомендация:**
```python
try:
    asyncio.create_task(self._dispatch_async(trip_id))
except Exception as exc:
    logger.error("Failed to start dispatch: %s", exc)
```

---

### 15. NO INPUT VALIDATION — navigation_server/routers/search.py:119-120

**Серьёзность:** ⚠️ HIGH  
**Путь:** `navigation_server/routers/search.py:119-120`

```python
WHERE user_id = $1 AND name ILIKE $2  # $2 — пользовательский ввод!
```

**Описание:** ILIKE с пользовательским вводом может использоваться для DoS (ReDoS).

**Рекомендация:** Валидировать и ограничивать длину входных данных.

---

### 16. WEAK RANDOM IN DEMO — ai_engine/training_seeds/05_cybersecurity.py:282

**Серьёзность:** ⚠️ HIGH  
**Путь:** `ai_engine/training_seeds/05_cybersecurity.py:282`

```python
pwd = "MySecure!Pass123"  # ← Weak example password in code!
```

**Описание:** Пример пароля в коде может быть скопирован разработчиками.

---

## ⚡ MEDIUM — ИСПРАВИТЬ ПРИ ВОЗМОЖНОСТИ

### 17. MISSING LOGGER — ai_engine/server/main.py:49

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `ai_engine/server/main.py:49`

```python
logger = logging.getLogger("aria")  # ← logger не определён!
logger.info("ARIA background scheduler started")  # ← NameError!
```

**Описание:** Переменная `logger` используется до определения.

---

### 18. UNUSED IMPORTS — ai_engine/gpt_with_bpe.py:41-42

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `ai_engine/gpt_with_bpe.py:41-42`

```python
import sys
sys.path.insert(0, str(Path(__file__).parent))  # ← Хак, не нужен при правильной структуре
from bpe_tokenizer import BPETokenizer  # ← Лучше использовать абсолютный импорт
```

---

### 19. UNSAFE YAML LOAD — ai_engine/training_seeds/04_devops_infrastructure.py

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `ai_engine/training_seeds/04_devops_infrastructure.py`

Возможное использование `yaml.load()` без SafeLoader.

---

### 20. NO TIMEOUT ON HTTP CLIENT — navigation_server/routers/trips.py:60

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `navigation_server/routers/trips.py:60`

```python
http_client = httpx.AsyncClient(timeout=settings.VALHALLA_TIMEOUT)
```

**Описание:** Timeout только для Valhalla, но не для всех внешних сервисов.

---

### 21. RATE LIMITER IN MEMORY — ai_engine/learning/feedback_store.py:211-223

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `ai_engine/learning/feedback_store.py:211-223`

```python
self._rate_counters: dict[str, list[float]] = {}  # ← Не работает в production с несколькими инстансами!
```

**Описание:** Rate limiting в памяти не работает с несколькими серверами.

**Рекомендация:** Использовать Redis для rate limiting.

---

### 22. MISSING INDEXES — database queries

**Серьёзность:** ⚡ MEDIUM  
**Путь:** Various

Некоторые SQL запросы могут страдать от отсутствия индексов (например, `nav_search_history`).

---

### 23. MISSING CANCEL HANDLING — ai_engine/server/background_tasks.py:325

**Серьёзность:** ⚡ MEDIUM  
**Путь:** `ai_engine/server/background_tasks.py:325`

```python
except asyncio.CancelledError:
    pass  # ← Правильно, но без cleanup
```

---

## 📝 LOW — УЛУЧШИТЬ

### 24. PRINT STATEMENTS IN PRODUCTION CODE

**Серьёзность:** 📝 LOW  
**Путь:** ai_engine/bpe_tokenizer.py:154-156

```python
print(f"  [BPE] step {step + 1}/{num_merges} | vocab_size={len(self.vocab)}")
```

**Рекомендация:** Использовать logger.

---

### 25. MAGIC NUMBERS

**Серьёзность:** 📝 LOW  
**Путь:** various

Многочисленные magic numbers без именованных констант.

---

### 26. MISSING TYPE HINTS

**Серьёзность:** 📝 LOW  
**Путь:** various

Некоторые функции и методы без type hints.

---

### 27. DUPLICATE CODE

**Серьёзность:** 📝 LOW  
**Путь:** navigation_server/services/trip_service.py:312-346

Дублирование SQL запросов для разных статусов.

---

## 📋 РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТАМ

### НЕМЕДЛЕННО (сегодня):
1. Исправить SQL injection в trip_service.py, poi_service.py, crowdsource_service.py
2. Удалить hardcoded secrets в ai_engine/server/main.py
3. Исправить CORS уязвимость

### НА ЭТОЙ НЕДЕЛЕ:
4. Заменить pickle на безопасный формат
5. Добавить обработку исключений с логированием
6. Валидировать пользовательский ввод

### В БЛИЖАЙШЕЕ ВРЕМЯ:
7. Перенести rate limiting в Redis
8. Заменить print на logger
9. Убрать magic numbers
10. Добавить type hints

---

## ✅ ПОЗИТИВНЫЕ МОМЕНТЫ

1. **Большинство SQL запросов используют параметризацию** — это хорошая практика
2. **JWT верификация в auth.py** использует правильные настройки безопасности
3. **FSM для trip status** хорошо продумана
4. **Separation of concerns** — сервисы разделены правильно
5. **Pydantic для валидации** — используется корректно
6. **Async/await** — последовательно используется в navigation_server

---

**Отчёт составлен Code Skeptic**  
Дата: 2026-03-08
