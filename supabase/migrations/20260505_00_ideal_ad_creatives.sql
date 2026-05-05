-- ============================================================================
-- Идеальная схема ad_creatives (Instagram/TikTok inspired)
-- Миграция: 20260505_00_ideal_ad_creatives.sql
-- ============================================================================

-- 1. Расширяем таблицу ad_creatives
ALTER TABLE ad_creatives
  -- Жизненный цикл
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived')),

  -- Модерация
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}'::jsonb,

  -- Аудит
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,

  -- Duplicate detection
  ADD COLUMN IF NOT EXISTS creative_hash TEXT NOT NULL,

  -- Настройки производительности
  ADD COLUMN IF NOT EXISTS frequency_cap INTEGER NOT NULL DEFAULT 3
    CHECK (frequency_cap >= 1 AND frequency_cap <= 100),
  ADD COLUMN IF NOT EXISTS priority_order INTEGER NOT NULL DEFAULT 0
    CHECK (priority_order >= 0),

  -- Медиаметаданные
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS media_duration_sec INTEGER
    CHECK (media_duration_sec IS NULL OR media_duration_sec > 0),
  ADD COLUMN IF NOT EXISTS media_width INTEGER
    CHECK (media_width IS NULL OR media_width > 0),
  ADD COLUMN IF NOT EXISTS media_height INTEGER
    CHECK (media_height IS NULL OR media_height > 0),
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT
    CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  ADD COLUMN IF NOT EXISTS aspect_ratio TEXT
    CHECK (aspect_ratio IS NULL OR aspect_ratio ~ '^\d+:\d+$');

-- 2. Валидация (CHECK constraints)
ALTER TABLE ad_creatives
  ADD CONSTRAINT valid_media_url CHECK (media_url ~* '^https://'),
  ADD CONSTRAINT valid_destination_url CHECK (destination_url ~* '^https://'),
  ADD CONSTRAINT valid_headline_length CHECK (char_length(headline) BETWEEN 1 AND 100),
  ADD CONSTRAINT valid_description_length CHECK (description IS NULL OR char_length(description) <= 300),
  ADD CONSTRAINT valid_cta CHECK (call_to_action IN (
    'learn_more', 'shop_now', 'sign_up', 'contact_us', 'download', 'get_quote', 'apply_now'
  )),
  ADD CONSTRAINT valid_type CHECK (type IN ('image', 'video', 'carousel', 'story')),
  ADD CONSTRAINT valid_creative_hash CHECK (creative_hash <> ''),
  ADD CONSTRAINT valid_frequency_cap CHECK (frequency_cap >= 1 AND frequency_cap <= 100);

-- 3. Уникальность: блокируем дубли активных креативов
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_creatives_unique_hash_active
  ON ad_creatives(campaign_id, creative_hash)
  WHERE deleted_at IS NULL AND status IN ('approved', 'active');

