/**
 * useAccountContainer.ts — Device-level account container (Telegram-style)
 *
 * Manages multiple accounts on device. Stores ONLY:
 * - user_id
 * - session_id (reference to server sessions)
 * - profile metadata
 *
 * Does NOT store tokens (those are in httpOnly cookies from Supabase).
 * Does NOT participate in auth logic (only switching context).
 *
 * Architecture:
 * Device
 *  ├─ Account A
 *  │   ├─ user_id
 *  │   ├─ session_id → session registry
 *  │   └─ profile
 *  │
 *  ├─ Account B
 *  └─ activeAccountId
 */

import { useState, useCallback, useEffect } from 'react';

export type StoredAccount = {
  user_id: string;
  session_id: string;
  profile: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
  };
  added_at: string;
  last_active_at: string;
};

interface AccountContainerState {
  accounts: StoredAccount[];
  activeAccountId: string | null;
  device_id: string;
}

const STORAGE_KEY = 'mansoni_accounts_v2';
const ACTIVE_ACCOUNT_KEY = 'mansoni_active_account_v2';
const DEVICE_ID_KEY = 'mansoni_device_id_v2';

/**
 * Generates or retrieves device identifier
 */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (id && id.trim()) return id;

  id = crypto.randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignore quota exceeded
  }
  return id;
}

/**
 * Loads account list from localStorage
 */
function loadAccountsFromStorage(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (account) =>
        account &&
        typeof (account as any).user_id === 'string' &&
        typeof (account as any).session_id === 'string',
    ) as StoredAccount[];
  } catch {
    return [];
  }
}

/**
 * Saves account list to localStorage
 */
function saveAccountsToStorage(accounts: StoredAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore quota exceeded
  }
}

/**
 * Device Account Container Hook
 *
 * Usage:
 * ```tsx
 * const { accounts, activeAccountId, switchAccount, addAccount, removeAccount } = useAccountContainer();
 * ```
 */
export function useAccountContainer() {
  const [state, setState] = useState<AccountContainerState>(() => ({
    accounts: loadAccountsFromStorage(),
    activeAccountId: localStorage.getItem(ACTIVE_ACCOUNT_KEY),
    device_id: getOrCreateDeviceId(),
  }));

  /**
   * Switch to account by user_id
   * Does NOT load auth session — just activates the context.
   * AuthProvider will boot with the session_id.
   */
  const switchAccount = useCallback((userId: string) => {
    setState((prev) => {
      const account = prev.accounts.find((a) => a.user_id === userId);
      if (!account) {
        console.warn('[AccountContainer] Account not found:', userId);
        return prev;
      }

      const nextState = {
        ...prev,
        activeAccountId: userId,
        accounts: prev.accounts.map((a) =>
          a.user_id === userId ? { ...a, last_active_at: new Date().toISOString() } : a,
        ),
      };

      // Persist
      try {
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
        saveAccountsToStorage(nextState.accounts);
      } catch {
        // ignore
      }

      return nextState;
    });
  }, []);

  /**
   * Add a new account (after successful auth)
   * Called by login flow with session_id from session registry.
   */
  const addAccount = useCallback(
    (userId: string, sessionId: string, profile?: StoredAccount['profile']) => {
      setState((prev) => {
        // Check if account already exists
        const existing = prev.accounts.find((a) => a.user_id === userId);
        if (existing) {
          // Update existing
          const nextAccounts = prev.accounts.map((a) =>
            a.user_id === userId
              ? {
                  ...a,
                  session_id: sessionId,
                  profile: profile || a.profile,
                  last_active_at: new Date().toISOString(),
                }
              : a,
          );
          saveAccountsToStorage(nextAccounts);
          return { ...prev, accounts: nextAccounts };
        }

        // Create new account
        const newAccount: StoredAccount = {
          user_id: userId,
          session_id: sessionId,
          profile: profile || { username: '' },
          added_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        };

        const nextAccounts = [...prev.accounts, newAccount];
        saveAccountsToStorage(nextAccounts);

        // Activate as default if first account
        const nextState =
          prev.accounts.length === 0
            ? { ...prev, accounts: nextAccounts, activeAccountId: userId }
            : { ...prev, accounts: nextAccounts };

        return nextState;
      });
    },
    [],
  );

  /**
   * Remove account from device
   */
  const removeAccount = useCallback((userId: string) => {
    setState((prev) => {
      const nextAccounts = prev.accounts.filter((a) => a.user_id !== userId);
      const nextActiveId = prev.activeAccountId === userId ? null : prev.activeAccountId;

      try {
        saveAccountsToStorage(nextAccounts);
        if (nextActiveId) {
          localStorage.setItem(ACTIVE_ACCOUNT_KEY, nextActiveId);
        } else {
          localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        }
      } catch {
        // ignore
      }

      return {
        ...prev,
        accounts: nextAccounts,
        activeAccountId: nextActiveId,
      };
    });
  }, []);

  /**
   * Get current active account
   */
  const getActiveAccount = useCallback((): StoredAccount | null => {
    const id = state.activeAccountId;
    if (!id) return null;
    return state.accounts.find((a) => a.user_id === id) || null;
  }, [state]);

  /**
   * Get account by user_id
   */
  const getAccount = useCallback(
    (userId: string): StoredAccount | null => {
      return state.accounts.find((a) => a.user_id === userId) || null;
    },
    [state.accounts],
  );

  /**
   * Update account metadata (profile)
   */
  const updateAccount = useCallback((userId: string, updates: Partial<StoredAccount>) => {
    setState((prev) => {
      const nextAccounts = prev.accounts.map((a) =>
        a.user_id === userId
          ? {
              ...a,
              profile: updates.profile || a.profile,
              session_id: updates.session_id || a.session_id,
            }
          : a,
      );

      try {
        saveAccountsToStorage(nextAccounts);
      } catch {
        // ignore
      }

      return { ...prev, accounts: nextAccounts };
    });
  }, []);

  return {
    // State
    accounts: state.accounts,
    activeAccountId: state.activeAccountId,
    deviceId: state.device_id,

    // Actions
    switchAccount,
    addAccount,
    removeAccount,
    updateAccount,

    // Queries
    getActiveAccount,
    getAccount,
  };
}
