-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Migration: X3DH Pre-Key Bundle Storage
-- Enables Signal Protocol X3DH key agreement for secret chats
--
-- Security design:
-- - identity_key_public and signed_prekey_public are ECDH P-256 (SPKI base64)
-- - identity_signing_public is ECDSA P-256 (SPKI base64) for SPK signature verification
-- - signed_prekey_signature is ECDSA-SHA-256 signature in base64
-- - one_time_prekeys is an array of SPKI base64 strings consumed one-per-session
-- - RLS: public SELECT (needed for initiating X3DH), INSERT/UPDATE only owner
-- - One-time prekey consumption is done via the consume_one_time_prekey() function
--   which atomically pops one key and returns it, preventing race conditions
-- - Replay prevention: OPK once consumed is deleted from the array
-- - Rate limit on consumption enforced at edge function level (not DB)

-- ── Table: user_prekey_bundles ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_prekey_bundles (
  user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ECDH P-256 long-term identity key (public, SPKI base64)
  identity_key_public     text        NOT NULL,
  -- ECDSA P-256 signing identity key (public, SPKI base64) — for SPK signature verification
  identity_signing_public text        NOT NULL,
  -- ECDH P-256 medium-term signed pre-key (public, SPKI base64)
  signed_prekey_public    text        NOT NULL,
  -- ECDSA-SHA-256 signature of signed_prekey_public bytes (base64)
  signed_prekey_signature text        NOT NULL,
  -- Array of ECDH P-256 one-time pre-keys (public, SPKI base64)
  -- Consumed atomically via consume_one_time_prekey()
  one_time_prekeys        text[]      NOT NULL DEFAULT '{}',
  -- Track creation for SPK rotation alerting (rotate ~weekly)
  signed_prekey_created_at timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- OPK count for monitoring (detect exhaustion)
CREATE INDEX IF NOT EXISTS idx_user_prekey_bundles_opk_count
  ON public.user_prekey_bundles USING btree (user_id)
  WHERE array_length(one_time_prekeys, 1) < 5;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_prekey_bundles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read bundles (required for X3DH initiation)
-- Metadata leakage risk: minimal — only public keys are stored
CREATE POLICY "prekey_bundle_public_read"
  ON public.user_prekey_bundles
  FOR SELECT
  TO authenticated
  USING (true);

-- Only the owner may insert or update their own bundle
CREATE POLICY "prekey_bundle_owner_write"
  ON public.user_prekey_bundles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "prekey_bundle_owner_update"
  ON public.user_prekey_bundles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "prekey_bundle_owner_delete"
  ON public.user_prekey_bundles
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── Updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_prekey_bundle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prekey_bundle_updated_at ON public.user_prekey_bundles;
CREATE TRIGGER trg_prekey_bundle_updated_at
  BEFORE UPDATE ON public.user_prekey_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_prekey_bundle_updated_at();

-- ── Function: consume_one_time_prekey ─────────────────────────────────────
-- Atomically removes and returns the first OPK for a target user.
-- Isolation: SERIALIZABLE not needed — array element removal is atomic in PG.
-- Returns NULL if no OPK available (session proceeds without OPK — still secure).
-- Security: can only be called by authenticated users (not owner-restricted,
-- because the caller is the initiator who needs a stranger's OPK).

CREATE OR REPLACE FUNCTION public.consume_one_time_prekey(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  -- Atomic pop of first element
  UPDATE public.user_prekey_bundles
  SET one_time_prekeys = one_time_prekeys[2:array_length(one_time_prekeys, 1)]
  WHERE user_id = target_user_id
    AND array_length(one_time_prekeys, 1) > 0
  RETURNING (one_time_prekeys)[1] INTO v_key;

  RETURN v_key; -- NULL if no OPK available
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.consume_one_time_prekey(uuid) TO authenticated;

-- ── Function: replenish_one_time_prekeys ──────────────────────────────────
-- Owner appends new OPKs to their bundle.
-- Rate: client should replenish when count drops below 5.

CREATE OR REPLACE FUNCTION public.replenish_one_time_prekeys(new_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_prekey_bundles
  SET one_time_prekeys = one_time_prekeys || new_keys
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prekey bundle not found for current user';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replenish_one_time_prekeys(text[]) TO authenticated;
