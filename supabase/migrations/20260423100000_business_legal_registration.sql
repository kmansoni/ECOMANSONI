-- =====================================================
-- Business Legal Registration subsystem
-- Applications (ИП / ООО / Самозанятый) + documents + status log
-- =====================================================

-- ─── Applications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_legal_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('self_employed','entrepreneur','legal_entity')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',            -- заполняется пользователем
    'submitted',        -- отправлена на проверку
    'under_review',     -- модератор взял в работу
    'needs_fixes',      -- требует исправлений (вернули пользователю)
    'sent_to_fns',      -- отправлена в ФНС API (mock)
    'approved',         -- одобрена / зарегистрирована
    'rejected'          -- окончательный отказ
  )),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,        -- данные всех шагов мастера
  okved_codes text[] DEFAULT '{}',                     -- для ИП/ЮЛ
  payment_status text NOT NULL DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required','pending','paid','failed','refunded')),
  payment_reference text,                              -- id платежа в ЮKassa (mock)
  fns_reference text,                                  -- номер заявки в ФНС (mock)
  rejection_reason text,
  review_comment text,
  reviewer_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bla_user          ON public.business_legal_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_bla_status        ON public.business_legal_applications(status);
CREATE INDEX IF NOT EXISTS idx_bla_kind          ON public.business_legal_applications(kind);
CREATE INDEX IF NOT EXISTS idx_bla_submitted     ON public.business_legal_applications(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bla_reviewer      ON public.business_legal_applications(reviewer_admin_id);

COMMENT ON TABLE public.business_legal_applications IS 'Заявки на регистрацию ИП/ЮЛ/самозанятого в ФНС (с модерацией)';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_business_legal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bla_updated_at ON public.business_legal_applications;
CREATE TRIGGER trg_bla_updated_at
  BEFORE UPDATE ON public.business_legal_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_business_legal_updated_at();

-- ─── Documents ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.business_legal_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'passport_main',        -- паспорт разворот
    'passport_registration',-- страница с пропиской
    'inn_certificate',      -- ИНН
    'snils',                -- СНИЛС (опц.)
    'application_form',     -- Р21001 / Р11001 (сгенерированная pdf)
    'charter',              -- устав ООО
    'founder_decision',     -- решение учредителя
    'payment_receipt',      -- квитанция оплаты госпошлины
    'address_proof',        -- подтверждение адреса ЮЛ
    'other'
  )),
  storage_path text NOT NULL,                          -- путь в bucket business-legal-docs
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20 * 1024 * 1024),
  ocr_data jsonb,                                      -- результат OCR (серия/номер/ФИО)
  verified boolean NOT NULL DEFAULT false,
  verified_by_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bld_application   ON public.business_legal_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_bld_user          ON public.business_legal_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_bld_type          ON public.business_legal_documents(doc_type);

COMMENT ON TABLE public.business_legal_documents IS 'Документы, загруженные к заявке на регистрацию';

