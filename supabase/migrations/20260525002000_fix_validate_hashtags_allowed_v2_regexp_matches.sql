-- Fix runtime error: regexp_replace(text[], ...) in validate_hashtags_allowed_v2.
-- regexp_matches(..., 'g') returns setof text[]; use match[1].

CREATE OR REPLACE FUNCTION public.validate_hashtags_allowed_v2(
  p_text text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_blocked TEXT[];
  v_user_age_tier age_tier;
  v_user_rating_limit content_rating;
BEGIN
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN;
  END IF;

  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT age_tier, content_rating_limit INTO v_user_age_tier, v_user_rating_limit
    FROM public.profiles
    WHERE id = p_user_id;

    IF FOUND AND v_user_age_tier IN ('teen', 'child_supervised') THEN
      WITH extracted AS (
        SELECT DISTINCT lower(regexp_replace(match[1], '^#', '')) AS normalized_tag
        FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS match
      )
      SELECT array_agg(COALESCE(h.tag, '#' || e.normalized_tag) ORDER BY COALESCE(h.tag, '#' || e.normalized_tag))
      INTO v_blocked
      FROM extracted e
      JOIN public.hashtags h ON h.normalized_tag = e.normalized_tag
      WHERE
        h.age_restriction > v_user_rating_limit
        OR (
          v_user_age_tier = 'child_supervised' AND h.age_restriction != 'G'
        )
      LIMIT 20;

      IF v_blocked IS NOT NULL AND array_length(v_blocked, 1) > 0 THEN
        RAISE EXCEPTION 'HASHTAG_AGE_RESTRICTED:%', array_to_string(v_blocked, ', ')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  WITH extracted AS (
    SELECT DISTINCT lower(regexp_replace(match[1], '^#', '')) AS normalized_tag
    FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS match
  )
  SELECT array_agg(COALESCE(h.tag, '#' || e.normalized_tag) ORDER BY COALESCE(h.tag, '#' || e.normalized_tag))
  INTO v_blocked
  FROM extracted e
  JOIN public.hashtags h ON h.normalized_tag = e.normalized_tag
  WHERE COALESCE(h.status, 'normal') <> 'normal'
  LIMIT 20;

  IF v_blocked IS NOT NULL AND array_length(v_blocked, 1) > 0 THEN
    RAISE EXCEPTION 'HASHTAG_BLOCKED:%', array_to_string(v_blocked, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
