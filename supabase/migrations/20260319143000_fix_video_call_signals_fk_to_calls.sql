-- Migration: Repoint video_call_signals.call_id FK to public.calls after calls unification
--
-- Root cause:
-- - After 20260319110000, new call IDs are created in public.calls.
-- - video_call_signals.call_id FK still referenced legacy public.video_calls_legacy.
-- - Inserts for new call IDs failed with 409 (FK violation) on /rest/v1/video_call_signals.
--
-- Strategy:
-- - Drop existing call_id FK(s) on video_call_signals in an idempotent way.
-- - Add FK to public.calls(id) with ON DELETE CASCADE.
-- - Use NOT VALID to avoid blocking on historical orphaned rows; new writes are validated.

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'video_call_signals'
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE a.attname = 'call_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.video_call_signals DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.video_call_signals
  ADD CONSTRAINT video_call_signals_call_id_fkey
  FOREIGN KEY (call_id)
  REFERENCES public.calls(id)
  ON DELETE CASCADE
  NOT VALID;

COMMIT;
