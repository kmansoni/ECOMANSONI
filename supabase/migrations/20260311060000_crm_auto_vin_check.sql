-- ══════════════════════════════════════════════════════════════════════════════
-- VIN Check support functions
-- Called by supabase/functions/vin-check/index.ts Edge Function
-- ══════════════════════════════════════════════════════════════════════════════

-- RPC: update vin check result (called from Edge Function with service role)
CREATE OR REPLACE FUNCTION public.crm_update_vin_check(
  p_vehicle_id  uuid,
  p_vin_result  jsonb,
  p_checked_at  timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
BEGIN
  UPDATE crm.auto_vehicles
  SET
    vin_checked      = true,
    vin_check_result = jsonb_build_object(
      'accidents',     COALESCE((p_vin_result->>'accidents_count')::int, 0),
      'owners',        COALESCE((p_vin_result->>'owners_count')::int, 1),
      'restrictions',  COALESCE((p_vin_result->>'restrictions')::boolean, false),
      'wanted',        COALESCE((p_vin_result->>'stolen')::boolean, false),
      'pledges',       COALESCE((p_vin_result->>'pledges')::boolean, false),
      'pledges_count', COALESCE((p_vin_result->>'pledges_count')::int, 0),
      'risk_score',    COALESCE((p_vin_result->>'total_risk_score')::int, 0),
      'risk_factors',  COALESCE(p_vin_result->'risk_factors', '[]'::jsonb),
      'recommendation', COALESCE(p_vin_result->>'recommendation', 'buy'),
      'full_data',     p_vin_result
    ),
    vin_checked_at   = p_checked_at,
    updated_at       = now()
  WHERE id = p_vehicle_id;
END;
$$;

-- Allow service role to call this function
GRANT EXECUTE ON FUNCTION public.crm_update_vin_check(uuid, jsonb, timestamptz) TO service_role;

-- RPC: get cached vin check for a vehicle
CREATE OR REPLACE FUNCTION crm.get_vehicle_vin_check(p_vehicle_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT vin_check_result
  FROM crm.auto_vehicles
  WHERE id = p_vehicle_id AND user_id = auth.uid()
$$;
