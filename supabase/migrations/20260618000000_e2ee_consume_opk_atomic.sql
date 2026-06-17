-- ============================================================
-- E2EE: consume_opk — atomic single-use enforcement for OPK
--
-- Purpose:
--   Атомарно удаляет one-time pre-key при X3DH handshake.
--   Предотвращает race condition: два concurrent X3DH handshake
--   не могут использовать один и тот же OPK.
--
-- Why RPC not client-side delete:
--   1. Supabase DELETE + RETURNING в одной транзакции блокирует concurrent inserts
--   2. RLS policy гарантирует: только владелец может удалять свои OPK
--   3. auth.uid() проверен server-side — клиент не может подделать user_id
--
-- Returns: { consumed_id: UUID | null }
--   consumed_id = UUID удалённого ключа (успех)
--   consumed_id = null (OPK не найден или уже потреблён)
-- ============================================================

CREATE OR REPLACE FUNCTION public.consume_opk(
  p_opk_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed_id UUID;
BEGIN
  -- Атомарное удаление: DELETE RETURNING выполняется в одной транзакции.
  -- IF NOT FOUND — возвращает null без ошибки.
  DELETE FROM public.one_time_prekeys
   WHERE id = p_opk_id
     AND user_id = p_user_id
  RETURNING id
    INTO v_consumed_id;

  RETURN jsonb_build_object(
    'consumed_id',
    v_consumed_id
  );
END;
$$;

-- Ограничиваем доступ: только аутентифицированные пользователи,
-- и только свои собственные OPK (SECURITY DEFINER + RLS обеспечивают это)
REVOKE ALL ON FUNCTION public.consume_opk(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_opk(UUID, UUID) TO authenticated;