-- ─── Status log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_legal_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.business_legal_applications(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bls_application   ON public.business_legal_status_log(application_id);
CREATE INDEX IF NOT EXISTS idx_bls_created       ON public.business_legal_status_log(created_at DESC);

COMMENT ON TABLE public.business_legal_status_log IS 'Журнал смены статусов заявок на регистрацию';

-- Trigger: автоматически логировать смену статуса
CREATE OR REPLACE FUNCTION public.log_business_legal_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.business_legal_status_log(application_id, from_status, to_status, actor_user_id)
    VALUES (NEW.id, NULL, NEW.status, NEW.user_id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.business_legal_status_log(
      application_id, from_status, to_status,
      actor_user_id, actor_admin_id, comment
    ) VALUES (
      NEW.id, OLD.status, NEW.status,
      CASE WHEN NEW.reviewer_admin_id IS NULL THEN NEW.user_id ELSE NULL END,
      NEW.reviewer_admin_id,
      COALESCE(NEW.review_comment, NEW.rejection_reason)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bla_status_log_ins ON public.business_legal_applications;
CREATE TRIGGER trg_bla_status_log_ins
  AFTER INSERT ON public.business_legal_applications
  FOR EACH ROW EXECUTE FUNCTION public.log_business_legal_status_change();

DROP TRIGGER IF EXISTS trg_bla_status_log_upd ON public.business_legal_applications;
CREATE TRIGGER trg_bla_status_log_upd
  AFTER UPDATE ON public.business_legal_applications
  FOR EACH ROW EXECUTE FUNCTION public.log_business_legal_status_change();

-- ─── RLS ──────────────────────────────────────────────
ALTER TABLE public.business_legal_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_legal_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_legal_status_log   ENABLE ROW LEVEL SECURITY;

-- applications: пользователь видит/редактирует свои заявки в статусах draft/needs_fixes
DROP POLICY IF EXISTS bla_user_select  ON public.business_legal_applications;
CREATE POLICY bla_user_select ON public.business_legal_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS bla_user_insert  ON public.business_legal_applications;
CREATE POLICY bla_user_insert ON public.business_legal_applications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','submitted'));

DROP POLICY IF EXISTS bla_user_update  ON public.business_legal_applications;
CREATE POLICY bla_user_update ON public.business_legal_applications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft','needs_fixes'))
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','submitted','needs_fixes'));

DROP POLICY IF EXISTS bla_user_delete  ON public.business_legal_applications;
CREATE POLICY bla_user_delete ON public.business_legal_applications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft');

-- documents: пользователь видит/пишет только по своим заявкам
DROP POLICY IF EXISTS bld_user_select  ON public.business_legal_documents;
CREATE POLICY bld_user_select ON public.business_legal_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS bld_user_insert  ON public.business_legal_documents;
CREATE POLICY bld_user_insert ON public.business_legal_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.business_legal_applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND a.status IN ('draft','needs_fixes')
    )
  );

DROP POLICY IF EXISTS bld_user_delete  ON public.business_legal_documents;
CREATE POLICY bld_user_delete ON public.business_legal_documents
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.business_legal_applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND a.status IN ('draft','needs_fixes')
    )
  );

-- status log: пользователь видит лог своих заявок
DROP POLICY IF EXISTS bls_user_select  ON public.business_legal_status_log;
CREATE POLICY bls_user_select ON public.business_legal_status_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_legal_applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

-- Админы работают через edge function admin-api c service_role → RLS обходится.

-- ─── Storage bucket ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-legal-docs',
  'business-legal-docs',
  false,
  20971520,  -- 20 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: путь вида {user_id}/{application_id}/{filename}
DROP POLICY IF EXISTS "bld_storage_read_own"    ON storage.objects;
CREATE POLICY "bld_storage_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'business-legal-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "bld_storage_write_own"   ON storage.objects;
CREATE POLICY "bld_storage_write_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-legal-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "bld_storage_delete_own"  ON storage.objects;
CREATE POLICY "bld_storage_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-legal-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Admin permissions / scopes ───────────────────────
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('biz_registration.read',   'biz_registration', 'read',   'Read business legal registrations', 'medium', true),
  ('biz_registration.review', 'biz_registration', 'review', 'Review/approve/reject registrations', 'high',   true)
ON CONFLICT (scope) DO NOTHING;

WITH roles AS (
  SELECT id, name FROM public.admin_roles
   WHERE name IN ('owner', 'security_admin', 'readonly_auditor')
), perms AS (
  SELECT id, scope FROM public.admin_permissions
   WHERE scope IN ('biz_registration.read','biz_registration.review')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON (
  (p.scope = 'biz_registration.read'   AND r.name IN ('owner','security_admin','readonly_auditor'))
  OR (p.scope = 'biz_registration.review' AND r.name IN ('owner','security_admin'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
