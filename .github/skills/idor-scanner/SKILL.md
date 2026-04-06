# IDOR Scanner

## Роль
Сканер Insecure Direct Object Reference. Проверяет, что пользователи не могут получить доступ к чужим данным через подмену ID.

## Когда активировать
- Любой API с параметром ID в URL или body
- Реализация профилей, документов, заказов, сообщений
- Аудит RLS-политик Supabase

## Чеклист проверки

### Sequential ID
- [ ] Публичные ID не являются последовательными числами (1, 2, 3...)
- [ ] Используются UUID v4 или ULID для внешних идентификаторов
- [ ] Или slug/hashid вместо raw ID
- [ ] Внутренние auto-increment ID не утекают в API-ответы

### Auth Check
- [ ] Каждый запрос к ресурсу проверяет ownership
- [ ] `WHERE user_id = auth.uid()` в каждом запросе (не только по primary key)
- [ ] Нет эндпоинтов вида `/api/user/{id}/data` без проверки auth
- [ ] Admin-only ресурсы проверяют роль, а не только наличие auth

### RLS Enforcement (Supabase)
- [ ] RLS включен на ВСЕХ таблицах с пользовательскими данными
- [ ] Политики SELECT фильтруют по `auth.uid()`
- [ ] Политики UPDATE/DELETE проверяют ownership
- [ ] Нет `USING (true)` на sensitive таблицах
- [ ] service_role не используется на фронтенде

### Косвенный IDOR
- [ ] Нельзя подменить `user_id` в теле запроса при создании ресурса
- [ ] Нельзя сменить owner через UPDATE
- [ ] Вложенные ресурсы (comment.post.user) тоже проверяются

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Чтение чужих персональных данных по ID |
| CRITICAL | Изменение/удаление чужих ресурсов |
| HIGH | Sequential ID позволяет enumeration |
| MEDIUM | Утечка количества записей через ID |
| LOW | Недостаточная granularity RLS-политик |

## Anti-patterns

```typescript
// ПЛОХО: запрос только по ID, без проверки ownership
const { data } = await supabase
  .from('documents')
  .select('*')
  .eq('id', params.id)
  .single()

// ХОРОШО: RLS делает фильтрацию, но явная проверка не повредит
const { data, error } = await supabase
  .from('documents')
  .select('id, title, content')
  .eq('id', params.id)
  .single()
// RLS-политика: USING (user_id = auth.uid())
if (error) throw new Error('Document not found or access denied')
```

## Тестирование
1. Создать ресурс пользователем A
2. Попытаться прочитать/изменить/удалить пользователем B
3. Каждая попытка должна вернуть 403 или пустой результат
