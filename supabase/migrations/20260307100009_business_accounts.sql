-- ============================================================
-- Business Accounts (Telegram Business аналог)
-- Миграция: business_accounts, business_chat_labels
-- ============================================================

CREATE TABLE IF NOT EXISTS public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 255),
  business_category text NOT NULL
    CHECK (business_category IN ('retail', 'food', 'services', 'education', 'tech', 'other')),
  business_description text CHECK (char_length(business_description) <= 2048),
  business_address text,
  business_phone text,
  business_email text,
  business_website text,
  -- {"mon": {"open": "09:00", "close": "18:00", "closed": false}, ...}
  business_hours jsonb DEFAULT '{}',
  greeting_message text CHECK (char_length(greeting_message) <= 2048),
  away_message text CHECK (char_length(away_message) <= 2048),
  -- [{"id": "uuid", "text": "Как заказать?", "message": "Чтобы заказать..."}]
  quick_replies jsonb DEFAULT '[]',
  auto_reply_enabled boolean DEFAULT false,
  -- [{"id": "uuid", "name": "VIP", "color": "#3b82f6"}]
  labels jsonb DEFAULT '[]',
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Метки для конкретных чатов
CREATE TABLE IF NOT EXISTS public.business_chat_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 64),
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, chat_id, label)
);

-- ──────────────────────────── ИНДЕКСЫ ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_business_accounts_user_id ON public.business_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_business_chat_labels_business_id ON public.business_chat_labels(business_id);
CREATE INDEX IF NOT EXISTS idx_business_chat_labels_chat_id ON public.business_chat_labels(chat_id);

-- ──────────────────────────── ТРИГГЕР ────────────────────────────

DROP TRIGGER IF EXISTS trg_business_accounts_updated_at ON public.business_accounts;
CREATE TRIGGER trg_business_accounts_updated_at
  BEFORE UPDATE ON public.business_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────── RLS ────────────────────────────────

ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_chat_labels ENABLE ROW LEVEL SECURITY;

-- Публичный SELECT: любой может просматривать профиль бизнеса (для BusinessGreetingOverlay)
CREATE POLICY "business_account_public_select" ON public.business_accounts
  FOR SELECT USING (true);

-- Только владелец может изменять свой бизнес-профиль
CREATE POLICY "business_account_owner_all" ON public.business_accounts
  FOR ALL USING (user_id = auth.uid());

-- Метки — только владелец бизнеса
CREATE POLICY "business_labels_owner_all" ON public.business_chat_labels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.business_accounts WHERE id = business_id AND user_id = auth.uid())
  );

-- ──────────────────────────── ФУНКЦИЯ СТАТИСТИКИ ─────────────────────

-- Возвращает агрегированную статистику чатов для бизнеса.
-- Считает кол-во уникальных chat_id из business_chat_labels за периоды.
-- SECURITY DEFINER позволяет читать данные минуя RLS только для проверки принадлежности.
CREATE OR REPLACE FUNCTION public.get_business_stats(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_today   bigint;
  v_week    bigint;
  v_month   bigint;
BEGIN
  -- Проверка владельца
  SELECT user_id INTO v_user_id FROM business_accounts WHERE id = p_business_id;
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT count(DISTINCT chat_id) INTO v_today
  FROM business_chat_labels
  WHERE business_id = p_business_id
    AND created_at >= now() - interval '1 day';

  SELECT count(DISTINCT chat_id) INTO v_week
  FROM business_chat_labels
  WHERE business_id = p_business_id
    AND created_at >= now() - interval '7 days';

  SELECT count(DISTINCT chat_id) INTO v_month
  FROM business_chat_labels
  WHERE business_id = p_business_id
    AND created_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'ok', true,
    'chats_today', v_today,
    'chats_week', v_week,
    'chats_month', v_month
  );
END;
$$;
