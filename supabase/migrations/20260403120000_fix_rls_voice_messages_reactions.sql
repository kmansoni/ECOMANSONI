-- Закрыть открытые SELECT-политики voice_messages и message_reactions.
-- voice_messages: только участники conversation могут читать.
-- message_reactions: только участники conversation (через messages) могут читать.

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users read voice messages" ON voice_messages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone reads reactions" ON message_reactions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "participants_read_voice_messages" ON voice_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = voice_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "participants_read_reactions" ON message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
        JOIN conversation_participants cp
          ON cp.conversation_id = m.conversation_id
         AND cp.user_id = auth.uid()
      WHERE m.id = message_reactions.message_id
    )
  );
