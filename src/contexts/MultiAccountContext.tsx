import React from "react";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createQueryClient } from "@/lib/queryClient";
import { createEphemeralSupabaseClient } from "@/lib/multiAccount/supabaseEphemeral";
import { useAccountContainerContext } from "@/contexts/AccountContainerContext";
import { loadOrCreateDeviceIdentity } from "@/auth/deviceIdentity";
import {
  getActiveAccountId,
  getOrCreateDeviceId,
  listAccountsIndex,
  pruneAccountsIndex,
  setActiveAccountId,
  upsertAccountIndex,
  type AccountId,
  type AccountIndexEntry,
  type AccountProfileSnapshot,
} from "@/lib/multiAccount/vault";
import { setGuestMode } from "@/lib/demo/demoMode";

type MultiAccountContextValue = {
  loading: boolean;
  accounts: AccountIndexEntry[];
  activeAccountId: AccountId | null;
  switchingAccountId: AccountId | null;
  isSwitchingAccount: boolean;
  accountOperation: "switch" | "external-switch" | "add-password" | "otp-start" | "otp-verify" | "register-email" | null;
  isAccountOperationInProgress: boolean;
  switchAccount: (accountId: AccountId) => Promise<void>;
  addAccountWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  startAddAccountEmailOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyAddAccountEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
};

const MultiAccountContext = React.createContext<MultiAccountContextValue | null>(null);
const AUTH_SERVICE_BASE_URL = (import.meta.env.VITE_AUTH_SERVICE_BASE_URL as string | undefined)?.trim() || "";

type ActivatedSessionPayload = {
  account_id: string;
  session_id: string;
  access_token: string;
  refresh_token: string;
  refresh_expires_at: string;
};

