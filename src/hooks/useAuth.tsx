import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { startAutoPushTokenRegistration } from "@/lib/push/autoRegister";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authOperation: "sign-in" | "sign-up" | "email-otp" | "verify-otp" | "sign-out" | null;
  isAuthOperationInProgress: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  sendEmailOtp: (email: string) => Promise<{ error: any | null }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: any | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOperation, setAuthOperation] = useState<AuthContextType["authOperation"]>(null);
  const authOpMutexRef = useRef<Promise<void> | null>(null);

  const lastAuthMetaSyncRef = useRef<{ userId: string; key: string } | null>(null);

  const runExclusiveAuthOp = async <T,>(
    operation: NonNullable<AuthContextType["authOperation"]>,
    runner: () => Promise<T>,
  ): Promise<T> => {
    if (authOpMutexRef.current) {
      await authOpMutexRef.current;
    }

    const run = (async () => {
      setAuthOperation(operation);
      try {
        return await runner();
      } finally {
        setAuthOperation((prev) => (prev === operation ? null : prev));
      }
    })();

    authOpMutexRef.current = run.then(() => undefined, () => undefined).finally(() => {
      authOpMutexRef.current = null;
    });

    return run;
  };

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
    return runExclusiveAuthOp("sign-in", async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error as Error | null };
    });
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    return runExclusiveAuthOp("sign-up", async () => {
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
    });
  };

  const sendEmailOtp = async (email: string) => {
    return runExclusiveAuthOp("email-otp", async () => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        return { error: new Error("Email is required") };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      return { error: (error as any) ?? null };
    });
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    return runExclusiveAuthOp("verify-otp", async () => {
      const trimmed = email.trim().toLowerCase();

      const { error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token,
        type: "email",
      });
      return { error: (error as any) ?? null };
    });
  };

  const signOut = async () => {
    return runExclusiveAuthOp("sign-out", async () => {
      // Очищаем ВСЕ SW-кэши перед выходом, чтобы персональные данные
      // (сообщения, профили) не оставались в Cache Storage.
      // Gracefully degraded: если SW недоступен — ничего страшного.
      try {
        const { mediaCache } = await import("@/lib/mediaCache");
        await mediaCache.clearAll();
      } catch {
        // ignore — кэш недоступен или SW не зарегистрирован
      }

      // E2EE hygiene on logout: remove local key material for this principal.
      // Best-effort only: auth sign-out must still proceed even if cleanup fails.
      try {
        const currentUserId = user?.id;
        const { E2EEKeyStore } = await import("@/lib/e2ee/keyStore");

        const stores = [
          new E2EEKeyStore({ dbName: "e2ee-keystore-v2" }),
          new E2EEKeyStore({ dbName: "e2ee-keystore" }),
        ];

        for (const store of stores) {
          try {
            await store.init();
            await store.clearAll();
          } catch {
            // ignore per-store failure
          } finally {
            store.close();
          }
        }

        if (currentUserId && typeof localStorage !== "undefined") {
          const prefixes = [`ik_bundle_${currentUserId}`, `dr_state_${currentUserId}_`];
          const toDelete: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (prefixes.some((p) => k.startsWith(p))) {
              toDelete.push(k);
            }
          }
          for (const k of toDelete) localStorage.removeItem(k);
        }
      } catch {
        // ignore — cleanup failure must not block sign-out
      }

      await supabase.auth.signOut();
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      authOperation,
      isAuthOperationInProgress: authOperation !== null,
      signIn,
      signUp,
      sendEmailOtp,
      verifyEmailOtp,
      signOut,
    }}>
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
