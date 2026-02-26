# 🔄 Двойная База Данных: Supabase + Timeweb Cloud

## 📋 Архитектура

Проект теперь поддерживает **две базы данных одновременно**:

### 🟢 Supabase (КРИТИЧНО, не отключать!)
- **Authentication** (вход по телефону, email)
- **TURN Credentials** для WebRTC звонков
- **Storage** (файлы, аватары, медиа)
- **Edge Functions** (phone-auth, turn-credentials)

### 🟦 Timeweb Cloud PostgreSQL (опционально)
- **Profiles** (профили пользователей)
- **Posts** (посты и комментарии)
- **Messages** (чаты и сообщения)
- **Reels** (видео и рекомендации)
- Все остальные данные

---

## 🎯 Зачем это нужно?

1. **Supabase заблокирован в России** - переносим данные в Timeweb
2. **Звонки продолжат работать** через Supabase TURN серверы
3. **Постепенная миграция** - можно тестировать без риска
4. **Fallback** - если Timeweb не настроен, работает через Supabase

---

## 🚀 Как это работает?

### Автоматическая маршрутизация

```typescript
import { db } from '@/lib/db';

// ✅ Автоматически определяет БД
const { data: profiles } = await db.from('profiles').select('*');
// → Идет в Timeweb (если настроен), иначе в Supabase

// ✅ TURN всегда через Supabase
const { data: credentials } = await db.from('turn_credentials').select('*');
// → ВСЕГДА Supabase (критично для звонков!)

// ✅ Auth всегда через Supabase
await db.auth.signInWithPassword({ email, password });
// → ВСЕГДА Supabase

// ✅ Storage всегда через Supabase
await db.storage.from('avatars').upload('file.jpg', file);
// → ВСЕГДА Supabase
```

### Таблицы, закрепленные за Supabase

Эти таблицы **ВСЕГДА** идут через Supabase (даже если Timeweb настроен):

```typescript
const SUPABASE_ONLY_TABLES = [
  'turn_credentials',      // WebRTC звонки
  'user_sessions',         // Сессии устройств
  'device_accounts',       // Мультиаккаунт
];
```

---

## ⚙️ Настройка

### 1. Создай `.env.local` (или `.env`)

```bash
# Supabase (ОБЯЗАТЕЛЬНО - для Auth и звонков)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=твой_анонимный_ключ

# Timeweb Cloud (ОПЦИОНАЛЬНО - для данных)
VITE_TIMEWEB_API_URL=http://5.42.99.76
VITE_TIMEWEB_API_KEY=твой_JWT_secret_из_установки
```

### 2. Режимы работы

#### Режим 1: Только Supabase (по умолчанию)
Если `VITE_TIMEWEB_API_URL` не указан:
```bash
# Не указываем Timeweb - все через Supabase
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=твой_ключ
```

**Результат:** Все данные идут через Supabase (как раньше).

#### Режим 2: Dual Database (гибридный)
Указываем оба:
```bash
# Supabase для Auth + TURN
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=твой_ключ

# Timeweb для данных
VITE_TIMEWEB_API_URL=http://5.42.99.76
VITE_TIMEWEB_API_KEY=твой_JWT_secret
```

**Результат:** 
- Auth, звонки, файлы → Supabase
- Профили, посты, чаты → Timeweb

---

## 🔧 Миграция кода (для разработчиков)

### Старый код (НЕ рекомендуется)
```typescript
import { supabase } from '@/integrations/supabase/client';

const { data } = await supabase.from('profiles').select('*');
```
**Проблема:** Всегда идет в Supabase, игнорирует Timeweb.

### Новый код (рекомендуется)
```typescript
import { db } from '@/lib/db';

const { data } = await db.from('profiles').select('*');
```
**Преимущество:** Автоматически выбирает правильную БД.

### Обратная совместимость

Старый код продолжит работать! Но для новых запросов используй `db`:

```typescript
// Оба варианта работают, но db - лучше
import { supabase } from '@/lib/supabase';  // ✅ Старый способ
import { db } from '@/lib/db';              // ✅ Новый способ (рекомендуется)
```

---

## 📊 Примеры использования

### Пример 1: Получение профилей
```typescript
import { db } from '@/lib/db';

// Автоматически из Timeweb (если настроен)
const { data: profiles } = await db.from('profiles')
  .select('*')
  .eq('id', userId);
```

### Пример 2: Загрузка файла
```typescript
import { db } from '@/lib/db';

// ВСЕГДА через Supabase Storage
const { data } = await db.storage
  .from('avatars')
  .upload(`${userId}/avatar.jpg`, file);
```

### Пример 3: Вход пользователя
```typescript
import { db } from '@/lib/db';

// ВСЕГДА через Supabase Auth
const { data } = await db.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
});
```

