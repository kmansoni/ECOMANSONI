/**
 * src/hooks/useRecoveryEmail.ts
 * Hook for Recovery Email (2FA backup): send code, verify, get, remove.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RecoveryEmailInfo {
  email: string;
  verified: boolean;
}

export function useRecoveryEmail() {
  const [recoveryEmail, setRecoveryEmailState] = useState<RecoveryEmailInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Send verification code to the given email */
  const setRecoveryEmail = useCallback(async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("recovery-email", {
        body: { action: "send-code", email },
      });
      if (res.error) throw new Error(res.error.message ?? "Failed to send code");
      const data = res.data as { success?: boolean; error?: string };
      if (data?.error) throw new Error(data.error);
      setCodeSent(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Verify the 6-digit code received by email */
  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("recovery-email", {
        body: { action: "verify", code },
      });
      if (res.error) throw new Error(res.error.message ?? "Verification failed");
      const data = res.data as { success?: boolean; verified?: boolean; error?: string };
      if (data?.error) throw new Error(data.error);
      setCodeSent(false);
      // Refresh local state
      await getRecoveryEmail();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Get current recovery email status from DB */
  const getRecoveryEmail = useCallback(async (): Promise<RecoveryEmailInfo | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("recovery_emails")
        .select("email, verified")
        .single();

      if (dbError && dbError.code !== "PGRST116") {
        // PGRST116 = no rows
        throw dbError;
      }

      if (!data) {
        setRecoveryEmailState(null);
        return null;
      }

      const info: RecoveryEmailInfo = {
        email: (data as { email: string; verified: boolean }).email,
        verified: (data as { email: string; verified: boolean }).verified,
      };
      setRecoveryEmailState(info);
      return info;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Remove recovery email entirely */
  const removeRecoveryEmail = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: dbError } = await supabase.from("recovery_emails").delete().neq("user_id", "");
      // The RLS ensures only own row is deleted; .neq filter is a non-restrictive pass-through
      // since we need at least one filter for PostgREST
      if (dbError) throw dbError;
      setRecoveryEmailState(null);
      setCodeSent(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    recoveryEmail,
    isLoading,
    codeSent,
    error,
    setRecoveryEmail,
    verifyCode,
    getRecoveryEmail,
    removeRecoveryEmail,
  };
}
