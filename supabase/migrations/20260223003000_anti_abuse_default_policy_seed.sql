-- Anti-abuse: ensure a default enabled policy exists for seg_default

INSERT INTO public.anti_abuse_policies (
  policy_name,
  description,
  version,
  algorithm_version,
  default_trust_weight,
  bot_threshold,
  coordinated_threshold,
  violation_penalty,
  coordinated_penalty,
  recent_ban_penalty,
  segment_id,
  enabled,
  rollout_percentage
)
SELECT
  'default',
  'Default anti-abuse policy (seeded)',
  1,
  'anti-abuse-v1',
  1.0,
  0.7,
  0.8,
  0.1,
  0.3,
  0.5,
  'seg_default',
  TRUE,
  100
WHERE NOT EXISTS (
  SELECT 1
  FROM public.anti_abuse_policies
  WHERE policy_name = 'default'
);
