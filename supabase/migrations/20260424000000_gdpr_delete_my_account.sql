-- GDPR: полное удаление аккаунта пользователя по его запросу
-- Вызывается через dbLoose.rpc("delete_my_account", { confirmation: "УДАЛИТЬ" })

CREATE OR REPLACE FUNCTION public.delete_my_account(confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF confirmation != 'УДАЛИТЬ' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid confirmation');
  END IF;

  -- Удаление данных (ON DELETE CASCADE покрывает большинство таблиц,
  -- но явно чистим то, что может не каскадироваться)

  DELETE FROM public.chat_messages       WHERE sender_id    = v_user_id;
  DELETE FROM public.chat_participants   WHERE user_id      = v_user_id;
  DELETE FROM public.chat_conversations  WHERE created_by   = v_user_id;
  DELETE FROM public.posts               WHERE user_id      = v_user_id;
  DELETE FROM public.comments            WHERE user_id      = v_user_id;
  DELETE FROM public.likes               WHERE user_id      = v_user_id;
  DELETE FROM public.follows             WHERE follower_id  = v_user_id
                                            OR following_id = v_user_id;
  DELETE FROM public.reels               WHERE user_id      = v_user_id;
  DELETE FROM public.stories             WHERE user_id      = v_user_id;
  DELETE FROM public.notifications       WHERE user_id      = v_user_id
                                            OR actor_id     = v_user_id;
  DELETE FROM public.video_calls         WHERE caller_id    = v_user_id
                                            OR callee_id    = v_user_id;
  DELETE FROM public.crm_contacts        WHERE user_id      = v_user_id;
  DELETE FROM public.crm_deals          WHERE user_id      = v_user_id;
  DELETE FROM public.orders              WHERE user_id      = v_user_id;
  DELETE FROM public.cart_items          WHERE user_id      = v_user_id;
  DELETE FROM public.real_estate_listings WHERE user_id     = v_user_id;
  DELETE FROM public.insurance_quotes    WHERE user_id      = v_user_id;
  DELETE FROM public.taxi_rides          WHERE user_id      = v_user_id;
  DELETE FROM public.live_streams        WHERE user_id      = v_user_id;
  DELETE FROM public.privacy_rules       WHERE user_id      = v_user_id;
  DELETE FROM public.privacy_rule_exceptions WHERE user_id  = v_user_id;
  DELETE FROM public.authorized_sites    WHERE user_id      = v_user_id;
  DELETE FROM public.user_security_settings WHERE user_id   = v_user_id;
  DELETE FROM public.user_settings       WHERE user_id      = v_user_id;
  DELETE FROM public.profiles            WHERE id           = v_user_id;

  -- Удаление auth пользователя (последний шаг)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Только сам пользователь может вызвать функцию
REVOKE ALL ON FUNCTION public.delete_my_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account(TEXT) TO authenticated;
