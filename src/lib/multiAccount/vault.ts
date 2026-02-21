export type AccountId = string;

export type AccountProfileSnapshot = {
  accountId: AccountId;
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
  updatedAt: string;
};

export type AccountIndexEntry = {
  accountId: AccountId;
  addedAt: string;
  lastActiveAt: string;
  requiresReauth: boolean;
  profile: AccountProfileSnapshot | null;
};

export type StoredSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
};

const STORAGE_PREFIX = "ma:v1";

function keyActive(): string {
  return `${STORAGE_PREFIX}:activeAccountId`;
}

function keyIndex(): string {
  return `${STORAGE_PREFIX}:accountsIndex`;
}

function keyTokens(accountId: AccountId): string {
  return `${STORAGE_PREFIX}:tokens:${accountId}`;
}

function keyDeviceId(): string {
  return `${STORAGE_PREFIX}:deviceId`;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isUuidLike(value: string): boolean {
  // Supabase user_id is UUID by default.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function hasValidStoredTokens(accountId: AccountId): boolean {
  const parsed = safeParseJson<StoredSessionTokens>(localStorage.getItem(keyTokens(accountId)));
  if (!parsed) return false;
  return typeof parsed.accessToken === "string" && typeof parsed.refreshToken === "string";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getActiveAccountId(): AccountId | null {
  const v = localStorage.getItem(keyActive());
  return v && v.trim() ? v : null;
}

export function setActiveAccountId(accountId: AccountId | null): void {
  if (!accountId) {
    localStorage.removeItem(keyActive());
    return;
  }
  localStorage.setItem(keyActive(), accountId);
}

export function listAccountsIndex(): AccountIndexEntry[] {
  const parsed = safeParseJson<AccountIndexEntry[]>(localStorage.getItem(keyIndex()));
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((e) => e && typeof (e as any).accountId === "string" && (e as any).accountId)
    .map((e) => ({
      accountId: e.accountId,
      addedAt: typeof e.addedAt === "string" ? e.addedAt : nowIso(),
      lastActiveAt: typeof e.lastActiveAt === "string" ? e.lastActiveAt : nowIso(),
      requiresReauth: !!e.requiresReauth,
      profile: e.profile ?? null,
    }));
}

// Removes entries that cannot possibly work:
// - invalid accountId format
// - duplicates
// - missing or malformed stored tokens
// Returns the sanitized index and persists it if changes are needed.
export function pruneAccountsIndex(): AccountIndexEntry[] {
  const existing = listAccountsIndex();
  const seen = new Set<AccountId>();

  const next = existing.filter((e) => {
    if (!e?.accountId) return false;
    if (!isUuidLike(e.accountId)) return false;
    if (seen.has(e.accountId)) return false;
    seen.add(e.accountId);
    if (!hasValidStoredTokens(e.accountId)) return false;
    return true;
  });

  const changed = next.length !== existing.length;
  if (changed) {
    writeAccountsIndex(next);
    const active = getActiveAccountId();
    if (active && !next.some((x) => x.accountId === active)) {
      setActiveAccountId(null);
    }
  }

  return next;
}

export function writeAccountsIndex(next: AccountIndexEntry[]): void {
  localStorage.setItem(keyIndex(), JSON.stringify(next));
}

export function upsertAccountIndex(entry: {
  accountId: AccountId;
  requiresReauth?: boolean;
  profile?: AccountProfileSnapshot | null;
  touchActive?: boolean;
}): AccountIndexEntry[] {
  const existing = listAccountsIndex();
  const idx = existing.findIndex((x) => x.accountId === entry.accountId);
  const base: AccountIndexEntry = idx >= 0
    ? existing[idx]
    : {
        accountId: entry.accountId,
        addedAt: nowIso(),
        lastActiveAt: nowIso(),
        requiresReauth: false,
        profile: null,
      };

  const nextEntry: AccountIndexEntry = {
    ...base,
    requiresReauth: entry.requiresReauth ?? base.requiresReauth,
    profile: entry.profile !== undefined ? entry.profile : base.profile,
    lastActiveAt: entry.touchActive ? nowIso() : base.lastActiveAt,
  };

  const next = [...existing];
  if (idx >= 0) next[idx] = nextEntry;
  else next.unshift(nextEntry);
  writeAccountsIndex(next);
  return next;
}

export function readTokens(accountId: AccountId): StoredSessionTokens | null {
  const parsed = safeParseJson<StoredSessionTokens>(localStorage.getItem(keyTokens(accountId)));
  if (!parsed) return null;
  if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
  };
}

export function writeTokens(accountId: AccountId, tokens: StoredSessionTokens): void {
  localStorage.setItem(keyTokens(accountId), JSON.stringify(tokens));
}

export function clearTokens(accountId: AccountId): void {
  localStorage.removeItem(keyTokens(accountId));
}

export function deriveUsernameFromDisplayName(displayName: string | null | undefined): string {
  const raw = (displayName ?? "").trim();
  if (!raw) return "user";
  const normalized = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]+/g, "");
  // If input is non-latin, normalization can collapse into meaningless separators.
  const meaningful = normalized.replace(/[_.-]+/g, "");
  if (!meaningful) return "user";
  return normalized;
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(keyDeviceId());
  if (existing && existing.trim()) return existing;

  const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `dev_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

  try {
    localStorage.setItem(keyDeviceId(), next);
  } catch {
    // ignore
  }
  return next;
}

