alter table public.navigator_settings
  alter column voice_allow_online_fallback set default true;

update public.navigator_settings
set voice_allow_online_fallback = true
where voice_allow_online_fallback = false;