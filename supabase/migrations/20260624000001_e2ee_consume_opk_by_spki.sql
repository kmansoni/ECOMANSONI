-- ============================================================
-- E2EE: consume_opk_by_spki — atomic single-use enforcement by SPKI
--
-- Purpose:
--   Атомарно удаляет ОПРЕДЕЛЁННЫЙ OPK по base64 SPKI при X3DH responder handshake.
--   Предотвращает race: два concurrent инициатора не могут использовать один OPK.
--
--   Отличие от consume_one_time_prekey(user_id):
--     consume_one_time_prekey      — выбирает ЛЮБОЙ случайный OPK, возвращает его SPKI.
--     consume_opk_by_spki(spki)   — удаляет КОНКРЕТНЫЙ OPK по SPKI, возвращает SPKI.
--
--   Responder получает SPKI потреблённого OPK от инициатора через
--   secret_chats.initiator_used_one_time_prekey_public (base64 SPKI).
--   Ищет приватный ключ в secretBlob по этому SPKI.
--
-- Returns: base64 public_key_spki | null
--   SPKI string — успех (используется в X3DH)
--   null — OPK не найден или уже потреблён
-- ============================================================

CREATE OR REPLACE FUNCTION public.consume_opk_by_spki(
  p_spki     TEXT,
  p_user_id  UUID
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
    WHERE public_key_spki = p_spki
      AND user_id = p_user_id
  RETURNING public_key_spki
    INTO v_spki;

  RETURN v_spki;  -- TEXT (base64 SPKI) or NULL
END;
$$;

-- Ограничиваем доступ: только аутентифицированные,
-- и только свои собственные OPK (SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.consume_opk_by_spki(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_opk_by_spki(TEXT, UUID) TO authenticated;
