import React from "react";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createQueryClient } from "@/lib/queryClient";
import { createEphemeralSupabaseClient } from "@/lib/multiAccount/supabaseEphemeral";
import {
  clearTokens,
  deriveUsernameFromDisplayName,
  getActiveAccountId,
  getOrCreateDeviceId,
  listAccountsIndex,
  readTokens,
  setActiveAccountId,
  upsertAccountIndex,
  writeTokens,
  type AccountId,
  type AccountIndexEntry,
  type AccountProfileSnapshot,
} from "@/lib/multiAccount/vault";
import { setGuestMode } from "@/lib/demo/demoMode";

type MultiAccountContextValue = {
  loading: boolean;
  accounts: AccountIndexEntry[];
  activeAccountId: AccountId | null;
  switchAccount: (accountId: AccountId) => Promise<void>;
  addAccountWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  startAddAccountPhoneOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyAddAccountPhoneOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  registerPhoneAccount: (input: {
    phoneDigits: string;
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string;
    age: number;
    gender: string;
    entityType: string;
  }) => Promise<{ error: Error | null }>;
};

const MultiAccountContext = React.createContext<MultiAccountContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

function snapshotFromProfileRow(accountId: AccountId, row: any): AccountProfileSnapshot {
  const displayName = (row?.display_name ?? null) as string | null;
  return {
    accountId,
    displayName,
    username: deriveUsernameFromDisplayName(displayName),
    avatarUrl: (row?.avatar_url ?? null) as string | null,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchMyProfileSnapshot(accountId: AccountId): Promise<AccountProfileSnapshot | null> {
  try {
    console.log("🔵 [fetchMyProfileSnapshot] Fetching profile for", accountId);
    const startTime = Date.now();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 5000)
    );
    
    const fetchPromise = supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, updated_at")
      .eq("user_id", accountId)
      .maybeSingle();
    
    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
    
    const duration = Date.now() - startTime;
    
    if (error || !data) {
      console.log(`⏭️ [fetchMyProfileSnapshot] No profile yet (${duration}ms) - will retry later`);
      return null;
    }
    
    console.log(`✅ [fetchMyProfileSnapshot] Loaded (${duration}ms)`);
    return snapshotFromProfileRow(accountId, data);
  } catch (err) {
    console.log(`⏭️ [fetchMyProfileSnapshot] Skipping (${err instanceof Error ? err.message : 'error'})`);
    return null;
  }
}

async function upsertDeviceAccountLink(userId: string) {
  try {
    const deviceId = getOrCreateDeviceId();
    await (supabase as any)
      .from("device_accounts")
      .upsert(
        {
          device_id: deviceId,
          user_id: userId,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "device_id,user_id" },
      );
  } catch {
    // best effort
  }
}

