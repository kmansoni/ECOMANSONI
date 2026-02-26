import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { startAutoPushTokenRegistration } from "@/lib/push/autoRegister";
import { getPhoneAuthFunctionUrls, getPhoneAuthHeaders } from "@/lib/auth/backendEndpoints";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signInWithPhone: (phone: string) => Promise<{ error: any | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: any | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USE_SUPABASE_PHONE_OTP = import.meta.env.VITE_USE_SUPABASE_PHONE_OTP === "true";

function isPhoneProviderDisabled(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "phone_provider_disabled" || message.includes("unsupported phone provider");
}

async function signInWithPhoneAuthFallback(phone: string): Promise<{ error: any | null }> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return { error: new Error("Invalid phone number") };
  }

  const functionUrls = getPhoneAuthFunctionUrls();
  if (functionUrls.length === 0) {
    return { error: new Error("Phone auth endpoint is not configured") };
  }

  const body = {
    action: "register-or-login",
    phone: `+${digits}`,
    display_name: "User",
    email: `user${digits}@placeholder.local`,
  };

  let lastError: any = null;
  for (const functionUrl of functionUrls) {
    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: getPhoneAuthHeaders(),
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.ok) {
        lastError = {
          message: data?.error || `HTTP ${response.status}`,
          status: response.status,
          code: data?.code || "phone_auth_failed",
        };
        continue;
      }

      if (!data.accessToken || !data.refreshToken) {
        lastError = new Error("phone-auth did not return session tokens");
        continue;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      return { error: (sessionError as any) ?? null };
    } catch (err) {
      lastError = err as any;
    }
  }

  return { error: lastError ?? new Error("Phone auth failed") };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const lastAuthMetaSyncRef = useRef<{ userId: string; key: string } | null>(null);

  // Ensure profile exists for the user
  const ensureProfile = async (authUser: User) => {
    const metaFullName = typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name.trim() : "";
    const metaAvatarUrl = typeof authUser.user_metadata?.avatar_url === "string" ? authUser.user_metadata.avatar_url.trim() : "";
    const fallbackDisplayName = metaFullName || authUser.email?.split('@')[0] || 'User';
    try {
      // Profiles are also auto-created by DB trigger; this is a safety net for older users.
      // Important: do NOT overwrite existing profile fields here (we only insert if missing).
      await supabase
        .from("profiles")
        .upsert(
          {
            user_id: authUser.id,
            display_name: fallbackDisplayName,
          },
          {
            onConflict: "user_id",
            ignoreDuplicates: true,
          },
        );

      // Keep Supabase Auth user_metadata in sync with the canonical profile name/avatar.
      // This makes Dashboard -> Authentication -> Users reflect current profile updates.
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (profileError) {
        console.warn("[AuthProvider] ensureProfile profile fetch failed:", profileError);
        return;
      }

      const profileDisplayName = typeof profileRow?.display_name === "string" ? profileRow.display_name.trim() : "";
      const profileAvatarUrl = typeof profileRow?.avatar_url === "string" ? profileRow.avatar_url.trim() : "";

      const nextFullName = profileDisplayName || fallbackDisplayName;
      const nextAvatarUrl = profileAvatarUrl || metaAvatarUrl;

      const shouldUpdateMeta =
        (nextFullName && nextFullName !== metaFullName) ||
        (nextAvatarUrl && nextAvatarUrl !== metaAvatarUrl);

      if (!shouldUpdateMeta) return;

      // De-dupe to avoid auth update loops when onAuthStateChange fires USER_UPDATED.
      const dedupeKey = `${nextFullName}::${nextAvatarUrl}`;
      if (lastAuthMetaSyncRef.current?.userId === authUser.id && lastAuthMetaSyncRef.current.key === dedupeKey) return;
      lastAuthMetaSyncRef.current = { userId: authUser.id, key: dedupeKey };

      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: {
          full_name: nextFullName,
          ...(nextAvatarUrl ? { avatar_url: nextAvatarUrl } : {}),
        },
      });

      if (updateAuthError) {
        console.warn("[AuthProvider] auth.updateUser metadata sync failed:", updateAuthError);
      }
    } catch (e) {
      console.error("Error ensuring profile:", e);
    }
  };

  useEffect(() => {
    let cancelled = false;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // IMPORTANT: do not await here.
      // GoTrueClient awaits auth subscribers during setSession(), so awaiting network
      // work here can block sign-in flows and leave the UI "stuck".
      if (session?.user) {
        void ensureProfile(session.user);
      }
    });

    // THEN check for existing session
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) void ensureProfile(session.user);
      } catch (e) {
        console.error("[AuthProvider] getSession failed:", e);
        if (cancelled) return;
        setSession(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const safetyTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 20000);

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const stop = startAutoPushTokenRegistration();
    return () => stop();
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: displayName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signInWithPhone = async (phone: string) => {
    if (!USE_SUPABASE_PHONE_OTP) {
      return await signInWithPhoneAuthFallback(phone);
    }

    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      console.error("[Auth] signInWithOtp(phone) failed", {
        message: (error as any)?.message,
        code: (error as any)?.code,
        status: (error as any)?.status,
        name: (error as any)?.name,
      });
      if (isPhoneProviderDisabled(error)) {
        console.warn("[Auth] Falling back to phone-auth flow because phone provider is disabled");
        return await signInWithPhoneAuthFallback(phone);
      }
    }
    return { error: (error as any) ?? null };
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (!USE_SUPABASE_PHONE_OTP) {
      return await signInWithPhoneAuthFallback(phone);
    }

    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) {
      console.error("[Auth] verifyOtp(phone,sms) failed", {
        message: (error as any)?.message,
        code: (error as any)?.code,
        status: (error as any)?.status,
        name: (error as any)?.name,
      });
      if (isPhoneProviderDisabled(error)) {
        console.warn("[Auth] Falling back to phone-auth flow in verifyOtp because phone provider is disabled");
        return await signInWithPhoneAuthFallback(phone);
      }
    }
    return { error: (error as any) ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithPhone, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
