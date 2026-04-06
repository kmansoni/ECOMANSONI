# RLS Policy Generator — Генератор политик Row Level Security

## Принципы

1. **Deny by default** — без RLS таблица ЗАКРЫТА
2. **Explicit allow** — каждая операция (SELECT/INSERT/UPDATE/DELETE) отдельно
3. **auth.uid()** — основа всех проверок
4. **Минимум привилегий** — только необходимый доступ

## Шаблоны политик

### Личные данные (profiles, settings)
```sql
-- Пользователь видит только свой профиль
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Пользователь редактирует только свой профиль
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

### Контент с владельцем (posts, messages)
```sql
-- Публичный контент видят все авторизованные
CREATE POLICY "Authenticated users can view public posts"
  ON posts FOR SELECT
  USING (auth.role() = 'authenticated' AND is_public = true);

-- Свой контент видит владелец
CREATE POLICY "Owner can view own posts"
  ON posts FOR SELECT
  USING (auth.uid() = user_id);

-- Создавать может авторизованный, привязка к uid
CREATE POLICY "Authenticated can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Удалять/редактировать — только владелец
CREATE POLICY "Owner can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id);
```

### Групповой доступ (team members, chat participants)
```sql
-- Участники группы видят её контент
CREATE POLICY "Members can view group messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = messages.group_id
        AND group_members.user_id = auth.uid()
    )
  );
```

### Admin access
```sql
-- Админ видит всё
CREATE POLICY "Admin full access"
  ON {table} FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
```

## Чеклист генерации

1. Определить владельца данных (user_id column)
2. Определить уровни доступа: owner / group / public / admin
3. Для каждой операции (CRUD) — отдельная policy
4. Проверить: нет ли обхода через JOIN
5. Проверить: INSERT WITH CHECK привязывает auth.uid()
6. Тестировать: попытка доступа к чужим данным → 0 rows

## Anti-patterns

- `USING (true)` — открытый доступ
- Только SELECT policy без INSERT/UPDATE/DELETE
- `auth.role() = 'authenticated'` без проверки владельца
- RLS на таблице но service_role key на клиенте