async function activateSessionBySessionId(sessionId: string): Promise<ActivatedSessionPayload> {
  if (!AUTH_SERVICE_BASE_URL) {
    throw new Error("AUTH_SERVICE_NOT_CONFIGURED");
  }

  const device = loadOrCreateDeviceIdentity();
  const response = await fetch(`${AUTH_SERVICE_BASE_URL.replace(/\/$/, "")}/v1/device/activate-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      device_uid: device.device_uid,
      device_secret: device.device_secret,
    }),
  });

  if (!response.ok) {
    let reason = "ACTIVATE_FAILED";
    try {
      const body = (await response.json()) as { error?: string };
      reason = body.error || reason;
    } catch {
      // ignore parse failure
    }
    throw new Error(reason);
  }

  return (await response.json()) as ActivatedSessionPayload;
}

// IRON RULE 4.1: Debug logging gated by FLAG_DEBUG
const FLAG_DEBUG = import.meta.env.VITE_DEBUG_MULTI_ACCOUNT === 'true';
const logDebug = (label: string, ...args: any[]) => {
  if (FLAG_DEBUG) {
    console.log(`[MultiAccount] ${label}`, ...args);
  }
};

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
  const username = (row?.username ?? null) as string | null;
  const avatarUrl = (row?.avatar_url ?? null) as string | null;

  // IRON RULE 1.2: No fallback for identification fields
  // Throw early if profile is incomplete — don't silently degrade to "user"
  if (!username) {
    throw new Error(`INCOMPLETE_PROFILE: username is missing for ${accountId}`);
  }

  return {
    accountId,
    displayName,
    username, // Now guaranteed to be non-null
    avatarUrl,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchMyProfileSnapshot(
  accountId: AccountId,
  signal?: AbortSignal,
  retryAttempt = 0
): Promise<AccountProfileSnapshot | null> {
  try {
    // GUARD: if abort requested, fail fast
    if (signal?.aborted) {
      throw new Error('aborted');
    }

    const label = retryAttempt === 0 ? "fetchMyProfileSnapshot" : `fetchMyProfileSnapshot[retry-${retryAttempt}]`;
    if (retryAttempt === 0) {
      logDebug(`${label}: fetching profile for ${accountId}`);
    }
    const startTime = Date.now();
    
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 5000);
      signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
    });
    
    const fetchPromise = supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, username, updated_at")
      .eq("user_id", accountId)
      .maybeSingle();
    
    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
    
    const duration = Date.now() - startTime;
    
    if (error || !data) {
      // Network/DB error or no profile yet → retry with backoff
      if (retryAttempt < 3) {
        const backoffMs = retryAttempt === 0 ? 1000 : (retryAttempt === 1 ? 2000 : 4000);
        logDebug(`${label}: no profile, retry in ${backoffMs}ms (${retryAttempt + 1}/3)`);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, backoffMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          }, { once: true });
        });
        return fetchMyProfileSnapshot(accountId, signal, retryAttempt + 1);
      }
      
      logDebug(`${label}: no profile after 3 retries (${duration}ms)`);
      return null;
    }
    
    // IRON RULE 1.2: snapshotFromProfileRow will throw if username/avatar missing
    const profile = snapshotFromProfileRow(accountId, data);
    logDebug(`${label}: loaded (${duration}ms) username=${profile.username}`);
    return profile;
  } catch (err) {
    // Abort is not an error condition — just stop and return null
    if (err instanceof Error && err.message === 'aborted') {
      logDebug(`fetchMyProfileSnapshot: aborted`);
      return null;
    }

    const isIncompleteProfile = err instanceof Error && err.message.startsWith('INCOMPLETE_PROFILE');
    const isTimeout = err instanceof Error && err.message === 'timeout';
    
    if (isTimeout && retryAttempt < 3) {
      // Timeout → retry
      const backoffMs = retryAttempt === 0 ? 1000 : (retryAttempt === 1 ? 2000 : 4000);
      logDebug(`fetchMyProfileSnapshot: timeout, retry in ${backoffMs}ms (${retryAttempt + 1}/3)`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, backoffMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return fetchMyProfileSnapshot(accountId, signal, retryAttempt + 1);
    }
    
    if (isIncompleteProfile && retryAttempt < 2) {
      // Incomplete profile (e.g., username not set yet) → retry a few times
      const backoffMs = 2000;
      logDebug(`fetchMyProfileSnapshot: incomplete profile, retry in ${backoffMs}ms (${retryAttempt + 1}/2)`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, backoffMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return fetchMyProfileSnapshot(accountId, signal, retryAttempt + 1);
    }
    
    logDebug(`fetchMyProfileSnapshot: error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchMyProfileSnapshotWithTokens(
  accountId: AccountId,
  refreshToken: string,
  signal?: AbortSignal,
): Promise<{ profile: AccountProfileSnapshot | null; requiresReauth: boolean }> {
  try {
    if (signal?.aborted) return { profile: null, requiresReauth: false };

    const client = createEphemeralSupabaseClient();
    const { data: refreshed, error: sessionError } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (sessionError) {
      logDebug(`fetchMyProfileSnapshotWithTokens: refreshSession failed for ${accountId}: ${sessionError.message}`);
      return { profile: null, requiresReauth: true };
    }
    if (!refreshed?.session) return { profile: null, requiresReauth: true };

    if (signal?.aborted) return { profile: null, requiresReauth: false };

    const { data, error } = await (client as any)
      .from("profiles")
      .select("user_id, display_name, avatar_url, username, updated_at")
      .eq("user_id", accountId)
      .maybeSingle();

    if (signal?.aborted) return { profile: null, requiresReauth: false };
    if (error || !data) {
      logDebug(`fetchMyProfileSnapshotWithTokens: no profile for ${accountId}: ${error?.message ?? 'no_data'}`);
      return { profile: null, requiresReauth: false };
    }

    return { profile: snapshotFromProfileRow(accountId, data), requiresReauth: false };
  } catch (err) {
    if (signal?.aborted) return { profile: null, requiresReauth: false };
    logDebug(`fetchMyProfileSnapshotWithTokens: error for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    return { profile: null, requiresReauth: false };
  }
}

async function upsertDeviceAccountLink(userId: string) {
  try {
    const deviceId = getOrCreateDeviceId();
    // Prefer RPC (SECURITY DEFINER) to avoid RLS edge-cases and centralize logic.
    await (supabase as any).rpc("upsert_device_account", {
      p_device_id: deviceId,
      p_label: null,
    });
  } catch {
    // best effort
  }
}

async function fetchDeviceAccountsFromDb(deviceId: string): Promise<Array<{
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  last_active_at: string | null;
}> | null> {
  try {
    const { data, error } = await (supabase as any).rpc("list_device_accounts_for_device", {
      p_device_id: deviceId,
    });
    if (error) {
      logDebug(`fetchDeviceAccountsFromDb: rpc error: ${error.message}`);
      return null;
    }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    logDebug(`fetchDeviceAccountsFromDb: error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function MultiAccountProvider({ children }: { children: React.ReactNode }) {
  const accountContainer = useAccountContainerContext();
  const [loading, setLoading] = React.useState(true);
  const [accounts, setAccounts] = React.useState<AccountIndexEntry[]>(() => listAccountsIndex());
  const [activeAccountId, setActiveAccountState] = React.useState<AccountId | null>(() => getActiveAccountId());
  const [switchingAccountId, setSwitchingAccountId] = React.useState<AccountId | null>(null);
  const [accountOperation, setAccountOperation] = React.useState<MultiAccountContextValue["accountOperation"]>(null);
  const accountOpMutexRef = React.useRef<Promise<void> | null>(null);

  // Multi-tab sync (Telegram-like): keep active account consistent across tabs.
  const instanceIdRef = React.useRef<string>(
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `inst_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
  );
  const activeAccountIdRef = React.useRef<AccountId | null>(activeAccountId);
  const externalSwitchRef = React.useRef<((id: AccountId) => Promise<void>) | null>(null);
  const internalSessionTransitionRef = React.useRef(0);
  const lastAuthenticatedAccountRef = React.useRef<AccountId | null>(null);
  // Runtime-only per-account refresh tokens (never persisted)
  const runtimeRefreshTokensRef = React.useRef<Record<AccountId, string>>({});

  React.useEffect(() => {
    activeAccountIdRef.current = activeAccountId;
  }, [activeAccountId]);

  // RACE CONDITION FIX: per-account AbortController + per-account seq guard
  const profileLoadRef = React.useRef<Record<AccountId, { seq: number; controller: AbortController }>>({});

  const beginProfileLoad = React.useCallback((accountId: AccountId) => {
    const prev = profileLoadRef.current[accountId];
    if (prev?.controller) {
      prev.controller.abort();
    }
    const seq = (prev?.seq ?? 0) + 1;
    const controller = new AbortController();
    profileLoadRef.current[accountId] = { seq, controller };
    return { seq, signal: controller.signal };
  }, []);

  const isCurrentProfileLoad = React.useCallback((accountId: AccountId, seq: number) => {
    return profileLoadRef.current[accountId]?.seq === seq;
  }, []);

  const [queryClient, setQueryClient] = React.useState<QueryClient>(() => createQueryClient());

  const hardResetQueryClient = React.useCallback(() => {
    setQueryClient(createQueryClient());
  }, []);

  const runExclusiveAccountOp = React.useCallback(async <T,>(
    operation: NonNullable<MultiAccountContextValue["accountOperation"]>,
    runner: () => Promise<T>,
  ): Promise<T> => {
    if (accountOpMutexRef.current) {
      await accountOpMutexRef.current;
    }

    const run = (async () => {
      setAccountOperation(operation);
      try {
        return await runner();
      } finally {
        setAccountOperation((prev) => (prev === operation ? null : prev));
      }
    })();

    accountOpMutexRef.current = run.then(() => undefined, () => undefined).finally(() => {
      accountOpMutexRef.current = null;
    });

    return run;
  }, []);

  const activateSessionForAccount = React.useCallback(async (accountId: AccountId) => {
    let refreshToken = runtimeRefreshTokensRef.current[accountId];

    // If we don't have runtime token (for example after page reload),
    // try to activate by server-side session_id using auth service.
    if (!refreshToken) {
      const sessionId = accountContainer.getAccount(accountId)?.session_id;
      if (sessionId) {
        const activated = await withTimeout(
          activateSessionBySessionId(sessionId),
          5000,
          "activateBySessionId",
        );
        const { error: setSessionError } = await withTimeout(
          supabase.auth.setSession({
            access_token: activated.access_token,
            refresh_token: activated.refresh_token,
          }),
          4000,
          "setSessionFromActivation",
        );
        if (setSessionError) throw setSessionError;
        refreshToken = activated.refresh_token;
      }
    }

    if (!refreshToken) {
      throw new Error("missing_tokens");
    }

    internalSessionTransitionRef.current += 1;
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession({
        refresh_token: refreshToken,
      }),
      4000,
      "refreshSession",
    ).finally(() => {
      internalSessionTransitionRef.current = Math.max(0, internalSessionTransitionRef.current - 1);
    });
    if (error) throw error;
    if (!data?.session) throw new Error("missing_session");

    runtimeRefreshTokensRef.current[accountId] = data.session.refresh_token;

    setActiveAccountId(accountId);
    setActiveAccountState(accountId);
    setAccounts(upsertAccountIndex({ accountId, touchActive: true }));

    // Broadcast active-account change to other tabs (best effort).
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("multi-account:v1");
        bc.postMessage({
          type: "active_changed",
          accountId,
          source: instanceIdRef.current,
          ts: Date.now(),
        });
        bc.close();
      }
    } catch {
      // ignore
    }

    try {
      (supabase as any).removeAllChannels?.();
    } catch {
      // ignore
    }

    hardResetQueryClient();
  }, [accountContainer, hardResetQueryClient]);

  const switchAccount = React.useCallback(async (accountId: AccountId) => {
    if (!accountId) return;
    if (activeAccountId === accountId) return;

    await runExclusiveAccountOp("switch", async () => {
      setSwitchingAccountId(accountId);

      try {
        await withTimeout(activateSessionForAccount(accountId), 5000, "switchActivate");
      } catch (e) {
        setAccounts(upsertAccountIndex({ accountId, requiresReauth: true }));
        toast.error("Нужен вход", { description: "Сессия этого аккаунта недоступна или истекла." });
        throw e;
      } finally {
        setSwitchingAccountId((prev) => (prev === accountId ? null : prev));
      }
    });
  }, [activeAccountId, activateSessionForAccount, runExclusiveAccountOp]);

  // External (multi-tab) switch: never commit active selection unless auth session
  // is actually activated in this tab. This prevents UI/session desync.
  const switchAccountFromExternalSignal = React.useCallback(async (accountId: AccountId) => {
    if (!accountId) return;
    if (activeAccountIdRef.current === accountId) return;

    await runExclusiveAccountOp("external-switch", async () => {
      setSwitchingAccountId(accountId);
      try {
        // activateSessionForAccount is the single authority that commits activeAccountId.
        await withTimeout(activateSessionForAccount(accountId), 5000, "externalSwitchActivate");
      } catch {
        // Keep current active account unchanged in this tab, mark target as requiring reauth.
        setAccounts(upsertAccountIndex({ accountId, requiresReauth: true }));
      } finally {
        setSwitchingAccountId((prev) => (prev === accountId ? null : prev));
      }
    });
  }, [activateSessionForAccount, runExclusiveAccountOp]);

  React.useEffect(() => {
    externalSwitchRef.current = switchAccountFromExternalSignal;
  }, [switchAccountFromExternalSignal]);

  React.useEffect(() => {
    let cancelled = false;

    const handleActiveChanged = async (nextAccountId: AccountId) => {
      if (cancelled) return;
      if (!nextAccountId) return;
      if (activeAccountIdRef.current === nextAccountId) return;

      // Switch locally using the external-safe path.
      await externalSwitchRef.current?.(nextAccountId);
    };

    // BroadcastChannel path.
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("multi-account:v1");
        bc.onmessage = (ev) => {
          const msg = ev?.data as any;
          if (!msg || typeof msg !== "object") return;
          if (msg.source && msg.source === instanceIdRef.current) return;

          if (msg.type === "active_changed" && typeof msg.accountId === "string") {
            void handleActiveChanged(msg.accountId as AccountId);
          }

          if (msg.type === "signed_out" && typeof msg.accountId === "string") {
            const signedOutId = msg.accountId as AccountId;
            setAccounts(upsertAccountIndex({ accountId: signedOutId, requiresReauth: true }));
            if (activeAccountIdRef.current === signedOutId) {
              setActiveAccountId(null);
              setActiveAccountState(null);
            }
          }
        };
      }
    } catch {
      bc = null;
    }

    // Storage-event fallback (fires across tabs).
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (!e.key.endsWith(":activeAccountId")) return;
      const next = (e.newValue && e.newValue.trim()) ? (e.newValue as AccountId) : null;
      if (!next) return;
      void handleActiveChanged(next);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      try {
        bc?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  React.useEffect(() => {
    // Best-effort background refresh for cached accounts: load missing profile snapshots
    // using per-account tokens without switching the global Supabase session.
    let cancelled = false;
    const localIndex = pruneAccountsIndex();

    void (async () => {
      for (const entry of localIndex) {
        if (cancelled) return;
        if (entry.profile) continue;

        const refreshToken = runtimeRefreshTokensRef.current[entry.accountId];
        if (!refreshToken) continue;
        if (entry.requiresReauth) continue;

        const { seq, signal } = beginProfileLoad(entry.accountId);
        const result = await fetchMyProfileSnapshotWithTokens(entry.accountId, refreshToken, signal);
        if (cancelled) return;
        if (result?.requiresReauth) {
          setAccounts(upsertAccountIndex({
            accountId: entry.accountId,
            requiresReauth: true,
          }));
          continue;
        }

        const profile = result?.profile ?? null;
        if (!profile) continue;
        if (!isCurrentProfileLoad(entry.accountId, seq)) continue;

        setAccounts(upsertAccountIndex({
          accountId: entry.accountId,
          requiresReauth: false,
          profile,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [beginProfileLoad, isCurrentProfileLoad]);

  React.useEffect(() => {
    // DB-backed source of truth for "accounts on this device".
    // Vault remains a cache for tokens and offline identity.
    let cancelled = false;
    const deviceId = getOrCreateDeviceId();

    void (async () => {
      const rows = await fetchDeviceAccountsFromDb(deviceId);
      if (cancelled) return;
      if (!rows) return;

      for (const row of rows) {
        const accountId = row.user_id as AccountId;

        // If we have profile fields from DB, store them as snapshot (preferred).
        if (row.username) {
          const profile: AccountProfileSnapshot = {
            accountId,
            displayName: row.display_name ?? null,
            username: row.username,
            avatarUrl: row.avatar_url ?? null,
            updatedAt: new Date().toISOString(),
          };

          setAccounts(upsertAccountIndex({
            accountId,
            profile,
            requiresReauth: false,
          }));
        } else {
          // No username means DB contract not applied yet or data is incomplete.
          // Keep the account but mark requiresReauth to avoid false "healthy" state.
          setAccounts(upsertAccountIndex({
            accountId,
            requiresReauth: true,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const localIndex = pruneAccountsIndex();
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
      logDebug(`onAuthStateChange: event=${_evt}, hasSession=${!!session}, accountId=${accountId}`);
      
      if (session && accountId) {
        lastAuthenticatedAccountRef.current = accountId;
        logDebug(`onAuthStateChange: session active, setting up account...`);
        
        void upsertDeviceAccountLink(accountId);
        runtimeRefreshTokensRef.current[accountId] = session.refresh_token;

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

        // Best-effort: refresh device-backed list after linking.
        void (async () => {
          const deviceId = getOrCreateDeviceId();
          const rows = await fetchDeviceAccountsFromDb(deviceId);
          if (!rows) return;
          for (const row of rows) {
            const id = row.user_id as AccountId;
            if (!row.username) continue;
            const profile: AccountProfileSnapshot = {
              accountId: id,
              displayName: row.display_name ?? null,
              username: row.username,
              avatarUrl: row.avatar_url ?? null,
              updatedAt: new Date().toISOString(),
            };
            setAccounts(upsertAccountIndex({ accountId: id, profile }));
          }
        })();

        void (async () => {
          logDebug(`onAuthStateChange: loading profile async...`);

          const { seq, signal } = beginProfileLoad(accountId);
          const profile = await fetchMyProfileSnapshot(accountId, signal);
          if (!profile) return;

          // GUARD: only commit if this is still the latest load for this account
          if (!isCurrentProfileLoad(accountId, seq)) {
            logDebug(`onAuthStateChange: ignoring stale profile response (account=${accountId}, seq=${seq})`);
            return;
          }

          setAccounts(
            upsertAccountIndex({
              accountId,
              requiresReauth: false,
              profile,
              touchActive: true,
            }),
          );
          logDebug(`onAuthStateChange: profile applied to account index`);
        })();
      } else if (!session) {
        // IMPORTANT:
        // Supabase can emit INITIAL_SESSION with a null session (eg. before it restores from storage,
        // or in some webviews). Treating that as a real sign-out would incorrectly clear vault tokens
        // and force the user back to /auth.
        const isRealSignOut = _evt === "SIGNED_OUT";
        if (!isRealSignOut) {
          logDebug(`onAuthStateChange: ignoring null session for event=${_evt}`);
          return;
        }

        // During internal setSession transitions, GoTrue can briefly emit SIGNED_OUT.
        // Treat those events as transient and never clear stored multi-account tokens.
        if (internalSessionTransitionRef.current > 0) {
          logDebug(`onAuthStateChange: ignoring transient SIGNED_OUT during internal session transition`);
          return;
        }

        logDebug(`onAuthStateChange: session cleared`);
        setGuestMode(false);
        const prev = lastAuthenticatedAccountRef.current ?? getActiveAccountId();
        lastAuthenticatedAccountRef.current = null;
        if (prev) {
          delete runtimeRefreshTokensRef.current[prev];
          setAccounts(upsertAccountIndex({ accountId: prev, requiresReauth: true }));

          // Broadcast sign-out so other tabs can mark this account as requiring reauth.
          try {
            if (typeof BroadcastChannel !== "undefined") {
              const bc = new BroadcastChannel("multi-account:v1");
              bc.postMessage({
                type: "signed_out",
                accountId: prev,
                source: instanceIdRef.current,
                ts: Date.now(),
              });
              bc.close();
            }
          } catch {
            // ignore
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [beginProfileLoad, isCurrentProfileLoad]);

  const addAccountWithPassword = React.useCallback(async (email: string, password: string) => {
    return runExclusiveAccountOp("add-password", async () => {
      try {
        const client = createEphemeralSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) return { error: error as any };
        const session = data.session;
        if (!session || !session.user) return { error: new Error("no_session") };

        const accountId = session.user.id as AccountId;
        runtimeRefreshTokensRef.current[accountId] = session.refresh_token;
        setAccounts(upsertAccountIndex({ accountId, requiresReauth: false, touchActive: true }));

        await activateSessionForAccount(accountId);
        const { seq, signal } = beginProfileLoad(accountId);
        const profile = await fetchMyProfileSnapshot(accountId, signal);
        if (profile && isCurrentProfileLoad(accountId, seq)) {
          setAccounts(upsertAccountIndex({ accountId, profile }));
        }
        return { error: null };
      } catch (e) {
        return { error: e as Error };
      }
    });
  }, [activateSessionForAccount, beginProfileLoad, isCurrentProfileLoad, runExclusiveAccountOp]);

  const startAddAccountEmailOtp = React.useCallback(async (email: string) => {
    return runExclusiveAccountOp("otp-start", async () => {
      try {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return { error: new Error("Email is required") };

        const client = createEphemeralSupabaseClient();
        const { error } = await client.auth.signInWithOtp({
          email: trimmed,
          options: { shouldCreateUser: true },
        });
        return { error: (error as any) ?? null };
      } catch (e) {
        return { error: e as Error };
      }
    });
  }, [runExclusiveAccountOp]);

  const verifyAddAccountEmailOtp = React.useCallback(async (email: string, token: string) => {
    return runExclusiveAccountOp("otp-verify", async () => {
      try {
        const trimmed = email.trim().toLowerCase();

        const client = createEphemeralSupabaseClient();
        const { data, error } = await client.auth.verifyOtp({
          email: trimmed,
          token,
          type: "email",
        });
        if (error) return { error: error as any };

        const session = data.session;
        if (!session || !session.user) return { error: new Error("no_session") };

        const accountId = session.user.id as AccountId;
        runtimeRefreshTokensRef.current[accountId] = session.refresh_token;
        setAccounts(upsertAccountIndex({ accountId, requiresReauth: false, touchActive: true }));

        await activateSessionForAccount(accountId);
        const { seq, signal } = beginProfileLoad(accountId);
        const profile = await fetchMyProfileSnapshot(accountId, signal);
        if (profile && isCurrentProfileLoad(accountId, seq)) {
          setAccounts(upsertAccountIndex({ accountId, profile }));
        }
        return { error: null };
      } catch (e) {
        return { error: e as Error };
      }
    });
  }, [activateSessionForAccount, beginProfileLoad, isCurrentProfileLoad, runExclusiveAccountOp]);

  const value = React.useMemo<MultiAccountContextValue>(() => ({
    loading,
    accounts,
    activeAccountId,
    switchingAccountId,
    isSwitchingAccount: switchingAccountId !== null,
    accountOperation,
    isAccountOperationInProgress: accountOperation !== null,
    switchAccount,
    addAccountWithPassword,
    startAddAccountEmailOtp,
    verifyAddAccountEmailOtp,
  }), [accountOperation, accounts, activeAccountId, addAccountWithPassword, loading, startAddAccountEmailOtp, switchAccount, switchingAccountId, verifyAddAccountEmailOtp]);

  return (
    <MultiAccountContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MultiAccountContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMultiAccount() {
  const ctx = React.useContext(MultiAccountContext);
  if (!ctx) throw new Error("useMultiAccount must be used within MultiAccountProvider");
  return ctx;
}
