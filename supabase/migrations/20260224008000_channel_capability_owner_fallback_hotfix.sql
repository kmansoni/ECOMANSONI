-- HOTFIX: channel posting denied for some channel owners.
-- Cause:
-- - channel_has_capability() resolved role only from channel_members.
-- - If owner_id had no row in channel_members, role became "guest".
--
-- Fix:
-- 1) Backfill missing owner memberships.
-- 2) Make channel_has_capability() explicitly treat channels.owner_id as "owner".

-- 1) Backfill owners into channel_members (idempotent).
INSERT INTO public.channel_members (channel_id, user_id, role)
SELECT c.id, c.owner_id, 'owner'
FROM public.channels c
LEFT JOIN public.channel_members cm
  ON cm.channel_id = c.id
 AND cm.user_id = c.owner_id
WHERE cm.user_id IS NULL;

-- 2) Owner-aware capability resolver.
CREATE OR REPLACE FUNCTION public.channel_has_capability(
  _channel_id uuid,
  _user_id uuid,
  _capability_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with resolved_role as (
    select
      case
        when exists (
          select 1
          from public.channels c
          where c.id = _channel_id
            and c.owner_id = _user_id
        ) then 'owner'
        else coalesce((
          select cm.role
          from public.channel_members cm
          where cm.channel_id = _channel_id
            and cm.user_id = _user_id
          limit 1
        ), 'guest')
      end as role
  ),
  role_allow as (
    select coalesce((
      select crc.is_allowed
      from public.channel_role_capabilities crc
      where crc.role = (select role from resolved_role)
        and crc.capability_key = _capability_key
      limit 1
    ), false) as allowed
  ),
  override_allow as (
    select cco.is_enabled as enabled
    from public.channel_capability_overrides cco
    where cco.channel_id = _channel_id
      and cco.capability_key = _capability_key
    limit 1
  )
  select
    case
      when exists(select 1 from override_allow) then (select enabled from override_allow)
      else (select allowed from role_allow)
    end;
$$;

GRANT EXECUTE ON FUNCTION public.channel_has_capability(uuid, uuid, text) TO authenticated;

