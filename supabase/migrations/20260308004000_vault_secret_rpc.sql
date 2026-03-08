-- ─── Vault Secret RPC ────────────────────────────────────────────────────────
-- Provides a SECURITY DEFINER helper that bot-payments edge function uses to
-- resolve Supabase Vault secret IDs into decrypted values.
--
-- Why is this needed?
--   • The Stripe secret key (sk_live_...) must NOT be stored in plaintext in
--     the bot_payment_providers.provider_config JSONB column — it would be
--     exposed to any RLS bypass or logical backup.
--   • Instead, the column stores the UUID of the vault.secrets entry:
--       { "vault_secret_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
--   • The edge function calls this RPC (via service_role) at payment time to
--     resolve the UUID to the decrypted key.  The key never touches a REST
--     response or application log.
--
-- Security:
--   • SECURITY DEFINER with SET search_path = vault, public prevents injection
--     via search_path manipulation.
--   • REVOKE ALL FROM PUBLIC; only service_role can call it.
--   • The function does not accept arbitrary SQL — input is validated as a UUID.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret
  INTO   v_secret
  FROM   vault.decrypted_secrets
  WHERE  id = secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'vault secret not found: %', secret_id;
  END IF;

  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.get_vault_secret(uuid) IS
  'Returns the decrypted value of a Supabase Vault secret by ID. '
  'Called by edge functions (service_role) to resolve provider API keys '
  'stored as Vault references instead of plaintext in JSONB columns.';

REVOKE ALL ON FUNCTION public.get_vault_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vault_secret(uuid) TO service_role;

-- ─── Column migration for bot_payment_providers ───────────────────────────────
-- Replace the insecure secret_key field with vault_secret_id.
-- If the column already exists (old schema), the script is idempotent.
DO $$
BEGIN
  -- Add vault_secret_id if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bot_payment_providers'
      AND column_name = 'vault_secret_id'
  ) THEN
    ALTER TABLE public.bot_payment_providers
      ADD COLUMN vault_secret_id uuid
        REFERENCES vault.secrets(id) ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.bot_payment_providers.vault_secret_id IS
  'UUID of the vault.secrets entry holding the provider API secret key. '
  'Never store raw API keys in provider_config JSONB.';