### Пример 4: Получение TURN credentials
```typescript
import { db } from '@/lib/db';

// ВСЕГДА через Supabase (критично для звонков!)
const { data } = await db.functions.invoke('turn-credentials', {
  body: { ttl: 3600 },
});
```

### Пример 5: RPC функция
```typescript
import { db } from '@/lib/db';

// Через Timeweb (если настроен)
const { data } = await db.rpc('get_reels_feed_v2', {
  p_user_id: userId,
  p_limit: 10,
});
```

### Пример 6: Прямой доступ к клиенту
```typescript
import { db } from '@/lib/db';

// Если нужен конкретный клиент
const supabaseClient = db.clients.supabase;
const timewebClient = db.clients.timeweb;

// Проверка конфигурации
if (db.config.isTimewebEnabled) {
  console.log('Timeweb активен');
}
```

---

## 🧪 Тестирование

### Проверка в консоли браузера

Открой DevTools (F12) и выполни:

```javascript
// Проверка подключений
import { db } from './src/lib/db';

console.log('Timeweb enabled:', db.config.isTimewebEnabled);

// Тест запроса
const { data, error } = await db.from('profiles').select('*').limit(1);
console.log('Data:', data, 'Error:', error);
```

### Проверка логов

После запуска `npm run dev` в консоли должно быть:

```
[Timeweb] Configuration {
  enabled: true,
  apiUrl: "http://5.42.99.76"
}

[DB Adapter] Configuration {
  timewebEnabled: true,
  mode: "DUAL (Timeweb + Supabase)",
  supabaseOnlyTables: ["turn_credentials", "user_sessions", "device_accounts"]
}
```

---

## 🚨 Важные замечания

### ❌ НЕ ТРОГАЙ эти таблицы!

Никогда не пытайся мигрировать в Timeweb:
- `turn_credentials` - сломаются звонки
- `user_sessions` - сломается Auth
- `device_accounts` - сломается мультиаккаунт

### ✅ Безопасно мигрировать

Можно переносить в Timeweb:
- `profiles`
- `posts`, `post_likes`, `post_comments`
- `messages`, `group_chat_members`
- `reels`, `reel_views`, `reel_likes`
- `stories`, `story_views`
- Все таблицы рекомендаций и аналитики

---

## 📝 Чек-лист миграции

- [ ] Установил PostgreSQL на Timeweb (см. [QUICK_START.md](QUICK_START.md))
- [ ] Применил миграции на Timeweb
- [ ] Добавил `VITE_TIMEWEB_API_URL` и `VITE_TIMEWEB_API_KEY` в `.env.local`
- [ ] Запустил `npm run dev` и проверил логи
- [ ] Протестировал вход (должен работать)
- [ ] Протестировал звонки (должны работать через TURN)
- [ ] Протестировал загрузку профилей (должны идти из Timeweb)
- [ ] Добавил переменные в GitHub Actions Secrets (для деплоя)

---

## 🔄 Откат (если что-то пошло не так)

### Быстрый откат
Убери из `.env.local`:
```bash
# Закомментируй или удали эти строки
# VITE_TIMEWEB_API_URL=http://5.42.99.76
# VITE_TIMEWEB_API_KEY=...
```

Перезапусти:
```bash
npm run dev
```

Всё вернется на Supabase автоматически!

---

## 📚 Дополнительная документация

- [QUICK_START.md](QUICK_START.md) - Быстрая установка БД на Timeweb
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Подробная инструкция по миграции
- [CHEAT_SHEET.txt](CHEAT_SHEET.txt) - Шпаргалка по командам

---

## 🆘 Troubleshooting

### Проблема: "Cannot read property 'from' of null"

**Причина:** `VITE_TIMEWEB_API_URL` или `VITE_TIMEWEB_API_KEY` не заданы правильно.

**Решение:** 
1. Проверь `.env.local`
2. Перезапусти `npm run dev`
3. Если не помогло, закомментируй Timeweb переменные (откат на Supabase)

### Проблема: "CORS error" при запросах

**Причина:** Nginx на Timeweb не настроен правильно.

**Решение:** Проверь `/etc/nginx/sites-available/mansoni-api` на сервере:
```nginx
add_header 'Access-Control-Allow-Origin' 'https://mansoni.ru' always;
```

### Проблема: Звонки не работают

**Причина:** TURN credentials не доступны.

**Решение:** 
1. Проверь, что `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` заданы
2. Проверь логи: TURN должен идти через Supabase, а не Timeweb
3. Убедись что таблица `turn_credentials` в коде использует `db.from()`, а не прямой Timeweb клиент

---

Готово! Теперь у тебя dual database setup с сохранением WebRTC звонков. 🎉
