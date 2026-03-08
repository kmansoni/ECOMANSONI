-- ============================================================
-- Bot Payments API
-- Миграция: payment_invoices, bot_payment_providers, payment_refunds
-- Isolation: READ COMMITTED; все денежные транзакции атомарны через хранимые функции
-- ============================================================

-- Счета (инвойсы)
CREATE TABLE IF NOT EXISTS public.payment_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2048),
  currency text NOT NULL DEFAULT 'XTR' CHECK (currency IN ('XTR', 'USD', 'EUR', 'RUB')),
  amount integer NOT NULL CHECK (amount > 0),  -- в минимальных единицах валюты (Stars = 1:1)
  payload text,                                 -- произвольные данные от бота (≤4096 байт)
  photo_url text,
  -- 'processing' is a transient lock state used by the external-provider path in
  -- the Edge Function to prevent TOCTOU double-charge (pending → processing → paid/cancelled).
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'cancelled', 'refunded')),
  paid_at timestamptz,
  refunded_at timestamptz,
  provider_payment_charge_id text,             -- идентификатор во внешней платёжной системе
  idempotency_key text UNIQUE,                 -- replay-protect для создания счёта
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Провайдеры оплаты бота
CREATE TABLE IF NOT EXISTS public.bot_payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('stars', 'stripe', 'yookassa')),
  provider_config jsonb DEFAULT '{}',          -- зашифрованные ключи хранятся в Vault, здесь только refs
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bot_id, provider_type)
);

-- Возвраты
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.payment_invoices(id),
  amount integer NOT NULL CHECK (amount > 0),
  reason text,
  created_at timestamptz DEFAULT now()
);

-- ──────────────────────────── ИНДЕКСЫ ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payment_invoices_user_id ON public.payment_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_bot_id ON public.payment_invoices(bot_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_status ON public.payment_invoices(status);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_chat_id ON public.payment_invoices(chat_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_invoice_id ON public.payment_refunds(invoice_id);

-- ──────────────────────────── ТРИГГЕР updated_at ────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_invoices_updated_at ON public.payment_invoices;
CREATE TRIGGER trg_payment_invoices_updated_at
  BEFORE UPDATE ON public.payment_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────── АТОМАРНАЯ ОПЛАТА STARS ─────────────────────────
-- Вызывается из Edge Function под service_role.
-- Гарантирует: debit user + credit bot в одной транзакции, статус инвойса обновляется атомарно.
-- Защита от двойной оплаты: проверка status = 'pending' с SELECT FOR UPDATE.

CREATE OR REPLACE FUNCTION public.pay_invoice_with_stars(
  p_invoice_id uuid,
  p_user_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice   payment_invoices;
  v_bot_owner uuid;
  v_balance   integer;
BEGIN
  -- Lock invoice row to prevent concurrent double-payment
  SELECT * INTO v_invoice
  FROM payment_invoices
  WHERE id = p_invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  END IF;

  IF v_invoice.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_invoice.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_invoice.status);
  END IF;

  IF v_invoice.currency <> 'XTR' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_stars_currency');
  END IF;

  -- Получить баланс user_stars (SELECT FOR UPDATE для serializable debit)
  SELECT balance INTO v_balance FROM user_stars WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_balance < v_invoice.amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stars', 'balance', COALESCE(v_balance,0));
  END IF;

  -- Найти владельца бота
  SELECT owner_id INTO v_bot_owner FROM bots WHERE id = v_invoice.bot_id;

  -- Debit покупателя
  UPDATE user_stars SET balance = balance - v_invoice.amount WHERE user_id = p_user_id;

  -- Credit владельца бота (INSERT OR UPDATE)
  INSERT INTO user_stars(user_id, balance)
    VALUES (v_bot_owner, v_invoice.amount)
  ON CONFLICT (user_id)
    DO UPDATE SET balance = user_stars.balance + EXCLUDED.balance;

  -- Обновить статус инвойса
  UPDATE payment_invoices
  SET status = 'paid', paid_at = now(), updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('ok', true, 'paid_at', now());
END;
$$;

-- ──────────────────────────── АТОМАРНЫЙ ВОЗВРАТ STARS ────────────────────────

CREATE OR REPLACE FUNCTION public.refund_invoice_stars(
  p_invoice_id uuid,
  p_amount     integer,
  p_reason     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice   payment_invoices;
  v_bot_owner uuid;
BEGIN
  SELECT * INTO v_invoice FROM payment_invoices WHERE id = p_invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  END IF;

  IF v_invoice.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_paid');
  END IF;

  IF v_invoice.currency <> 'XTR' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_stars_currency');
  END IF;

  IF p_amount > v_invoice.amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_exceeds_original');
  END IF;

  SELECT owner_id INTO v_bot_owner FROM bots WHERE id = v_invoice.bot_id;

  -- Debit бота
  UPDATE user_stars SET balance = balance - p_amount WHERE user_id = v_bot_owner;
  -- Credit пользователя
  INSERT INTO user_stars(user_id, balance) VALUES (v_invoice.user_id, p_amount)
  ON CONFLICT(user_id) DO UPDATE SET balance = user_stars.balance + EXCLUDED.balance;

  -- Фиксация рефанда
  INSERT INTO payment_refunds(invoice_id, amount, reason) VALUES (p_invoice_id, p_amount, p_reason);

  UPDATE payment_invoices
  SET status = 'refunded', refunded_at = now(), updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ──────────────────────────── RLS ────────────────────────────────

ALTER TABLE public.payment_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

-- Покупатель видит свои инвойсы
CREATE POLICY "invoice_select_buyer" ON public.payment_invoices
  FOR SELECT USING (user_id = auth.uid());

-- Владелец бота видит все инвойсы своего бота
CREATE POLICY "invoice_select_bot_owner" ON public.payment_invoices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bots WHERE id = bot_id AND owner_id = auth.uid())
  );

-- Создание инвойсов только через service_role (Edge Function)
-- INSERT/UPDATE разрешены только service_role → политик нет, SECURITY DEFINER функции

-- Провайдеры: только владелец бота
CREATE POLICY "bot_provider_select" ON public.bot_payment_providers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bots WHERE id = bot_id AND owner_id = auth.uid())
  );

CREATE POLICY "bot_provider_manage" ON public.bot_payment_providers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.bots WHERE id = bot_id AND owner_id = auth.uid())
  );

-- Рефанды: покупатель и владелец бота
CREATE POLICY "refund_select" ON public.payment_refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payment_invoices pi
      WHERE pi.id = invoice_id
        AND (
          pi.user_id = auth.uid() OR
          EXISTS (SELECT 1 FROM public.bots WHERE id = pi.bot_id AND owner_id = auth.uid())
        )
    )
  );
