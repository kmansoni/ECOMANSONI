-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Read receipts: статус доставки
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent'; 
-- Значения: 'sending', 'sent', 'delivered', 'read', 'failed'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Закреплённые сообщения
CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  pinned_by UUID NOT NULL,
  pin_position INTEGER NOT NULL DEFAULT 1,
  pinned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id, pin_position);

ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read pinned messages in their conversations" ON pinned_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants 
      WHERE conversation_id = pinned_messages.conversation_id 
      AND user_id = auth.uid()
    )
  );
CREATE POLICY "Users can pin messages in their conversations" ON pinned_messages
  FOR INSERT WITH CHECK (pinned_by = auth.uid());
CREATE POLICY "Users can unpin messages" ON pinned_messages
  FOR DELETE USING (pinned_by = auth.uid());

-- Scheduled messages доработка
ALTER TABLE messages ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_for) 
  WHERE is_scheduled = true AND scheduled_for IS NOT NULL;

-- Функция обработки scheduled messages
CREATE OR REPLACE FUNCTION process_scheduled_messages()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE messages 
  SET is_scheduled = false
  WHERE is_scheduled = true 
    AND scheduled_for IS NOT NULL 
    AND scheduled_for <= now();
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
