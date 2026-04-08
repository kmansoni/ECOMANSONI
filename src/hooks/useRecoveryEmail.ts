/**
 * src/hooks/useRecoveryEmail.ts
 * Hook for Recovery Email (2FA backup): send code, verify, get, remove.
 */
import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils";

export interface RecoveryEmailInfo {
  email: string;
  verified: boolean;
}

export type RecoveryEmailActionResult =
  | { ok: true }
  | { ok: false; error: string };

export function useRecoveryEmail() {
  const { user } = useAuth();
  const [recoveryEmail, setRecoveryEmailState] = useState<RecoveryEmailInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((message: string): RecoveryEmailActionResult => {
    setError(message);
    return { ok: false, error: message };
  }, []);

  /** Send verification code to the given email */
  const setRecoveryEmail = useCallback(async (email: string): Promise<RecoveryEmailActionResult> => {
    if (!user?.id) return fail("Необходимо войти в аккаунт.");

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
      return { ok: true };
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error("[useRecoveryEmail] send-code failed", { userId: user.id, error: err });
      return fail(message);
    } finally {
      setIsLoading(false);
    }
  }, [fail, user?.id]);

  /** Get current recovery email status from DB */
  const getRecoveryEmail = useCallback(async (): Promise<RecoveryEmailInfo | null> => {
    if (!user?.id) {
      setRecoveryEmailState(null);
      setCodeSent(false);
      setError(null);
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("recovery_emails")
        .select("email, verified")
        .eq("user_id", user.id)
        .maybeSingle();

      if (dbError) throw dbError;

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
      const message = getErrorMessage(err);
      logger.error("[useRecoveryEmail] getRecoveryEmail failed", { userId: user.id, error: err });
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  /** Verify the 6-digit code received by email */
  const verifyCode = useCallback(async (code: string): Promise<RecoveryEmailActionResult> => {
    if (!user?.id) return fail("Необходимо войти в аккаунт.");

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
      await getRecoveryEmail();
      return { ok: true };
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error("[useRecoveryEmail] verify-code failed", { userId: user.id, error: err });
      return fail(message);
    } finally {
      setIsLoading(false);
    }
  }, [fail, getRecoveryEmail, user?.id]);

  /** Remove recovery email entirely */
  const removeRecoveryEmail = useCallback(async (): Promise<RecoveryEmailActionResult> => {
    if (!user?.id) return fail("Необходимо войти в аккаунт.");

    setIsLoading(true);
    setError(null);
    try {
      const { error: dbError } = await supabase
        .from("recovery_emails")
        .delete()
        .eq("user_id", user.id);
      if (dbError) throw dbError;
      setRecoveryEmailState(null);
      setCodeSent(false);
      return { ok: true };
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error("[useRecoveryEmail] removeRecoveryEmail failed", { userId: user.id, error: err });
      return fail(message);
    } finally {
      setIsLoading(false);
    }
  }, [fail, user?.id]);

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
