---
name: secrets-rotation
description: "Ротация секретов: API ключи, Supabase service_role, JWT secret, Stripe ключи, push сертификаты — процедура смены, проверка утечек, vault management. Use when: ротация, rotate secrets, скомпрометированный ключ, update API key, vault."
argument-hint: "[тип секрета: supabase | stripe | jwt | push | all]"
user-invocable: true
---

# Secrets Rotation — Управление и ротация секретов

Ротация секретов минимизирует окно exposure при компрометации. Должна быть автоматизирована или хорошо задокументирована.

---

## Инвентаризация секретов проекта

```bash
# Все секреты в .env файлах
cat .env.local 2>/dev/null | grep -v "^#" | grep "=" | cut -d= -f1

# Переменные Edge Functions
grep -rn "Deno\.env\.get(" supabase/functions/ --include="*.ts" | grep -oP "'([^']+)'" | sort -u

# Переменные в GitHub Secrets (если есть CI)
cat .github/workflows/*.yml 2>/dev/null | grep "secrets\." | grep -oP "secrets\.\w+" | sort -u
```

### Полный список секретов проекта

| Секрет | Место хранения | Срок действия | Последняя ротация |
|---|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | Edge Functions env | Бессрочно | Вручную |
| SUPABASE_JWT_SECRET | Edge Functions env | Бессрочно | Вручную |
| SUPABASE_DB_PASSWORD | DB connection | Бессрочно | Вручную |
| ANTHROPIC_API_KEY | Edge Functions env | По необходимости | — |
| STRIPE_SECRET_KEY | Edge Functions env | По необходимости | — |
| FCM_SERVER_KEY | Edge Functions env | По необходимости | — |
| MEILI_MASTER_KEY | Edge Functions env | По необходимости | — |
| SFU_SHARED_SECRET | server/.env | По необходимости | — |

---

## Процедура: Проверка утечки

```bash
# 1. Проверить git history
git log --all -p -- ".env" ".env.local" ".env.production" 2>/dev/null | \
  grep "^+" | grep -v "^+++" | grep "KEY\|SECRET\|TOKEN\|PASSWORD\|PASS\s*="

# 2. Просмотреть все файлы
git grep -l "SUPABASE_SERVICE_ROLE\|service_role_key\|sk_live_" -- "*.ts" "*.tsx" "*.js"

# 3. Проверить .env.example
diff <(cat .env.example | grep -v "^#" | cut -d= -f1 | sort) \
     <(cat .env.local 2>/dev/null | grep -v "^#" | cut -d= -f1 | sort)

# 4. GitHub Actions logs — secrets не должны попадать
# Идти: Settings → Secrets → Audit log
```

---

## Процедура ротации: Supabase Service Role Key

⚠️ **Высокий риск** — используется во всех Edge Functions

```powershell
# 1. ПОДГОТОВКА: собрать все места использования
grep -rn "SERVICE_ROLE_KEY\|SUPABASE_SERVICE_ROLE" supabase/functions/ --include="*.ts" -l

# 2. Получить новый ключ
# Dashboard → Settings → API → Service Role Key → Reveal → Rotate

# 3. Обновить в Supabase Edge Function secrets
$newKey = Read-Host -AsSecureString "Новый Service Role Key"
# supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$newKey" --project-ref lfkbgnbjxskspsownvjm

# 4. Обновить в локальном .env.local
# (редактировать вручную)

# 5. Обновить в GitHub Secrets (если используется в CI)
# gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$newKey"

# 6. Redeploy Edge Functions (они читают secrets при запуске)
# supabase functions deploy --all --project-ref lfkbgnbjxskspsownvjm

# 7. Проверить что функции работают
# Запустить тест-запрос к каждой критической функции
```

---

## Процедура ротации: JWT Secret

⚠️ **Максимальный риск** — смена инвалидирует ВСЕ активные сессии

```sql
-- ВНИМАНИЕ: После смены JWT secret все пользователи будут разлогинены!
-- Запланировать в maintenance window или предупредить пользователей

-- 1. Supabase Dashboard → Settings → API → JWT Secret → Rotate
-- 2. Все refresh токены инвалидируются
-- 3. Пользователи будут перелогинены автоматически при следующем запросе
```

**Чеклист до ротации JWT:**
- [ ] Уведомить пользователей (если возможно)
- [ ] Выбрать время с минимальным трафиком
- [ ] Мониторинг 401 ошибок после ротации
- [ ] Rollback план (restore old secret если что-то сломалось)

---

## Процедура ротации: Stripe Keys

```bash
# 1. Stripe Dashboard → Developers → API keys → Roll API key
# 2. Скопировать новый secret key (показывается только раз!)
# 3. Обновить в supabase secrets
# Старый ключ остаётся активным несколько дней (grace period)
```

---

## Обнаружение: Используется ли секрет в коде?

```bash
# Паттерн: проверить что секреты ТОЛЬКО через env var
grep -rn "sk_live\|sk_test" src/ --include="*.ts" --include="*.tsx"  # должно быть 0
grep -rn "SUPABASE_SERVICE_ROLE" src/ --include="*.ts" --include="*.tsx"  # должно быть 0

# Правильный паттерн в Edge Function:
# const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
# if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
```

---

## Vault Management (Advanced)

### Supabase Vault для sensitive данных в БД

```sql
-- Supabase Vault для шифрования sensitive данных в БД
-- Доступно через vault schema

-- Записать секрет
SELECT vault.create_secret('api-key-stripe', 'sk_live_...');

-- Прочитать секрет (только в SECURITY DEFINER функциях)
SELECT decrypted_secret FROM vault.decrypted_secrets
WHERE name = 'api-key-stripe';
```

---

## Чеклист Security

### Критически важно
- [ ] Нет секретов в git history
- [ ] Нет секретов в client-side коде (src/)
- [ ] Service role key ТОЛЬКО в Edge Functions (Deno.env.get)
- [ ] .env файлы в .gitignore

### Ротация (ежеквартально)
- [ ] Supabase Service Role Key — ротировать каждые 6 месяцев
- [ ] Stripe Secret Key — при любых подозрениях
- [ ] API ключи третьих сторон — по их рекомендациям

### При компрометации (немедленно)
1. Ротировать скомпрометированный ключ
2. Проверить audit logs на несанкционированное использование
3. Уведомить пользователей если их данные затронуты
4. Задокументировать инцидент
