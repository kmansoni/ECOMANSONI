-- ============================================================================
-- REELS ENGINE: Config Validation v1.0 (P1.2)
--
-- Validates config JSON against strict schema:
--  - Size: <= 500KB
--  - Type: object
--  - Required fields: algorithm_version, exploration_ratio, recency_days, freq_cap_hours
--  - Bounds: exploration_ratio [0,1], recency_days [1,365], freq_cap_hours [0,24]
--  - Weights (if present): each in [0,1], sum ~= 1.0 (±0.01)
--  - Unknown keys: warnings (not errors)
--
-- Returns: {valid, errors[], warnings[], suggestions[]}
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reels_engine_validate_config_v1(
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB := '{
    "valid": true,
    "errors": [],
    "warnings": [],
    "suggestions": []
  }'::JSONB;

  v_config_json TEXT;
  v_config_bytes INTEGER;
  v_max_bytes INTEGER := 512000;

  v_type TEXT;
  v_exploration_ratio NUMERIC;
  v_recency_days NUMERIC;
  v_freq_cap_hours NUMERIC;
  v_weights JSONB;
  v_algorithm_version TEXT;

  v_weight_key TEXT;
  v_weight_val NUMERIC;
  v_weight_sum NUMERIC := 0;
  v_weight_count INTEGER := 0;

  v_known_keys TEXT[] := ARRAY[
    'algorithm_version', 'exploration_ratio', 'recency_days', 'freq_cap_hours',
    'weights', 'description', 'config_schema_version'
  ];

  v_all_keys TEXT[];
  v_key TEXT;
  v_key_index INTEGER;
