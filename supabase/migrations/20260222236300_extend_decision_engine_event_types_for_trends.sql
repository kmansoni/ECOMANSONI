-- Extend decision_engine_events allowed event_type values for trends

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_event_type_chk'
      AND conrelid = 'public.decision_engine_events'::regclass
  ) THEN
    ALTER TABLE public.decision_engine_events
      DROP CONSTRAINT events_event_type_chk;
  END IF;

  ALTER TABLE public.decision_engine_events
    ADD CONSTRAINT events_event_type_chk
    CHECK (
      event_type IN (
        'hashtag_mentioned',
        'hashtag_engagement',
        'moderation_action',
        'rollback_triggered',
        'algorithm_update',
        'trend_run_requested',
        'trend_run_completed'
      )
    );
END
$$;
