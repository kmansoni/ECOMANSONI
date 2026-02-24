-- Hotfix: validate_hashtags_allowed_v1 used regexp_replace(text[]) and crashed on chat sends.
-- Root cause: regexp_matches(..., 'g') returns SETOF text[]; use first capture element.

CREATE OR REPLACE FUNCTION public.validate_hashtags_allowed_v1(p_text TEXT)
RETURNS VOID AS $$
DECLARE
  v_blocked TEXT[];
BEGIN
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN;
  END IF;

  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN;
  END IF;

  WITH extracted AS (
    SELECT DISTINCT lower(regexp_replace(m[1], '^#', '')) AS normalized_tag
    FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS m
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.validate_hashtags_allowed_v1(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_hashtags_allowed_v1(TEXT) TO service_role;