export function MultiAccountProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [accounts, setAccounts] = React.useState<AccountIndexEntry[]>(() => listAccountsIndex());
  const [activeAccountId, setActiveAccountState] = React.useState<AccountId | null>(() => getActiveAccountId());
  const switchMutexRef = React.useRef<Promise<void> | null>(null);

  const [queryClient, setQueryClient] = React.useState<QueryClient>(() => createQueryClient());

  const hardResetQueryClient = React.useCallback(() => {
    setQueryClient(createQueryClient());
  }, []);

  const activateSessionForAccount = React.useCallback(async (accountId: AccountId) => {
    const tokens = readTokens(accountId);
    if (!tokens) {
      throw new Error("missing_tokens");
    }

    const { error } = await withTimeout(
      supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      }),
      4000,
      "setSession",
    );
    if (error) throw error;

    setActiveAccountId(accountId);
    setActiveAccountState(accountId);
    setAccounts(upsertAccountIndex({ accountId, touchActive: true }));

    try {
      (supabase as any).removeAllChannels?.();
    } catch {
      // ignore
    }

    hardResetQueryClient();
  }, [hardResetQueryClient]);

  const switchAccount = React.useCallback(async (accountId: AccountId) => {
    if (!accountId) return;
    if (switchMutexRef.current) {
      await switchMutexRef.current;
    }

    const run = (async () => {
      const prev = activeAccountId;

      // Optimistic selection.
      setActiveAccountState(accountId);
      setActiveAccountId(accountId);

      try {
        await withTimeout(activateSessionForAccount(accountId), 5000, "switchActivate");
      } catch (e) {
        setAccounts(upsertAccountIndex({ accountId, requiresReauth: true }));
        if (prev) {
          setActiveAccountState(prev);
          setActiveAccountId(prev);
        } else {
          setActiveAccountState(null);
          setActiveAccountId(null);
        }
        toast.error("Нужен вход", { description: "Сессия этого аккаунта недоступна или истекла." });
        throw e;
      }
    })();

    switchMutexRef.current = run.finally(() => {
      switchMutexRef.current = null;
    });
    await switchMutexRef.current;
  }, [activeAccountId, activateSessionForAccount]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const localIndex = listAccountsIndex();
        if (!cancelled) setAccounts(localIndex);

        const storedActive = getActiveAccountId();
        const candidate = storedActive ?? localIndex[0]?.accountId ?? null;
        if (!candidate) {
          if (!cancelled) setActiveAccountState(null);
          return;
        }

        try {
          await withTimeout(activateSessionForAccount(candidate), 5000, "initActivate");
        } catch {
          if (!cancelled) {
            setAccounts(upsertAccountIndex({ accountId: candidate, requiresReauth: true }));
            setActiveAccountState(candidate);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activateSessionForAccount]);

  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      const accountId = session?.user?.id ?? null;
      console.log("🔵 [MultiAccountContext] onAuthStateChange:", { event: _evt, hasSession: !!session, accountId });
      
      if (session && accountId) {
        console.log("🔵 [MultiAccountContext] Session active, setting up account...");
        
        void upsertDeviceAccountLink(accountId);
        writeTokens(accountId, {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
        });

        setActiveAccountId(accountId);
        setActiveAccountState(accountId);

        // IMPORTANT: do not await here. GoTrueClient awaits auth subscribers during setSession().
        // Update account index immediately, then load profile asynchronously.
        setAccounts(
          upsertAccountIndex({
            accountId,
            requiresReauth: false,
            profile: undefined,
            touchActive: true,
          }),
        );

        void (async () => {
          console.log("🔵 [MultiAccountContext] Loading profile async...");
          const profile = await fetchMyProfileSnapshot(accountId);
          if (!profile) return;
          setAccounts(
            upsertAccountIndex({
              accountId,
              requiresReauth: false,
              profile,
              touchActive: true,
            }),
          );
          console.log("🟢 [MultiAccountContext] Profile applied to account index");
        })();
      } else if (!session) {
        console.log("🔵 [MultiAccountContext] Session cleared");
        setGuestMode(false);
        const prev = getActiveAccountId();
        if (prev) {
          clearTokens(prev);
          setAccounts(upsertAccountIndex({ accountId: prev, requiresReauth: true }));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const addAccountWithPassword = React.useCallback(async (email: string, password: string) => {
    try {
      const client = createEphemeralSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { error: error as any };
      const session = data.session;
      if (!session || !session.user) return { error: new Error("no_session") };

      const accountId = session.user.id as AccountId;
      writeTokens(accountId, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
      });
      setAccounts(upsertAccountIndex({ accountId, requiresReauth: false, touchActive: true }));

      await activateSessionForAccount(accountId);
      const profile = await fetchMyProfileSnapshot(accountId);
      if (profile) setAccounts(upsertAccountIndex({ accountId, profile }));
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, [activateSessionForAccount]);

  const startAddAccountPhoneOtp = React.useCallback(async (phone: string) => {
    try {
      const client = createEphemeralSupabaseClient();
      const { error } = await client.auth.signInWithOtp({ phone });
      return { error: (error as any) ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  }, []);

  const verifyAddAccountPhoneOtp = React.useCallback(async (phone: string, token: string) => {
    try {
      const client = createEphemeralSupabaseClient();
      const { data, error } = await client.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) return { error: error as any };
      const session = data.session;
      if (!session || !session.user) return { error: new Error("no_session") };

      const accountId = session.user.id as AccountId;
      writeTokens(accountId, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
      });
      setAccounts(upsertAccountIndex({ accountId, requiresReauth: false, touchActive: true }));

      await activateSessionForAccount(accountId);
      const profile = await fetchMyProfileSnapshot(accountId);
      if (profile) setAccounts(upsertAccountIndex({ accountId, profile }));
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, [activateSessionForAccount]);

  const registerPhoneAccount = React.useCallback(async (input: {
    phoneDigits: string;
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string;
    age: number;
    gender: string;
    entityType: string;
  }) => {
    try {
      const digits = input.phoneDigits;
      const authEmail = `user.${digits}@phoneauth.app`;
      const password = `ph_${digits}_secure`;
      const client = createEphemeralSupabaseClient();

      const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email: authEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: `${input.firstName} ${input.lastName}`,
            phone: digits,
          },
        },
      });
      if (signUpError) return { error: signUpError as any };

      let session: Session | null = (signUpData as any).session ?? null;
      if (!session) {
        const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (signInError) return { error: signInError as any };
        session = signInData.session;
      }
      if (!session || !session.user) return { error: new Error("no_session") };

      try {
        await client
          .from("profiles")
          .upsert(
            {
              user_id: session.user.id,
              display_name: `${input.firstName} ${input.lastName}`,
              first_name: input.firstName,
              last_name: input.lastName,
              email: input.email,
              phone: digits,
              birth_date: input.birthDate,
              age: input.age,
              gender: input.gender,
              entity_type: input.entityType,
            } as any,
            { onConflict: "user_id" },
          );
      } catch {
        // best effort
      }

      const accountId = session.user.id as AccountId;
      writeTokens(accountId, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
      });
      setAccounts(upsertAccountIndex({ accountId, requiresReauth: false, touchActive: true }));
      await activateSessionForAccount(accountId);
      const profile = await fetchMyProfileSnapshot(accountId);
      if (profile) setAccounts(upsertAccountIndex({ accountId, profile }));
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, [activateSessionForAccount]);

  const value = React.useMemo<MultiAccountContextValue>(() => ({
    loading,
    accounts,
    activeAccountId,
    switchAccount,
    addAccountWithPassword,
    startAddAccountPhoneOtp,
    verifyAddAccountPhoneOtp,
    registerPhoneAccount,
  }), [accounts, activeAccountId, addAccountWithPassword, loading, registerPhoneAccount, startAddAccountPhoneOtp, switchAccount, verifyAddAccountPhoneOtp]);

  return (
    <MultiAccountContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MultiAccountContext.Provider>
  );
}

export function useMultiAccount() {
  const ctx = React.useContext(MultiAccountContext);
  if (!ctx) throw new Error("useMultiAccount must be used within MultiAccountProvider");
  return ctx;
}