-- 4. Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_status
  ON ad_creatives(campaign_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_hash
  ON ad_creatives(creative_hash);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_type_status
  ON ad_creatives(type, status);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_updated
  ON ad_creatives(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_moderated
  ON ad_creatives(moderated_at DESC)
  WHERE moderated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_created
  ON ad_creatives(campaign_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 5. Триггер: auto-update updated_at
CREATE OR REPLACE FUNCTION update_ad_creatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_creatives_updated_at ON ad_creatives;
CREATE TRIGGER trg_ad_creatives_updated_at
  BEFORE UPDATE ON ad_creatives
  FOR EACH ROW EXECUTE FUNCTION update_ad_creatives_updated_at();

-- 6. Триггер: auto-generate creative_hash
CREATE OR REPLACE FUNCTION set_ad_creative_hash()
RETURNS TRIGGER AS $$
DECLARE
  hash_input TEXT;
BEGIN
  IF NEW.creative_hash IS NULL THEN
    hash_input :=
      COALESCE(NEW.media_url, '') || '|' ||
      COALESCE(NEW.headline, '') || '|' ||
      COALESCE(NEW.call_to_action, '') || '|' ||
      COALESCE(NEW.type, '');

    IF NEW.description IS NOT NULL THEN
      hash_input := hash_input || '|' || NEW.description;
    END IF;

    NEW.creative_hash := md5(hash_input);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_creative_hash ON ad_creatives;
CREATE TRIGGER trg_ad_creative_hash
  BEFORE INSERT OR UPDATE ON ad_creatives
  FOR EACH ROW EXECUTE FUNCTION set_ad_creative_hash();

-- 7. Таблица аудита изменений
CREATE TABLE IF NOT EXISTS ad_creative_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  change_type TEXT NOT NULL CHECK (change_type IN (
    'create', 'update', 'delete', 'restore', 'status_change'
  )),
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ad_creative_history_creative
  ON ad_creative_history(creative_id);
CREATE INDEX IF NOT EXISTS idx_ad_creative_history_changer
  ON ad_creative_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_ad_creative_history_changed_at
  ON ad_creative_history(changed_at DESC);

-- 8. Триггер аудита
CREATE OR REPLACE FUNCTION log_ad_creative_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type TEXT;
  old_json JSONB;
  new_json JSONB;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    change_type := 'create';
    old_json := NULL;
    new_json := to_jsonb(NEW);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      change_type := 'delete';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      change_type := 'restore';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type := 'status_change';
    ELSE
      change_type := 'update';
    END IF;
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN
    change_type := 'delete';
    old_json := to_jsonb(OLD);
    new_json := NULL;
  END IF;

  INSERT INTO ad_creative_history (
    creative_id,
    changed_by,
    change_type,
    old_values,
    new_values,
    changed_at
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    change_type,
    old_json,
    new_json,
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ad_creative_audit ON ad_creatives;
CREATE TRIGGER trg_ad_creative_audit
  AFTER INSERT OR UPDATE OR DELETE ON ad_creatives
  FOR EACH ROW EXECUTE FUNCTION log_ad_creative_change();

-- 9. Обновляем RLS политики

-- ad_creatives SELECT
DROP POLICY IF EXISTS "ad_creatives_select_own" ON ad_creatives;
CREATE POLICY "ad_creatives_select_own"
  ON ad_creatives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
    AND ad_creatives.deleted_at IS NULL
  );

-- ad_creatives INSERT (только draft/pending_review)
DROP POLICY IF EXISTS "ad_creatives_insert_own" ON ad_creatives;
CREATE POLICY "ad_creatives_insert_own"
  ON ad_creatives FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = NEW.campaign_id
        AND advertiser_id = auth.uid()
    )
    AND NEW.status IN ('draft', 'pending_review')
    AND NEW.deleted_at IS NULL
  );

-- ad_creatives UPDATE (со state machine)
DROP POLICY IF EXISTS "ad_creatives_update_own" ON ad_creatives;
CREATE POLICY "ad_creatives_update_own"
  ON ad_creatives FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
    AND ad_creatives.deleted_at IS NULL
  )
  WITH CHECK (
    OLD.campaign_id = NEW.campaign_id  -- campaign_id нельзя менять

    AND (
      -- State transitions
      (OLD.status = 'draft' AND NEW.status IN ('draft', 'pending_review', 'approved', 'rejected'))
      OR
      (OLD.status = 'pending_review' AND NEW.status IN ('approved', 'rejected'))
      OR
      (OLD.status = 'approved' AND NEW.status IN ('active', 'paused', 'rejected'))
      OR
      (OLD.status = 'active' AND NEW.status IN ('paused', 'approved'))
      OR
      (OLD.status = 'rejected' AND NEW.status IN ('draft', 'pending_review'))
      OR
      (OLD.status = 'archived' AND NEW.status = 'archived')
    )

    -- type и call_to_action можно менять только в draft/rejected
    AND (
      OLD.status IN ('draft', 'rejected')
      OR (OLD.type = NEW.type AND OLD.call_to_action = NEW.call_to_action)
    )
  );

-- ad_creatives DELETE (soft delete через updated_at/deleted_at)
DROP POLICY IF EXISTS "ad_creatives_delete_own" ON ad_creatives;
CREATE POLICY "ad_creatives_delete_own"
  ON ad_creatives FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
    AND ad_creatives.deleted_at IS NULL
    AND ad_creatives.status IN ('draft', 'rejected')
  );

-- 10. ad_campaigns: updated_by триггер
CREATE OR REPLACE FUNCTION set_ad_campaigns_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_by ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_by
  BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_ad_campaigns_updated_by();

-- 11. ad_impressions: только SELECT, INSERT только через service_role
DROP POLICY IF EXISTS "ad_impressions_insert_any" ON ad_impressions;
DROP POLICY IF EXISTS "ad_impressions_select_advertiser" ON ad_impressions;

CREATE POLICY "ad_impressions_select_advertiser"
  ON ad_impressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_creatives ac
      JOIN ad_campaigns camp ON ac.campaign_id = camp.id
      WHERE ac.id = ad_impressions.creative_id
        AND camp.advertiser_id = auth.uid()
    )
  );

-- INSERT в ad_impressions БЛОКИРОВАН для ролей anon/authenticated
-- Будет выполняться только через Edge Function с service_role

-- 12. Комментарии
COMMENT ON TABLE ad_creatives IS 'Рекламные креативы с full lifecycle (draft→pending→approved→active→archived)';
COMMENT ON COLUMN ad_creatives.status IS 'Жизненный цикл: draft (черновик), pending_review (модерация), approved (одобрен), rejected (отклонён), archived (архив)';
COMMENT ON COLUMN ad_creatives.creative_hash IS 'MD5(media_url+headline+cta+type[+description]) для duplicate detection';
COMMENT ON COLUMN ad_creatives.frequency_cap IS 'Максимум показов на пользователя в день (capping)';
COMMENT ON COLUMN ad_creatives.moderation_reason IS 'Причина отклонения модератором';
COMMENT ON TABLE ad_creative_history IS 'Audit log: все изменения креативов (who, what, when)';

-- 13. Добавляем metadata в ad_impressions для Edge Function
ALTER TABLE ad_impressions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- Конец миграции
-- ============================================================================

-- Инструкция:
-- 1. Применить: supabase db push или через dashboard
-- 2. Убедиться, что RLS включена для всех таблиц
-- 3. Создать Edge Function record-ad-impression
-- 4. Обновить типы в src/integrations/supabase/types.ts
-- 5. Обновить хуки: useAdCreatives, useAdCampaigns
-- 6. Запустить tsc --noEmit, vitest
