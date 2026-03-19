SELECT
  user_id,
  display_name,
  full_name,
  first_name,
  last_name,
  username
FROM public.profiles
WHERE
  lower(coalesce(display_name, '')) LIKE '%дже%'
  OR lower(coalesce(full_name, '')) LIKE '%дже%'
  OR lower(coalesce(first_name, '')) LIKE '%дже%'
  OR lower(coalesce(last_name, '')) LIKE '%дже%'
ORDER BY updated_at DESC
LIMIT 20;