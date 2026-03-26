/**
 * src/lib/multiAccount/vault.ts — хранилище учётных данных multi-account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * МОДЕЛЬ УГРОЗ
 * ─────────────────────────────────────────────────────────────────────────
 * КРИТИЧЕСКИ ВАЖНО: `accessToken` и `refreshToken` — secrets уровня сессии.
 * Их утечка позволяет атакующему полностью захватить аккаунт без знания пароля.
 *
 * Токены ДОЛЖНЫ быть зашифрованы в localStorage. В противном случае:
 *   • Любой JS в том же origin читает токены через localStorage.getItem()
 *   • XSS-скрипт экфильтрует все refresh_token'ы за один roundtrip
 *   • Browser extension с host_permissions читает их без ведома пользователя
 *
 * РЕШЕНИЕ: readTokens / writeTokens используют AES-256-GCM через
 * localStorageCrypto.ts. API становится async — это сознательный trade-off:
 * безопасность важнее удобства sync-чтения.
 *
 * Индекс аккаунтов (accountsIndex) содержит только UUID + метаданные профиля —
 * не секреты, шифровать не обязательно (но и не вредно).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readEncrypted, writeEncrypted, removeEncrypted } from "../../auth/localStorageCrypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountId = string;

export interface AccountIndexEntry {
  accountId: AccountId;
  addedAt: string;
  lastActiveAt: string;
  requiresReauth: boolean;
  profile: AccountProfile | AccountProfileSnapshot | null;
}

export interface AccountProfile {
  display_name: string;
  avatar_url?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  username?: string | null;
  email?: string;
}

export interface AccountProfileSnapshot {
  accountId: AccountId;
  displayName: string | null;
  display_name?: string | null;
  username: string;
  avatarUrl: string | null;
  avatar_url?: string | null;
  updatedAt: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNTS_INDEX_KEY = "ma:v1:accountsIndex";
const ACTIVE_ACCOUNT_KEY = "ma:v1:activeAccountId";
const DEVICE_ID_KEY = "ma:v1:deviceId";
const TOKENS_PREFIX = "ma:v1:tokens:";

// ─── Device ID ────────────────────────────────────────────────────────────────

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length > 8) return existing;
    const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev_fallback_${Math.random().toString(36).slice(2)}`;
  }
}

// ─── Active Account ───────────────────────────────────────────────────────────

export function getActiveAccountId(): AccountId | null {
  try {
    const val = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    return val && val.length > 0 ? val : null;
  } catch {
    return null;
  }
}

export function setActiveAccountId(id: AccountId | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
  } catch {
    // silent
  }
}

// ─── Accounts Index ───────────────────────────────────────────────────────────

function normalizeEntry(raw: any): AccountIndexEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const accountId = typeof raw.accountId === "string" ? raw.accountId.trim() : "";
  if (!accountId) return null;
  const now = new Date().toISOString();
  return {
    accountId,
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : now,
    lastActiveAt: typeof raw.lastActiveAt === "string" ? raw.lastActiveAt : now,
    requiresReauth: raw.requiresReauth === true,
    profile: raw.profile && typeof raw.profile === "object" ? raw.profile : null,
  };
}

export function listAccountsIndex(): AccountIndexEntry[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((e): e is AccountIndexEntry => e !== null);
  } catch {
    return [];
  }
}

export function writeAccountsIndex(entries: any[]): void {
  try {
    const normalized = (entries ?? []).map(normalizeEntry).filter((e): e is AccountIndexEntry => e !== null);
    localStorage.setItem(ACCOUNTS_INDEX_KEY, JSON.stringify(normalized));
  } catch {
    // silent
  }
}

export function upsertAccountIndex(opts: {
  accountId: AccountId;
  touchActive?: boolean;
  requiresReauth?: boolean;
  profile?: AccountProfile | AccountProfileSnapshot | null;
}): AccountIndexEntry[] {
  const now = new Date().toISOString();
  const list = listAccountsIndex();

  const existingIdx = list.findIndex((e) => e.accountId === opts.accountId);
  if (existingIdx >= 0) {
    const entry = list[existingIdx];
    if (opts.requiresReauth !== undefined) entry.requiresReauth = opts.requiresReauth;
    if (opts.profile !== undefined) entry.profile = opts.profile;
    entry.lastActiveAt = now;
    // Move to front
    list.splice(existingIdx, 1);
    list.unshift(entry);
  } else {
    list.unshift({
      accountId: opts.accountId,
      addedAt: now,
      lastActiveAt: now,
      requiresReauth: opts.requiresReauth ?? false,
      profile: opts.profile ?? null,
    });
  }

  if (opts.touchActive) {
    setActiveAccountId(opts.accountId);
  }

  writeAccountsIndex(list);
  return list;
}

export function pruneAccountsIndex(keepAccountIds?: AccountId[]): AccountIndexEntry[] {
  if (!Array.isArray(keepAccountIds)) {
    return listAccountsIndex();
  }
  const keepSet = new Set(keepAccountIds);
  const list = listAccountsIndex().filter((e) => keepSet.has(e.accountId));
  writeAccountsIndex(list);
  return list;
}

// ─── Session Tokens (зашифрованные) ──────────────────────────────────────────

/**
 * Читает и расшифровывает токены сессии из localStorage.
 *
 * Обратная совместимость: если токены хранятся в legacy-формате plaintext
 * (до введения шифрования), они читаются as-is и будут перешифрованы при
 * следующем вызове writeTokens().
 *
 * @returns SessionTokens или null если токены отсутствуют/повреждены/невалидны
 */
export async function readTokens(accountId: AccountId): Promise<SessionTokens | null> {
  try {
    // readEncrypted обрабатывает как зашифрованный формат v1, так и legacy plaintext
    const decrypted = await readEncrypted(TOKENS_PREFIX + accountId);
    if (!decrypted) return null;

    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object") return null;

    // Строгая валидация структуры — защита от частично повреждённых данных
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string"
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
    };
  } catch {
    // JSON.parse упал — данные повреждены
    return null;
  }
}

/**
 * Шифрует и записывает токены сессии в localStorage.
 *
 * Использует AES-256-GCM через localStorageCrypto. Если шифрование
 * не удалось — токены НЕ записываются (fail-secure).
 *
 * @throws Пробрасывает ошибки шифрования — caller должен обработать
 *         (например, пометить аккаунт как requiresReauth = true).
 */
export async function writeTokens(
  accountId: AccountId,
  tokens: SessionTokens,
): Promise<void> {
  // writeEncrypted бросает если WebCrypto недоступен — не делаем plaintext-fallback
  await writeEncrypted(TOKENS_PREFIX + accountId, JSON.stringify(tokens));
}

/**
 * Удаляет токены сессии из localStorage.
 * Вызывается при logout или revocation.
 */
export function clearTokens(accountId: AccountId): void {
  removeEncrypted(TOKENS_PREFIX + accountId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function deriveUsernameFromDisplayName(displayName: string): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return "user";
  // Check if all non-ASCII (Cyrillic etc.)
  const latinOnly = trimmed.replace(/[^a-zA-Z0-9\s._-]/g, "");
  if (!latinOnly.trim()) return "user";
  return latinOnly.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 30);
}
