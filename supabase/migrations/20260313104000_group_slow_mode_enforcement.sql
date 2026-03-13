-- Server-side slow mode enforcement for group chats.
--
-- Why:
-- - Current slow mode in group UI is client-side and can be bypassed.
-- - This migration enforces cooldown in send_group_message_v1.
--
-- Design:
-- - Add configurable slow_mode_seconds to group_chats (default 0 = disabled).
-- - Track per-user last send timestamp in group_chat_slow_mode_state.
-- - Exempt owner/admin roles.
-- - Keep existing RPC signature unchanged.

ALTER TABLE public.group_chats
  ADD COLUMN IF NOT EXISTS slow_mode_seconds integer NOT NULL DEFAULT 0
  CHECK (slow_mode_seconds >= 0);

CREATE TABLE IF NOT EXISTS public.group_chat_slow_mode_state (
  group_id uuid NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_chat_slow_mode_state_group_last_sent
  ON public.group_chat_slow_mode_state(group_id, last_sent_at DESC);

ALTER TABLE public.group_chat_slow_mode_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_chat_slow_mode_state_no_direct_access" ON public.group_chat_slow_mode_state;
CREATE POLICY "group_chat_slow_mode_state_no_direct_access"
  ON public.group_chat_slow_mode_state
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.group_chat_slow_mode_state_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_chat_slow_mode_state_updated_at ON public.group_chat_slow_mode_state;
CREATE TRIGGER trg_group_chat_slow_mode_state_updated_at
  BEFORE UPDATE ON public.group_chat_slow_mode_state
  FOR EACH ROW
  EXECUTE FUNCTION public.group_chat_slow_mode_state_touch_updated_at();

CREATE OR REPLACE FUNCTION public.send_group_message_v1(
  p_group_id UUID,
  p_content TEXT,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_message_id UUID;
  v_created_at TIMESTAMPTZ;
  v_content TEXT := btrim(COALESCE(p_content, ''));
  v_member_role TEXT;
  v_slow_mode_seconds INTEGER := 0;
  v_last_sent_at TIMESTAMPTZ;
  v_wait_seconds INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_content = '' THEN
    RAISE EXCEPTION 'content is required' USING ERRCODE = '22023';
  END IF;

  SELECT gcm.role
    INTO v_member_role
  FROM public.group_chat_members gcm
  WHERE gcm.group_id = p_group_id
    AND gcm.user_id = v_actor
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no permission to send in this group' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(gc.slow_mode_seconds, 0)
    INTO v_slow_mode_seconds
  FROM public.group_chats gc
  WHERE gc.id = p_group_id
  LIMIT 1;

  IF COALESCE(v_slow_mode_seconds, 0) > 0
     AND COALESCE(v_member_role, '') NOT IN ('owner', 'admin') THEN
    SELECT s.last_sent_at
      INTO v_last_sent_at
    FROM public.group_chat_slow_mode_state s
    WHERE s.group_id = p_group_id
      AND s.user_id = v_actor
    LIMIT 1;

    IF FOUND AND v_last_sent_at > (now() - make_interval(secs => v_slow_mode_seconds)) THEN
      v_wait_seconds := GREATEST(
        1,
        CEIL(
          EXTRACT(
            EPOCH FROM ((v_last_sent_at + make_interval(secs => v_slow_mode_seconds)) - now())
          )
        )::INTEGER
      );
      RAISE EXCEPTION 'SLOW_MODE_WAIT:%', v_wait_seconds
        USING ERRCODE = 'P0001', DETAIL = 'group_slow_mode';
    END IF;
  END IF;

  INSERT INTO public.group_chat_messages (
    group_id,
    sender_id,
    content,
    media_url,
    media_type
  )
  VALUES (
    p_group_id,
    v_actor,
    v_content,
    NULLIF(btrim(COALESCE(p_media_url, '')), ''),
    NULLIF(btrim(COALESCE(p_media_type, '')), '')
  )
  RETURNING id, created_at INTO v_message_id, v_created_at;

  IF COALESCE(v_slow_mode_seconds, 0) > 0
     AND COALESCE(v_member_role, '') NOT IN ('owner', 'admin') THEN
    INSERT INTO public.group_chat_slow_mode_state (
      group_id,
      user_id,
      last_sent_at,
      updated_at
    )
    VALUES (
      p_group_id,
      v_actor,
      now(),
      now()
    )
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET
      last_sent_at = EXCLUDED.last_sent_at,
      updated_at = now();
  END IF;

  UPDATE public.group_chats
     SET updated_at = now()
   WHERE id = p_group_id;

  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_group_message_v1(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_group_message_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;
