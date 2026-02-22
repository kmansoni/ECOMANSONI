-- Bulk hashtag status write-path v1
-- Service-only: update many hashtags + audit changes + single explore cache invalidation

CREATE OR REPLACE FUNCTION public.set_hashtag_status_bulk_v1(
  p_hashtags TEXT[],
  p_to_status TEXT,
  p_reason_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_surface_policy JSONB DEFAULT '{}'::JSONB,
  p_notes TEXT DEFAULT NULL,
  p_actor_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  normalized_tag TEXT,
  from_status TEXT,
  to_status TEXT,
  status_updated_at TIMESTAMPTZ,
  change_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to TEXT;
  v_input TEXT;
  v_norm TEXT;
  v_row public.hashtags%ROWTYPE;
  v_from TEXT;
  v_change_id UUID;
  v_any_changed BOOLEAN := FALSE;
  v_hashtags TEXT[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'set_hashtag_status_bulk_v1 requires service_role';
  END IF;

  v_to := lower(trim(COALESCE(p_to_status, '')));
  IF v_to NOT IN ('normal','restricted','hidden') THEN
    RAISE EXCEPTION 'Invalid hashtag status: %', v_to;
  END IF;

  v_hashtags := COALESCE(p_hashtags, ARRAY[]::TEXT[]);
  IF array_length(v_hashtags, 1) IS NULL OR array_length(v_hashtags, 1) = 0 THEN
    RAISE EXCEPTION 'Missing hashtags';
  END IF;

  IF p_actor_admin_user_id IS NOT NULL THEN
    IF NOT public.admin_has_scope_v1(p_actor_admin_user_id, 'hashtag.status.write') THEN
      RAISE EXCEPTION 'Missing scope hashtag.status.write for admin_user_id=%', p_actor_admin_user_id;
    END IF;
  END IF;

  -- Normalize and process distinct tags
  FOREACH v_input IN ARRAY (
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(v_hashtags) AS x
      WHERE x IS NOT NULL AND length(trim(x)) > 0
      LIMIT 500
    )
  )
  LOOP
    v_norm := lower(regexp_replace(COALESCE(v_input,''), '^#', ''));
    v_norm := regexp_replace(v_norm, '[^а-яА-ЯёЁa-zA-Z0-9_]+', '', 'g');
    IF length(v_norm) = 0 THEN
      RAISE EXCEPTION 'Invalid hashtag: %', v_input;
    END IF;

    SELECT * INTO v_row
    FROM public.hashtags
    WHERE normalized_tag = v_norm
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.hashtags (tag, normalized_tag, status, status_updated_at)
      VALUES (CONCAT('#', v_norm), v_norm, v_to, now())
      RETURNING * INTO v_row;
    END IF;

    v_from := COALESCE(v_row.status, 'normal');

    IF v_from = v_to THEN
      normalized_tag := v_norm;
      from_status := v_from;
      to_status := v_to;
      status_updated_at := v_row.status_updated_at;
      change_id := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    UPDATE public.hashtags
       SET status = v_to,
           status_updated_at = now()
     WHERE id = v_row.id
     RETURNING status_updated_at INTO status_updated_at;

    INSERT INTO public.hashtag_status_changes (
      hashtag_id,
      from_status,
      to_status,
      actor_type,
      actor_id,
      reason_codes,
      surface_policy,
      notes
    ) VALUES (
      v_row.id,
      v_from,
      v_to,
      CASE WHEN p_actor_admin_user_id IS NULL THEN 'system' ELSE 'moderator' END,
      p_actor_admin_user_id,
      COALESCE(p_reason_codes, ARRAY[]::TEXT[]),
      COALESCE(p_surface_policy, '{}'::JSONB),
      p_notes
    ) RETURNING hashtag_status_changes.change_id INTO v_change_id;

    v_any_changed := TRUE;

    normalized_tag := v_norm;
    from_status := v_from;
    to_status := v_to;
    change_id := v_change_id;
    RETURN NEXT;
  END LOOP;

  IF v_any_changed THEN
    UPDATE public.explore_cache_entries
       SET status = 'invalidated',
           expires_at = now(),
           reason_codes = (
             SELECT ARRAY(
               SELECT DISTINCT x
               FROM unnest(COALESCE(reason_codes, ARRAY[]::TEXT[]) || ARRAY['hashtag.status_changed_bulk']::TEXT[]) AS x
             )
           ),
           updated_at = now()
     WHERE status <> 'invalidated';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_hashtag_status_bulk_v1(TEXT[], TEXT, TEXT[], JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_hashtag_status_bulk_v1(TEXT[], TEXT, TEXT[], JSONB, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.set_hashtag_status_bulk_v1 IS
  'Service-only: bulk changes hashtag statuses with audit rows + single explore cache invalidation. Actor is an admin_user_id validated via admin_has_scope_v1.';
