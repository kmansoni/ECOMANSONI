/**
 * useTOTP — client-side TOTP 2FA hook.
 *
 * All cryptographic work and secret storage is performed server-side via
 * the `totp-setup` Edge Function.  The client only receives the secret
 * once (during setup) to populate the QR code; it is never persisted
 * client-side after that.
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TOTPSetupResult {
  otpauthUrl: string;
  secret: string;
  backupCodes: string[];
}

export interface TOTPState {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Call a TOTP edge‑function route via the Supabase SDK.
 * Uses supabase.functions.invoke() — no internal property access, no manual fetch.
 * The SDK automatically attaches the current session's JWT as Bearer token.
 */
async function callTOTPFunction(
  route: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(route, {
    method: "POST",
    body,
  });

  if (error) {
    // FunctionsHttpError carries a JSON body; extract the message if present.
    const message =
      (error as { context?: { error?: string } }).context?.error ??
      error.message ??
      "Edge Function error";
    return { data: null, error: message };
  }

  return { data, error: null };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTOTP() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if current user has 2FA enabled by querying the DB directly.
  // RLS ensures the user can only see their own row.
  const [isEnabled, setIsEnabled] = useState<boolean>(false);

  const checkEnabled = useCallback(async (): Promise<boolean> => {
     
    const { data, error: dbErr } = await (supabase as any)
      .from("user_totp_secrets")
      .select("is_enabled")
      .maybeSingle();

    if (dbErr) {
      setError(dbErr.message);
      return false;
    }
    const enabled = (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
    setIsEnabled(enabled);
    return enabled;
  }, []);

  /**
   * Start setup: generates a new secret on the server.
   * Returns { otpauthUrl, secret, backupCodes } to show to the user.
   */
  const setup = useCallback(async (): Promise<TOTPSetupResult | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await callTOTPFunction("totp-setup", {});
      if (fnErr) {
        setError(fnErr);
        return null;
      }
      return data as TOTPSetupResult;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Verify TOTP code at setup time and activate 2FA.
   */
  const verify = useCallback(async (token: string): Promise<boolean> => {
    if (!/^\d{6}$/.test(token)) {
      setError("Введите 6-значный код");
      return false;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: fnErr } = await callTOTPFunction("totp-verify", { token });
      if (fnErr) {
        setError(fnErr);
        return false;
      }
      setIsEnabled(true);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Validate TOTP code at login (gate check).
   * Returns true on success; on failure sets error and returns false.
   */
  const validate = useCallback(async (token: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: fnErr } = await callTOTPFunction("totp-validate", { token });
      if (fnErr) {
        setError(fnErr);
        return false;
      }
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Disable 2FA — requires the current TOTP code as confirmation.
   */
  const disable = useCallback(async (token: string): Promise<boolean> => {
    if (!/^\d{6}$/.test(token)) {
      setError("Введите 6-значный код");
      return false;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: fnErr } = await callTOTPFunction("totp-disable", { token });
      if (fnErr) {
        setError(fnErr);
        return false;
      }
      setIsEnabled(false);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Consume a backup code (alternative to TOTP at login).
   */
  const useBackupCode = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: fnErr } = await callTOTPFunction("totp-backup", { code });
      if (fnErr) {
        setError(fnErr);
        return false;
      }
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isEnabled,
    isLoading,
    error,
    checkEnabled,
    setup,
    verify,
    validate,
    disable,
    useBackupCode,
  };
}
