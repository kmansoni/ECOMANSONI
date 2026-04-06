---
name: audit-log-generator
description: "Генератор audit logs: PostgreSQL audit trail, RLS-безопасные логи, compliance, GDPR audit, security events. Use when: audit log, журнал действий, кто изменил, история изменений, compliance, GDPR, security events, кто удалил."
argument-hint: "[тип: user-actions | data-changes | security-events | all]"
---

# Audit Log Generator — Журнал аудита

---

## Схема таблицы аудита

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_ip      INET,
  action        TEXT NOT NULL,  -- 'message.sent', 'profile.updated', 'user.login'
  entity_type   TEXT,           -- 'message', 'profile', 'channel'
  entity_id     UUID,
  old_data      JSONB,          -- Данные до изменения (для UPDATE/DELETE)
  new_data      JSONB,          -- Данные после изменения (для INSERT/UPDATE)
  metadata      JSONB DEFAULT '{}'  -- Дополнительный контекст
);

-- Индексы для поиска
CREATE INDEX idx_audit_actor ON audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, occurred_at DESC);

-- Партиционирование по месяцам (для масштабируемости)
-- (Добавить позднее при росте объёма)

-- RLS: пользователи видят только свои действия, модераторы — все
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_self_read" ON audit_log
  FOR SELECT USING (actor_id = auth.uid());

CREATE POLICY "audit_admin_read" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Запись только через service role / функции
CREATE POLICY "audit_service_insert" ON audit_log
  FOR INSERT WITH CHECK (TRUE);  --控制 через SECURITY DEFINER функцию
```

---

## Trigger-based audit (автоматическая запись)

```sql
-- Функция-триггер для автоматической записи изменений
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (action, entity_type, entity_id, old_data, new_data, actor_id)
  VALUES (
    TG_OP || '.' || TG_TABLE_NAME,   -- 'UPDATE.messages', 'DELETE.channels'
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Применить к критичным таблицам
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_channels
  AFTER INSERT OR UPDATE OR DELETE ON channels
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## Явная запись security событий (Edge Function)

```typescript
// supabase/functions/_shared/audit.ts
export async function logSecurityEvent(params: {
  action: 'user.login' | 'user.logout' | 'user.login_failed' | 'token.refresh' | 'password.changed';
  actorId?: string;
  actorIp?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from('audit_log').insert({
    action: params.action,
    actor_id: params.actorId,
    actor_ip: params.actorIp,
    metadata: params.metadata ?? {},
    entity_type: 'auth',
  });
}

// Использование в Edge Function login
await logSecurityEvent({
  action: 'user.login',
  actorId: user.id,
  actorIp: req.headers.get('x-forwarded-for') ?? undefined,
  metadata: { provider: 'email', device: req.headers.get('user-agent') },
});
```

---

## GDPR — очистка персональных данных

```sql
-- При удалении пользователя: anonymize audit logs, не удалять
CREATE OR REPLACE FUNCTION anonymize_user_audit(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE audit_log
  SET
    actor_id = NULL,
    actor_ip = NULL,
    -- Удалить PII из old_data/new_data
    old_data = old_data - 'email' - 'phone' - 'display_name',
    new_data = new_data - 'email' - 'phone' - 'display_name',
    metadata = metadata || '{"anonymized": true}'::jsonb
  WHERE actor_id = target_user_id;
END;
$$;
```

---

## Чеклист

- [ ] Таблица `audit_log` с индексами по actor + entity + action
- [ ] RLS: пользователи видят только свои, admins — все
- [ ] Triggers на критичных таблицах (profiles, channels, payments)
- [ ] Security события пишутся явно (login, logout, failed attempts)
- [ ] IP адрес записывается из `x-forwarded-for`
- [ ] GDPR anonymize функция для удалённых пользователей
- [ ] Ротация/архивация старых логов (>6 месяцев)
