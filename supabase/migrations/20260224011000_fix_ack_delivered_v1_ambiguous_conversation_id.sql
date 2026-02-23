-- Fix: avoid ambiguous "conversation_id" resolution inside ack_delivered_v1.
-- Symptom: 42702 "column reference \"conversation_id\" is ambiguous"
-- in PL/pgSQL due to RETURNS TABLE output vars + SQL column names.

CREATE OR REPLACE FUNCTION public.ack_delivered_v1(
  p_conversation_id UUID,
  p_up_to_seq BIGINT
)
RETURNS TABLE (
  conversation_id UUID,
  user_id UUID,
  delivered_up_to_seq BIGINT,
  read_up_to_seq BIGINT,
  server_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_delivered BIGINT;
  v_read BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;
  IF p_up_to_seq IS NULL OR p_up_to_seq < 0 THEN
    RAISE EXCEPTION 'invalid_seq' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.conversation_cursors AS cc (
    conversation_id,
    user_id,
    delivered_up_to_seq,
    read_up_to_seq,
    updated_at
  )
  VALUES (p_conversation_id, v_user, p_up_to_seq, 0, now())
  ON CONFLICT ON CONSTRAINT conversation_cursors_pkey
  DO UPDATE SET
    delivered_up_to_seq = GREATEST(cc.delivered_up_to_seq, EXCLUDED.delivered_up_to_seq),
    updated_at = now()
  RETURNING cc.delivered_up_to_seq, cc.read_up_to_seq
  INTO v_delivered, v_read;

  PERFORM public.rpc_audit_write_v1('ack_delivered_v1', p_conversation_id, NULL, NULL, 'ok', NULL);

  conversation_id := p_conversation_id;
  user_id := v_user;
  delivered_up_to_seq := v_delivered;
  read_up_to_seq := v_read;
  server_time := now();
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ack_delivered_v1(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_delivered_v1(UUID, BIGINT) TO authenticated;
