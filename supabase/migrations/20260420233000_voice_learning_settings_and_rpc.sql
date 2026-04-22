-- =============================================================================
-- Navigator voice-learning production settings and RPCs
-- =============================================================================

ALTER TABLE public.navigator_settings
  ADD COLUMN IF NOT EXISTS voice_learning_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_backend_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_allow_online_fallback BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.upsert_navigator_settings(
  p_user_id UUID,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO navigator_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE navigator_settings
  SET
    sound_mode = COALESCE((p_settings->>'sound_mode'), sound_mode),
    volume = COALESCE((p_settings->>'volume')::int, volume),
    mute_other_apps = COALESCE((p_settings->>'mute_other_apps')::bool, mute_other_apps),
    selected_voice = COALESCE((p_settings->>'selected_voice'), selected_voice),
    voice_enabled = COALESCE((p_settings->>'voice_enabled')::bool, voice_enabled),
    voice_learning_enabled = COALESCE((p_settings->>'voice_learning_enabled')::bool, voice_learning_enabled),
    voice_backend_sync_enabled = COALESCE((p_settings->>'voice_backend_sync_enabled')::bool, voice_backend_sync_enabled),
    voice_allow_online_fallback = COALESCE((p_settings->>'voice_allow_online_fallback')::bool, voice_allow_online_fallback),
    avoid_tolls = COALESCE((p_settings->>'avoid_tolls')::bool, avoid_tolls),
    avoid_unpaved = COALESCE((p_settings->>'avoid_unpaved')::bool, avoid_unpaved),
    avoid_highways = COALESCE((p_settings->>'avoid_highways')::bool, avoid_highways),
    selected_vehicle = COALESCE((p_settings->>'selected_vehicle'), selected_vehicle),
    map_view_mode = COALESCE((p_settings->>'map_view_mode'), map_view_mode),
    nav_theme = COALESCE((p_settings->>'nav_theme'), nav_theme),
    show_3d_buildings = COALESCE((p_settings->>'show_3d_buildings')::bool, show_3d_buildings),
    show_traffic_lights = COALESCE((p_settings->>'show_traffic_lights')::bool, show_traffic_lights),
    show_speed_bumps = COALESCE((p_settings->>'show_speed_bumps')::bool, show_speed_bumps),
    show_road_signs = COALESCE((p_settings->>'show_road_signs')::bool, show_road_signs),
    show_lanes = COALESCE((p_settings->>'show_lanes')::bool, show_lanes),
    show_speed_cameras = COALESCE((p_settings->>'show_speed_cameras')::bool, show_speed_cameras),
    show_poi = COALESCE((p_settings->>'show_poi')::bool, show_poi),
    show_panorama = COALESCE((p_settings->>'show_panorama')::bool, show_panorama),
    label_size_multiplier = COALESCE((p_settings->>'label_size_multiplier')::numeric, label_size_multiplier),
    high_contrast_labels = COALESCE((p_settings->>'high_contrast_labels')::bool, high_contrast_labels)
  WHERE user_id = p_user_id;

  SELECT * INTO result FROM navigator_settings WHERE user_id = p_user_id;
  RETURN to_jsonb(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.nav_record_voice_learning_event(
  p_transcript_draft TEXT,
  p_transcript_final TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT 'ru',
  p_accent_tag TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'voice',
  p_novelty_score NUMERIC DEFAULT 0,
  p_parsed_address JSONB DEFAULT '{}'::jsonb,
  p_validation_status TEXT DEFAULT 'pending_review',
  p_validation_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.nav_voice_utterances (
    user_id,
    transcript_draft,
    transcript_final,
    language_code,
    accent_tag,
    source,
    novelty_score,
    parsed_address,
    validation_status,
    validation_payload,
    metadata
  ) VALUES (
    v_user_id,
    p_transcript_draft,
    p_transcript_final,
    p_language_code,
    p_accent_tag,
    p_source,
    COALESCE(p_novelty_score, 0),
    COALESCE(p_parsed_address, '{}'::jsonb),
    COALESCE(p_validation_status, 'pending_review'),
    COALESCE(p_validation_payload, '{}'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  IF COALESCE(p_novelty_score, 0) >= 0.6 THEN
    INSERT INTO public.nav_address_hotspots (
      utterance_id,
      user_id,
      transcript,
      parsed_address,
      novelty_score,
      reasons,
      text_variants,
      synthetic_jobs,
      status
    ) VALUES (
      v_id,
      v_user_id,
      COALESCE(p_transcript_final, p_transcript_draft),
      COALESCE(p_parsed_address, '{}'::jsonb),
      COALESCE(p_novelty_score, 0),
      COALESCE(p_metadata->'novelty_reasons', '[]'::jsonb),
      COALESCE(p_metadata->'query_variants', '[]'::jsonb),
      COALESCE(p_metadata->'synthetic_jobs', '[]'::jsonb),
      'queued'
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nav_record_voice_feedback(
  p_utterance_id UUID,
  p_corrected_transcript TEXT,
  p_corrected_address JSONB DEFAULT '{}'::jsonb,
  p_feedback_type TEXT DEFAULT 'explicit_correction',
  p_sample_source TEXT DEFAULT 'user_correction',
  p_validation_source TEXT DEFAULT 'user_selection',
  p_confidence NUMERIC DEFAULT 0.99,
  p_novelty_score NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sample_id UUID;
  v_feedback_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.nav_voice_training_samples (
    utterance_id,
    user_id,
    transcript_final,
    address_json,
    novelty_score,
    confidence,
    is_valid,
    validation_source,
    sample_source
  ) VALUES (
    p_utterance_id,
    v_user_id,
    p_corrected_transcript,
    COALESCE(p_corrected_address, '{}'::jsonb),
    COALESCE(p_novelty_score, 0),
    COALESCE(p_confidence, 0.99),
    true,
    p_validation_source,
    p_sample_source
  ) RETURNING id INTO v_sample_id;

  INSERT INTO public.nav_voice_feedback (
    user_id,
    utterance_id,
    sample_id,
    corrected_transcript,
    corrected_address,
    feedback_type
  ) VALUES (
    v_user_id,
    p_utterance_id,
    v_sample_id,
    p_corrected_transcript,
    COALESCE(p_corrected_address, '{}'::jsonb),
    p_feedback_type
  ) RETURNING id INTO v_feedback_id;

  INSERT INTO public.nav_address_patterns (
    country_code,
    city,
    street,
    house_number,
    corpus,
    building,
    structure,
    pattern_type,
    frequency,
    is_confirmed,
    confirmation_source,
    metadata
  ) VALUES (
    NULLIF(COALESCE(p_corrected_address->>'country', p_corrected_address->>'country_code'), ''),
    NULLIF(COALESCE(p_corrected_address->>'locality', p_corrected_address->>'city'), ''),
    COALESCE(NULLIF(p_corrected_address->>'road', ''), p_corrected_transcript),
    NULLIF(p_corrected_address->>'house_number', ''),
    NULLIF(COALESCE(p_corrected_address->>'corpus', p_corrected_address->>'block'), ''),
    NULLIF(p_corrected_address->>'building', ''),
    NULLIF(p_corrected_address->>'structure', ''),
    CASE WHEN COALESCE(p_corrected_address->>'corpus', p_corrected_address->>'block', '') <> '' THEN 'house_corpus' ELSE 'house_number' END,
    1,
    true,
    p_validation_source,
    jsonb_build_object('source', p_sample_source)
  )
  ON CONFLICT (country_code, city, street, house_number, corpus, building, structure)
  DO UPDATE SET
    frequency = public.nav_address_patterns.frequency + 1,
    last_seen = now(),
    is_confirmed = true,
    confirmation_source = EXCLUDED.confirmation_source,
    metadata = public.nav_address_patterns.metadata || EXCLUDED.metadata;

  RETURN jsonb_build_object(
    'sample_id', v_sample_id,
    'feedback_id', v_feedback_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nav_record_voice_learning_event(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nav_record_voice_learning_event(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, JSONB, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.nav_record_voice_feedback(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nav_record_voice_feedback(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;