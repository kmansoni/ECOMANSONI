-- ============================================================
-- Migration: Fix message edit numbering alignment
-- Issue: history.edit_number was written before edit_count increment,
--        causing 0-indexed history vs 1-indexed messages.edit_count.
-- Date: 2026-03-08
-- ============================================================

-- 1) Fix trigger function for all future edits.
CREATE OR REPLACE FUNCTION public.on_message_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_edit_number INTEGER;
  v_edited_at TIMESTAMPTZ;
BEGIN
  -- Only record when content actually changes.
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    v_next_edit_number := COALESCE(OLD.edit_count, 0) + 1;
    v_edited_at := now();

    INSERT INTO public.message_edit_history (
      message_id,
      editor_id,
      old_content,
      new_content,
      edited_at,
      edit_number
    ) VALUES (
      NEW.id,
      -- FIX: messages table defines this column as sender_id (not author_id).
      -- author_id does not exist and caused runtime errors when auth.uid() = NULL
      -- (service_role context: moderation, bots, backend edits).
      COALESCE(auth.uid(), NEW.sender_id),
      OLD.content,
      NEW.content,
      v_edited_at,
      v_next_edit_number
    );

    NEW.edit_count := v_next_edit_number;
    NEW.edited_at := v_edited_at;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Backfill existing history to canonical 1..N numbering per message.
WITH ranked AS (
  SELECT
    h.id,
    row_number() OVER (
      PARTITION BY h.message_id
      ORDER BY h.edited_at ASC, h.id ASC
    )::INTEGER AS canonical_edit_number
  FROM public.message_edit_history h
)
UPDATE public.message_edit_history h
SET edit_number = r.canonical_edit_number
FROM ranked r
WHERE h.id = r.id
  AND h.edit_number IS DISTINCT FROM r.canonical_edit_number;

-- 3) Sync messages.edit_count / messages.edited_at from history aggregate.
WITH agg AS (
  SELECT
    h.message_id,
    count(*)::INTEGER AS edits_count,
    max(h.edited_at) AS last_edited_at
  FROM public.message_edit_history h
  GROUP BY h.message_id
)
UPDATE public.messages m
SET
  edit_count = a.edits_count,
  edited_at = a.last_edited_at
FROM agg a
WHERE m.id = a.message_id
  AND (
    m.edit_count IS DISTINCT FROM a.edits_count
    OR m.edited_at IS DISTINCT FROM a.last_edited_at
  );

-- 4) Normalize stale rows that have non-zero counters without history rows.
UPDATE public.messages m
SET
  edit_count = 0,
  edited_at = NULL
WHERE m.edit_count <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.message_edit_history h
    WHERE h.message_id = m.id
  );

-- 5) Enforce uniqueness of ordinal within each message's edit history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_edit_history_message_edit_number
  ON public.message_edit_history(message_id, edit_number);
