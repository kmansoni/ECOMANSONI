-- Extend decision_engine_events allowed source_system values to include discovery

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_source_system_chk'
      AND conrelid = 'public.decision_engine_events'::regclass
  ) THEN
    ALTER TABLE public.decision_engine_events
      DROP CONSTRAINT events_source_system_chk;
  END IF;

  ALTER TABLE public.decision_engine_events
    ADD CONSTRAINT events_source_system_chk
    CHECK (
      source_system IN (
        'reels',
        'posts',
        'comments',
        'admin',
        'system',
        'discovery'
      )
    );
END
$$;
