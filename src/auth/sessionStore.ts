export type AccountSession = {
  account_id: string;
  session_id: string;
  access_token: string;
  refresh_token: string;
  refresh_expires_at: string;
};

const SESSIONS_KEY = "mansoni_multi_account_sessions_v1";
const ACTIVE_ACCOUNT_KEY = "mansoni_active_account_v1";

export function loadSessions(): Record<string, AccountSession> {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, AccountSession>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function saveSessions(sessions: Record<string, AccountSession>): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function setSession(accountId: string, session: AccountSession): void {
  const all = loadSessions();
  all[accountId] = session;
  saveSessions(all);
}

export function deleteSession(accountId: string): void {
  const all = loadSessions();
  delete all[accountId];
  saveSessions(all);

  if (getActiveAccount() === accountId) {
    const fallback = Object.keys(all)[0] ?? null;
    if (fallback) setActiveAccount(fallback);
    else clearActiveAccount();
  }
}

export function setActiveAccount(accountId: string): void {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}

export function getActiveAccount(): string | null {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export function clearActiveAccount(): void {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}
