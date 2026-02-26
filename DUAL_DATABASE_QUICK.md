# 🚀 Быстрая настройка Dual Database

## Что получится:
- ✅ Звонки работают через Supabase TURN
- ✅ Данные хранятся в Timeweb Cloud (Россия, без VPN)
- ✅ Автоматическое переключение между БД

---

## Шаг 1: Настрой сервер Timeweb

1. **Подключись к серверу:**
```bash
ssh ubuntu@5.42.99.76
```
Пароль: `jWYTEVVE@b1c-_`

2. **Запусти установку:**
Следуй инструкции из [DEPLOY_NOW.md](DEPLOY_NOW.md)

3. **Сохрани JWT Secret** который покажется в конце установки

---

## Шаг 2: Загрузи миграции

**На Windows (PowerShell):**
```powershell
scp "supabase\.temp\all-migrations.sql" ubuntu@5.42.99.76:/tmp/
```

**На сервере:**
```bash
PGPASSWORD='твой_пароль_БД' psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql
```

---

## Шаг 3: Обнови .env.local

Создай файл `.env.local` в корне проекта:

```bash
# Supabase (для Auth и TURN звонков)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k

# Timeweb Cloud (для данных)
VITE_TIMEWEB_API_URL=http://5.42.99.76
VITE_TIMEWEB_API_KEY=<JWT_SECRET из шага 1>

# Опционально
VITE_SENTRY_DSN=
VITE_IMGLY_LICENSE_KEY=
```

---

## Шаг 4: Запусти и проверь

```bash
npm run dev
```

**Проверь в консоли браузера (F12):**
```
[Timeweb] Configuration { enabled: true, apiUrl: "http://5.42.99.76" }
[DB Adapter] Configuration { timewebEnabled: true, mode: "DUAL" }
```

---

## Шаг 5: Обнови импорты (опционально)

Для новых компонентов используй:

### ❌ Старый способ:
```typescript
import { supabase } from '@/integrations/supabase/client';
const { data } = await supabase.from('profiles').select('*');
```

### ✅ Новый способ:
```typescript
import { db } from '@/lib/db';
const { data } = await db.from('profiles').select('*');
```

**Старый код продолжит работать!** Но новый автоматически использует Timeweb.

---

## 🧪 Тест

В консоли браузера:

```javascript
// Импорт модуля
const { db } = await import('./src/lib/db');

// Проверка конфигурации
console.log('Timeweb enabled:', db.config.isTimewebEnabled);

// Тест запроса (должен идти в Timeweb)
const result = await db.from('profiles').select('id').limit(1);
console.log('Result:', result);
```

---

## 🎯 Какие запросы куда идут?

| Операция | База | Почему |
|----------|------|--------|
| `db.auth.*` | Supabase | Auth критичен |
| `db.storage.*` | Supabase | Файлы на Supabase |
| `db.functions.invoke('turn-credentials')` | Supabase | Звонки WebRTC |
| `db.from('turn_credentials')` | Supabase | Звонки WebRTC |
| `db.from('profiles')` | Timeweb | Данные |
| `db.from('messages')` | Timeweb | Данные |
| `db.from('reels')` | Timeweb | Данные |
| `db.rpc('get_reels_feed_v2')` | Timeweb | Данные |

---

## 🔄 Откат (если нужно)

Удали из `.env.local`:
```bash
# VITE_TIMEWEB_API_URL=...
# VITE_TIMEWEB_API_KEY=...
```

Перезапусти `npm run dev` - всё вернется на Supabase.

---

## 📚 Документация

- [DUAL_DATABASE.md](DUAL_DATABASE.md) - Полное описание архитектуры
- [DEPLOY_NOW.md](DEPLOY_NOW.md) - Установка сервера
- [QUICK_START.md](QUICK_START.md) - Подробная инструкция

---

Готово! Теперь данные в России, а звонки работают. 🎉
