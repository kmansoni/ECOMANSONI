-- Эффекты сообщений (confetti, fire, hearts и т.п.)
-- Instagram/iMessage-style fullscreen animations при отправке

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_effect TEXT;

COMMENT ON COLUMN public.messages.message_effect IS 'Визуальный эффект: confetti, fire, hearts, thumbsup';