BEGIN
  -- Size check (critical).
  v_config_json := p_config::text;
  v_config_bytes := octet_length(v_config_json);
  IF v_config_bytes > v_max_bytes THEN
    v_result := jsonb_set(
      v_result,
      '{valid}',
      'false'::JSONB
    );
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'size_limit_exceeded',
        'path', '$',
        'message', format('Config size %s bytes exceeds maximum %s bytes', v_config_bytes, v_max_bytes),
        'meta', jsonb_build_object('max_bytes', v_max_bytes, 'actual_bytes', v_config_bytes)
      ))
    );
    RETURN v_result;
  END IF;

  -- Type check (critical): root must be object.
  IF p_config IS NULL THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'type_mismatch',
        'path', '$',
        'message', 'Config must be a JSON object, got null',
        'meta', jsonb_build_object('expected', 'object', 'actual', 'null')
      ))
    );
    RETURN v_result;
  END IF;

  IF jsonb_typeof(p_config) <> 'object' THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'type_mismatch',
        'path', '$',
        'message', format('Config must be a JSON object, got %s', jsonb_typeof(p_config)),
        'meta', jsonb_build_object('expected', 'object', 'actual', jsonb_typeof(p_config))
      ))
    );
    RETURN v_result;
  END IF;

  -- Required field: algorithm_version (string, non-empty, max 64).
  v_algorithm_version := p_config->>'algorithm_version';
  IF v_algorithm_version IS NULL THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'missing_required_field',
        'path', '$.algorithm_version',
        'message', 'Missing required field: algorithm_version'
      ))
    );
  ELSIF length(v_algorithm_version) = 0 THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'empty_string',
        'path', '$.algorithm_version',
        'message', 'algorithm_version cannot be empty'
      ))
    );
  ELSIF length(v_algorithm_version) > 64 THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'out_of_range',
        'path', '$.algorithm_version',
        'message', format('algorithm_version too long (%s > 64)', length(v_algorithm_version)),
        'meta', jsonb_build_object('max_length', 64, 'actual_length', length(v_algorithm_version))
      ))
    );
  END IF;

  -- Required field: exploration_ratio (number ∈ [0,1]).
  IF NOT (p_config ? 'exploration_ratio') THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'missing_required_field',
        'path', '$.exploration_ratio',
        'message', 'Missing required field: exploration_ratio'
      ))
    );
  ELSE
    BEGIN
      v_exploration_ratio := (p_config->>'exploration_ratio')::numeric;
      IF v_exploration_ratio < 0 OR v_exploration_ratio > 1 THEN
        v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
        v_result := jsonb_set(
          v_result,
          '{errors}',
          v_result->'errors' || jsonb_build_array(jsonb_build_object(
            'code', 'out_of_range',
            'path', '$.exploration_ratio',
            'message', format('exploration_ratio must be in [0,1], got %s', v_exploration_ratio),
            'meta', jsonb_build_object('min', 0, 'max', 1, 'actual', v_exploration_ratio)
          ))
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
      v_result := jsonb_set(
        v_result,
        '{errors}',
        v_result->'errors' || jsonb_build_array(jsonb_build_object(
          'code', 'type_mismatch',
          'path', '$.exploration_ratio',
          'message', format('exploration_ratio must be a number, got %s', jsonb_typeof(p_config->'exploration_ratio')),
          'meta', jsonb_build_object('expected', 'number', 'actual', jsonb_typeof(p_config->'exploration_ratio'))
        ))
      );
    END;
  END IF;

  -- Required field: recency_days (integer ∈ [1,365]).
  IF NOT (p_config ? 'recency_days') THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'missing_required_field',
        'path', '$.recency_days',
        'message', 'Missing required field: recency_days'
      ))
    );
  ELSE
    BEGIN
      v_recency_days := (p_config->>'recency_days')::numeric;
      IF v_recency_days < 1 OR v_recency_days > 365 THEN
        v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
        v_result := jsonb_set(
          v_result,
          '{errors}',
          v_result->'errors' || jsonb_build_array(jsonb_build_object(
            'code', 'out_of_range',
            'path', '$.recency_days',
            'message', format('recency_days must be in [1,365], got %s', v_recency_days),
            'meta', jsonb_build_object('min', 1, 'max', 365, 'actual', v_recency_days)
          ))
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
      v_result := jsonb_set(
        v_result,
        '{errors}',
        v_result->'errors' || jsonb_build_array(jsonb_build_object(
          'code', 'type_mismatch',
          'path', '$.recency_days',
          'message', format('recency_days must be a number, got %s', jsonb_typeof(p_config->'recency_days')),
          'meta', jsonb_build_object('expected', 'number', 'actual', jsonb_typeof(p_config->'recency_days'))
        ))
      );
    END;
  END IF;

  -- Required field: freq_cap_hours (number ∈ [0,24]).
  IF NOT (p_config ? 'freq_cap_hours') THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
    v_result := jsonb_set(
      v_result,
      '{errors}',
      v_result->'errors' || jsonb_build_array(jsonb_build_object(
        'code', 'missing_required_field',
        'path', '$.freq_cap_hours',
        'message', 'Missing required field: freq_cap_hours'
      ))
    );
  ELSE
    BEGIN
      v_freq_cap_hours := (p_config->>'freq_cap_hours')::numeric;
      IF v_freq_cap_hours < 0 OR v_freq_cap_hours > 24 THEN
        v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
        v_result := jsonb_set(
          v_result,
          '{errors}',
          v_result->'errors' || jsonb_build_array(jsonb_build_object(
            'code', 'out_of_range',
            'path', '$.freq_cap_hours',
            'message', format('freq_cap_hours must be in [0,24], got %s', v_freq_cap_hours),
            'meta', jsonb_build_object('min', 0, 'max', 24, 'actual', v_freq_cap_hours)
          ))
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
      v_result := jsonb_set(
        v_result,
        '{errors}',
        v_result->'errors' || jsonb_build_array(jsonb_build_object(
          'code', 'type_mismatch',
          'path', '$.freq_cap_hours',
          'message', format('freq_cap_hours must be a number, got %s', jsonb_typeof(p_config->'freq_cap_hours')),
          'meta', jsonb_build_object('expected', 'number', 'actual', jsonb_typeof(p_config->'freq_cap_hours'))
        ))
      );
    END;
  END IF;

  -- Optional field: weights (if present, validate).
  IF p_config ? 'weights' THEN
    v_weights := p_config->'weights';

    IF jsonb_typeof(v_weights) <> 'object' THEN
      v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
      v_result := jsonb_set(
        v_result,
        '{errors}',
        v_result->'errors' || jsonb_build_array(jsonb_build_object(
          'code', 'type_mismatch',
          'path', '$.weights',
          'message', format('weights must be an object, got %s', jsonb_typeof(v_weights)),
          'meta', jsonb_build_object('expected', 'object', 'actual', jsonb_typeof(v_weights))
        ))
      );
    ELSIF v_weights = '{}'::JSONB THEN
      v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
      v_result := jsonb_set(
        v_result,
        '{errors}',
        v_result->'errors' || jsonb_build_array(jsonb_build_object(
          'code', 'empty_object',
          'path', '$.weights',
          'message', 'weights object cannot be empty'
        ))
      );
    ELSE
      -- Check each weight value is in [0,1] and sum ~= 1.0.
      FOR v_weight_key, v_weight_val IN
        SELECT key, (value::TEXT)::numeric FROM jsonb_each_text(v_weights)
      LOOP
        v_weight_count := v_weight_count + 1;
        BEGIN
          IF v_weight_val < 0 OR v_weight_val > 1 THEN
            v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
            v_result := jsonb_set(
              v_result,
              '{errors}',
              v_result->'errors' || jsonb_build_array(jsonb_build_object(
                'code', 'out_of_range',
                'path', format('$.weights.%s', v_weight_key),
                'message', format('weight must be in [0,1], got %s', v_weight_val),
                'meta', jsonb_build_object('min', 0, 'max', 1, 'actual', v_weight_val)
              ))
            );
          END IF;
          v_weight_sum := v_weight_sum + v_weight_val;
        EXCEPTION WHEN OTHERS THEN
          v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
          v_result := jsonb_set(
            v_result,
            '{errors}',
            v_result->'errors' || jsonb_build_array(jsonb_build_object(
              'code', 'type_mismatch',
              'path', format('$.weights.%s', v_weight_key),
              'message', 'weight value must be a number'
            ))
          );
        END;
      END LOOP;

      -- Check sum ~= 1.0 (tolerance 0.01).
      IF v_weight_count > 0 AND (v_weight_sum < 0.99 OR v_weight_sum > 1.01) THEN
        v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
        v_result := jsonb_set(
          v_result,
          '{errors}',
          v_result->'errors' || jsonb_build_array(jsonb_build_object(
            'code', 'weights_sum_not_one',
            'path', '$.weights',
            'message', format('weights sum must be ~= 1.0 (tolerance 0.01), got %s', round(v_weight_sum::numeric, 4)),
            'meta', jsonb_build_object('sum', round(v_weight_sum::numeric, 4), 'tolerance', 0.01)
          ))
        );
      END IF;
    END IF;
  END IF;

  -- Unknown keys (WARNING, not error).
  v_all_keys := array_agg(key) FROM jsonb_object_keys(p_config) AS key;
  FOREACH v_key IN ARRAY v_all_keys LOOP
    IF NOT (v_key = ANY(v_known_keys)) THEN
      v_result := jsonb_set(
        v_result,
        '{warnings}',
        v_result->'warnings' || jsonb_build_array(jsonb_build_object(
          'code', 'unknown_key',
          'path', format('$.%s', v_key),
          'message', format('Unknown configuration key: %s', v_key)
        ))
      );
    END IF;
  END LOOP;

  -- Set valid = false if there are any errors.
  IF jsonb_array_length(v_result->'errors') > 0 THEN
    v_result := jsonb_set(v_result, '{valid}', 'false'::JSONB);
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.reels_engine_validate_config_v1(JSONB)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_validate_config_v1(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_validate_config_v1(JSONB)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Validate config version from database
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reels_engine_validate_config_version_v1(
  p_version_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT public.reels_engine_validate_config_v1(c.config)
  FROM public.reels_engine_config_versions c
  WHERE c.id = p_version_id;
$$;

ALTER FUNCTION public.reels_engine_validate_config_version_v1(UUID)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_validate_config_version_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_validate_config_version_v1(UUID)
  TO service_role;
