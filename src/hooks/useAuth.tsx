import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { startAutoPushTokenRegistration } from "@/lib/push/autoRegister";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signInWithPhone: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  useEffect(() => {
    if (!user) return;
    const stop = startAutoPushTokenRegistration();
    return () => stop();
  }, [user?.id]);

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
    const { error } = await supabase.auth.signInWithOtp({
      phone,
    });
    return { error: error as Error | null };
  };

  const verifyOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    return { error: error as Error | null };
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
