-- Stripe Webhook Integration
-- ============================================================================

-- 1. Таблица аудита Stripe-платежей
CREATE TABLE IF NOT EXISTS public.payment_invoice_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.payment_invoices(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('paid', 'failed', 'refunded', 'disputed', 'chargeback')),
    stripe_event_id TEXT,
    raw_event JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_invoice_events_invoice ON public.payment_invoice_events (invoice_id);
CREATE INDEX idx_payment_invoice_events_stripe_id ON public.payment_invoice_events (stripe_event_id);
CREATE INDEX idx_payment_invoice_events_created ON public.payment_invoice_events (created_at DESC);

ALTER TABLE public.payment_invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners view invoice events" ON public.payment_invoice_events
    FOR SELECT USING (
        invoice_id IN (SELECT id FROM public.payment_invoices WHERE bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()))
    );

CREATE POLICY "Service role full access on invoice events" ON public.payment_invoice_events
    FOR ALL USING (auth.role() = 'service_role');

-- 2. Helper: resolve Stripe secret from Vault by bot_id
-- Предполагается, что у бота есть запись в bot_payment_providers с provider_type='stripe',
-- а vault_secret_id хранится в provider_config -> 'vault_secret_id'
CREATE OR REPLACE FUNCTION public.get_stripe_secret_for_bot(p_bot_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vault_id TEXT;
    v_secret TEXT;
BEGIN
    SELECT provider_config->>'vault_secret_id'
    INTO v_vault_id
    FROM bot_payment_providers
    WHERE bot_id = p_bot_id
      AND provider_type = 'stripe'
      AND is_active = true;

    IF v_vault_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT vault.secret
    INTO v_secret
    FROM vault.secrets
    WHERE id = v_vault_id::uuid;

    RETURN v_secret;
END;
$$;

-- 3. Stripe webhook event → update invoice status (вызывается из Edge Function)
-- Преимущество перед прямым UPDATE: атомарный переход статусов + аудит
CREATE OR REPLACE FUNCTION public.process_stripe_webhook_event(
    p_invoice_id UUID,
    p_event_type TEXT,
    p_stripe_event_id TEXT,
    p_paid_at TIMESTAMPTZ DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
    v_ok BOOLEAN;
BEGIN
    -- Проверяем текущий статус
    SELECT status INTO v_current_status
    FROM payment_invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invoice not found');
    END IF;

    -- Защита от повторной обработки того же Stripe event
    IF EXISTS (
        SELECT 1 FROM payment_invoice_events
        WHERE invoice_id = p_invoice_id AND stripe_event_id = p_stripe_event_id
    ) THEN
        RETURN jsonb_build_object('ok', true, 'message', 'duplicate event ignored');
    END IF;

    -- Атомарный UPDATE с проверкой текущего статуса
    IF p_event_type = 'paid' AND v_current_status = 'pending' THEN
        UPDATE payment_invoices
        SET status = 'paid', paid_at = COALESCE(p_paid_at, now()), updated_at = now()
        WHERE id = p_invoice_id AND status = 'pending';
        v_ok := true;

    ELSIF p_event_type = 'failed' AND v_current_status = 'pending' THEN
        UPDATE payment_invoices
        SET status = 'failed', updated_at = now()
        WHERE id = p_invoice_id AND status = 'pending';
        v_ok := true;

    ELSIF p_event_type = 'refunded' AND v_current_status IN ('paid', 'processing') THEN
        UPDATE payment_invoices
        SET status = 'refunded', refunded_at = now(), updated_at = now()
        WHERE id = p_invoice_id AND status IN ('paid', 'processing');
        v_ok := true;

    ELSE
        v_ok := false;
    END IF;

    -- Логируем событие аудита в любом случае
    INSERT INTO payment_invoice_events (invoice_id, event_type, stripe_event_id, raw_event)
    VALUES (p_invoice_id, p_event_type, p_stripe_event_id, '{}');

    RETURN jsonb_build_object('ok', v_ok, 'previous_status', v_current_status);
END;
$$;

-- 4. Индекс для быстрого поиска Stripe event по ID (deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_invoice_events_unique_stripe
    ON public.payment_invoice_events (invoice_id, stripe_event_id)
    WHERE stripe_event_id IS NOT NULL;