-- ============================================================
-- E2EE: consume_opk_by_id — atomic single-use enforcement by specific OPK id
--
-- Purpose:
--   Атомарно удаляет ОПРЕДЕЛЁННЫЙ OPK по id при X3DH responder handshake.
--   Предотвращает race: два concurrent инициатора не могут использовать один OPK.
--
--   Отличие от consume_one_time_prekey(user_id):
--     consume_one_time_prekey — выбирает ЛЮБОЙ случайный OPK, возвращает его SPKI.
--     consume_opk_by_id     — удаляет КОНКРЕТНЫЙ OPK по id, возвращает его SPKI.
--   Responder знает конкретный opk_id из PreKey bundle → использует этот RPC.
--
-- Returns: base64 public_key_spki | null
--   SPKI string — успех (используется в X3DH)
--   null — OPK не найден или уже потреблён
-- ============================================================

CREATE OR REPLACE FUNCTION public.consume_opk_by_id(
  p_opk_id  UUID,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spki TEXT;
BEGIN
  DELETE FROM public.one_time_prekeys
    WHERE id = p_opk_id
      AND user_id = p_user_id
  RETURNING public_key_spki
    INTO v_spki;

  RETURN v_spki;  -- TEXT (base64 SPKI) or NULL
END;
$$;

-- Ограничиваем доступ: только аутентифицированные,
-- и только свои собственные OPK (SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.consume_opk_by_id(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_opk_by_id(UUID, UUID) TO authenticated;
