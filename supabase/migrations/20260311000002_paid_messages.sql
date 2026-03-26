-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Paid Messages: Stars per DM
-- Migration: 20260311000002_paid_messages

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paid_message_stars INT DEFAULT 0;
-- 0 = free messages, >0 = cost in Stars to send a DM to this user

CREATE TABLE public.paid_message_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID,
  stars_amount INT NOT NULL CHECK (stars_amount > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_paid_msg_tx_sender ON public.paid_message_transactions(sender_id);
CREATE INDEX idx_paid_msg_tx_recipient ON public.paid_message_transactions(recipient_id);
CREATE INDEX idx_paid_msg_tx_created_at ON public.paid_message_transactions(created_at DESC);

ALTER TABLE public.paid_message_transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: only participants of the transaction
CREATE POLICY "paid_msg_tx_select_participants"
  ON public.paid_message_transactions FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- INSERT: only sender can create
CREATE POLICY "paid_msg_tx_insert_sender"
  ON public.paid_message_transactions FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- UPDATE: service_role only (for refunds)
CREATE POLICY "paid_msg_tx_update_service"
  ON public.paid_message_transactions FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: not allowed
