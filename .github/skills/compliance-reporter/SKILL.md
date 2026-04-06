---
name: compliance-reporter
description: "Аудит соответствия требованиям: GDPR/ФЗ-152 (персональные данные), согласие пользователя, право на удаление, политика конфиденциальности, Supabase compliance, хранение данных. Use when: GDPR, ФЗ-152, compliance, персональные данные, согласие, право на удаление, privacy."
argument-hint: "[регулятор: GDPR | ФЗ-152 | BOTH | all]"
user-invocable: true
---

# Compliance Reporter — Соответствие нормативным требованиям

Мессенджер обрабатывает персональные данные: имена, телефоны, сообщения, медиа, геолокация. Это влечёт обязательства по GDPR (EU) и ФЗ-152 (РФ).

---

## Инвентаризация персональных данных

```sql
-- Найти все таблицы с потенциальными ПДн
SELECT
  t.table_name,
  string_agg(c.column_name, ', ') AS personal_data_columns
FROM information_schema.tables t
JOIN information_schema.columns c ON c.table_name = t.table_name
WHERE t.table_schema = 'public'
  AND c.column_name ILIKE ANY(ARRAY['%email%', '%phone%', '%name%', '%birth%',
                                    '%address%', '%location%', '%ip%', '%device%'])
GROUP BY t.table_name
ORDER BY t.table_name;
```

### Карта данных (Data Map)

| Категория ПДн | Таблицы | Основание обработки | Срок хранения |
|---|---|---|---|
| Идентификаторы (email, phone) | auth.users, profiles | Договор (ч.5 ст.6 ФЗ-152) | Пока аккаунт активен |
| Имя, аватар | profiles | Договор + согласие | Пока аккаунт активен |
| Сообщения | messages | Договор | 3 года или по запросу |
| Геолокация | profiles (last_location) | Согласие | Сессия или явный выбор |
| Платёжные данные | transactions | Договор | 5 лет (налоговое) |
| Логи активности | audit_logs | Легитимный интерес | 1 год |

---

## GDPR Чеклист

### Lawful Basis (Правовое основание)
- [ ] Каждая категория ПДн имеет документированное основание
- [ ] Согласие (если используется) — активное, конкретное, отзываемое

### Rights of Data Subjects (Права субъектов)
- [ ] **Право знать**: что собираем — Privacy Policy актуальна
- [ ] **Право на доступ**: пользователь может скачать свои данные
- [ ] **Право на удаление** ("быть забытым"): реализовано удаление аккаунта
- [ ] **Право на перенос**: экспорт данных в машиночитаемом формате
- [ ] **Право на возражение**: opt-out из маркетинговых коммуникаций

### Technical Measures
- [ ] Шифрование в transit (TLS 1.2+)
- [ ] Шифрование at rest (Supabase — шифрование по умолчанию)
- [ ] E2EE для личных сообщений
- [ ] Принцип минимизации данных (не больше чем нужно)
- [ ] Pseudonymization где возможно (UUID вместо имён в логах)

### Data Breach
- [ ] Процедура обнаружения и уведомления (72ч для GDPR)
- [ ] Контакт DPO (Data Protection Officer) если нужен

---

## ФЗ-152 Чеклист (Россия)

```
Россия — Федеральный закон № 152-ФЗ "О персональных данных"
```

- [ ] **Локализация данных**: ПДн граждан РФ обрабатываются на серверах в РФ
  - Supabase: выбрать регион `eu-central-1` (Франкфурт) или использовать Timeweb Cloud
  - Актуально если среди пользователей есть граждане РФ
- [ ] **Уведомление Роскомнадзора**: подача в реестр операторов ПДн
- [ ] **Согласие субъекта**: письменное (электронная форма) при регистрации
- [ ] **Политика обработки ПДн**: опубликована и актуальна
- [ ] **Срок хранения**: определён и соблюдается
- [ ] **Уничтожение при отзыве согласия**: процедура реализована

---

## Реализация: Право на удаление

```sql
-- Хранимая процедура полного удаления пользователя
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Удалить медиафайлы (через Storage API — в Edge Function)
  -- Удалить сообщения
  DELETE FROM messages WHERE sender_id = p_user_id;
  -- Анонимизировать историю (для целостности групповых чатов)
  UPDATE messages SET sender_id = NULL, content = '[удалено]'
    WHERE sender_id = p_user_id AND deleted_at IS NULL;
  -- Удалить профиль
  DELETE FROM profiles WHERE id = p_user_id;
  -- Удалить E2EE ключи
  DELETE FROM user_key_bundles WHERE user_id = p_user_id;
  -- Auth пользователь удаляется через admin API
END;
$$;
```

---

## Реализация: Экспорт данных

```typescript
// Edge Function: export-my-data
// Возвращает JSON со всеми данными пользователя
async function exportUserData(userId: string, supabase: any) {
  const [profile, messages, channels] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('messages').select('*').eq('sender_id', userId).limit(10000),
    supabase.from('channel_members').select('channel_id').eq('user_id', userId),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    messages: messages.data,
    channels: channels.data,
    // НЕ включаем: пароли, токены, ключи
  };
}
```

---

## Cookies & Consent

```typescript
// Для cookies требуется явное согласие (GDPR, ePR)
// Supabase Auth хранит JWT в localStorage — не cookie — согласие не требуется
// Но: analytics cookies (если используются) — требуют consent

// Проверить используемые cookies
document.cookie; // в браузере
// Если используется Amplitude/Mixpanel/Google Analytics — нужен cookie banner
```

---

## Отчёт по соответствию

```markdown
## Privacy Compliance Status
Дата: [дата]

### GDPR: [PARTIAL / COMPLIANT / NON-COMPLIANT]
- ✅ Основания обработки задокументированы
- ✅ Privacy Policy актуальна
- ⚠️ Экспорт данных не реализован в UI (только API)
- ❌ Cookie consent banner отсутствует

### ФЗ-152: [PARTIAL / COMPLIANT / NON-COMPLIANT]
- ⚠️ Серверы вне РФ (Supabase Frankfurt)
- ❌ Уведомление РКН не подано
- ✅ Согласие при регистрации реализовано

### Приоритетные действия:
1. Реализовать UI для скачивания личных данных
2. Рассмотреть локализацию данных РФ-пользователей
```
