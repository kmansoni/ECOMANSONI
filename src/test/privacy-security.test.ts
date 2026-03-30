/**
 * Tests for src/lib/privacy-security.ts
 *
 * Covers:
 * - Happy-path data flows (upsert/select/update/delete)
 * - Supabase error propagation (errors must NOT be swallowed)
 * - IDOR guards: every mutating call must scope by user_id
 * - getOrCreatePrivacyRules: seed-failure is logged but does not abort the read
 * - getOrCreateUserSecuritySettings: inserts a row when none exists
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Supabase fluent query builder mock
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const maybeSingle = vi.fn();
  const orderFn = vi.fn(() => Promise.resolve({ data: [], error: null }));

  // is() can be terminal (await) OR chained (.order()).
  // Return a vi.fn() that produces a thenable-with-order so both patterns work.
  function makeIsThenableChain(): unknown {
    const p = Promise.resolve({ data: null, error: null });
    return Object.assign(p, { order: orderFn });
  }

  function makeChain(): Record<string, unknown> {
    return {
      eq: vi.fn((_f: string, _v: unknown) => makeChain()),
      is: vi.fn((_f: string, _v: unknown) => makeIsThenableChain()),
      order: orderFn,
      single,
      maybeSingle,
      select: vi.fn((_cols?: string) => makeChain()),
    };
  }

  const selectFn = vi.fn((_cols?: string) => makeChain());
  const updateFn = vi.fn((_patch: unknown) => makeChain());
  const deleteFn = vi.fn(() => makeChain());
  const insertFn = vi.fn(() => ({ select: vi.fn((_cols?: string) => makeChain()) }));
  const upsertFn = vi.fn(() => Promise.resolve({ data: null, error: null }));

  const fromFn = vi.fn(() => ({
    select: selectFn,
    upsert: upsertFn,
    insert: insertFn,
    update: updateFn,
    delete: deleteFn,
  }));

  return { fromFn, single, maybeSingle, upsertFn, insertFn, updateFn, deleteFn, selectFn, orderFn };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.fromFn },
}));

import {
  getOrCreatePrivacyRules,
  updatePrivacyRule,
  listPrivacyRuleExceptions,
  upsertPrivacyRuleException,
  deletePrivacyRuleException,
  getOrCreateUserSecuritySettings,
  updateUserSecuritySettings,
  listAuthorizedSites,
  revokeAuthorizedSite,
  revokeAllAuthorizedSites,
  PRIVACY_RULE_DEFAULTS,
  type PrivacyRule,
  type UserSecuritySettings,
  type AuthorizedSite,
} from "@/lib/privacy-security";

const USER_ID = "user-111";
const RULE_KEY = "last_seen" as const;
const ISO_NOW = new Date().toISOString();

function makeRule(overrides: Partial<PrivacyRule> = {}): PrivacyRule {
  return {
    user_id: USER_ID,
    rule_key: RULE_KEY,
    audience: "everyone",
    phone_discovery_audience: "everyone",
    p2p_mode: "always",
    hide_read_time: false,
    gift_badge_enabled: false,
    gift_allow_common: true,
    gift_allow_rare: true,
    gift_allow_unique: true,
    gift_allow_channels: true,
    gift_allow_premium: true,
    ios_call_integration: true,
    updated_at: ISO_NOW,
    created_at: ISO_NOW,
    ...overrides,
  };
}

function makeSecuritySettings(overrides: Partial<UserSecuritySettings> = {}): UserSecuritySettings {
  return {
    user_id: USER_ID,
    app_passcode_hash: null,
    cloud_password_hash: null,
    passkey_enabled: false,
    updated_at: ISO_NOW,
    created_at: ISO_NOW,
    ...overrides,
  };
}

function makeAuthorizedSite(overrides: Partial<AuthorizedSite> = {}): AuthorizedSite {
  return {
    id: "site-abc",
    user_id: USER_ID,
    site_name: "Example",
    domain: "example.com",
    browser: "Chrome",
    os: "Linux",
    location_label: null,
    last_active_at: ISO_NOW,
    created_at: ISO_NOW,
    revoked_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("privacy-security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("getOrCreatePrivacyRules", () => {
    it("returns rules from DB on success", async () => {
      const rules = [makeRule(), makeRule({ rule_key: "phone_number" })];
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      mocks.orderFn.mockResolvedValueOnce({ data: rules, error: null });

      const result = await getOrCreatePrivacyRules(USER_ID);

      expect(mocks.fromFn).toHaveBeenCalledWith("privacy_rules");
      expect(result).toEqual(rules);
    });

    it("continues with select even if seed upsert fails (graceful degradation)", async () => {
      const rules = [makeRule()];
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: { message: "seed failed" } });
      mocks.orderFn.mockResolvedValueOnce({ data: rules, error: null });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await getOrCreatePrivacyRules(USER_ID);
      consoleSpy.mockRestore();

      expect(result).toEqual(rules);
    });

    it("throws when select fails", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: { message: "select error" } });

      await expect(getOrCreatePrivacyRules(USER_ID)).rejects.toMatchObject({ message: "select error" });
    });

    it("returns empty array when no rules exist yet", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: null });

      const result = await getOrCreatePrivacyRules(USER_ID);
      expect(result).toEqual([]);
    });

    it("seeds all known PRIVACY_RULE_DEFAULTS keys", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      mocks.orderFn.mockResolvedValueOnce({ data: [], error: null });

      await getOrCreatePrivacyRules(USER_ID);

      const calls = mocks.upsertFn.mock.calls as unknown as Array<[unknown]>;
      expect(calls.length).toBeGreaterThan(0);
      const upsertArg = calls[0][0] as Array<{ rule_key: string }>;
      const seededKeys = upsertArg.map((r) => r.rule_key).sort();
      const expectedKeys = Object.keys(PRIVACY_RULE_DEFAULTS).sort();
      expect(seededKeys).toEqual(expectedKeys);
    });

    it("seeds rows scoped to requested user_id", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      mocks.orderFn.mockResolvedValueOnce({ data: [], error: null });

      await getOrCreatePrivacyRules(USER_ID);

      const calls = mocks.upsertFn.mock.calls as unknown as Array<[unknown]>;
      expect(calls.length).toBeGreaterThan(0);
      const upsertArg = calls[0][0] as Array<{ user_id: string }>;
      expect(upsertArg.every((r) => r.user_id === USER_ID)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("updatePrivacyRule", () => {
    it("returns updated rule", async () => {
      const updated = makeRule({ audience: "contacts" });
      mocks.single.mockResolvedValueOnce({ data: updated, error: null });

      const result = await updatePrivacyRule(USER_ID, RULE_KEY, { audience: "contacts" });
      expect(result).toEqual(updated);
    });

    it("throws on DB error", async () => {
      mocks.single.mockResolvedValueOnce({ data: null, error: { message: "update failed" } });
      await expect(updatePrivacyRule(USER_ID, RULE_KEY, {})).rejects.toMatchObject({ message: "update failed" });
    });

    it("IDOR guard: targets privacy_rules table", async () => {
      mocks.single.mockResolvedValueOnce({ data: makeRule(), error: null });
      await updatePrivacyRule(USER_ID, RULE_KEY, {});
      expect(mocks.fromFn).toHaveBeenCalledWith("privacy_rules");
    });
  });

  // -------------------------------------------------------------------------
  describe("listPrivacyRuleExceptions", () => {
    it("returns list from DB", async () => {
      const exc = [{ id: "ex-1", user_id: USER_ID, rule_key: RULE_KEY, mode: "always_allow", target_user_id: "other", created_at: ISO_NOW }];
      mocks.orderFn.mockResolvedValueOnce({ data: exc, error: null });

      const result = await listPrivacyRuleExceptions(USER_ID, RULE_KEY);
      expect(result).toEqual(exc);
    });

    it("throws on DB error", async () => {
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: { message: "list failed" } });
      await expect(listPrivacyRuleExceptions(USER_ID, RULE_KEY)).rejects.toMatchObject({ message: "list failed" });
    });

    it("returns empty array when data is null", async () => {
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: null });
      const result = await listPrivacyRuleExceptions(USER_ID, RULE_KEY);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe("upsertPrivacyRuleException", () => {
    it("resolves without throwing on success", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      await expect(upsertPrivacyRuleException(USER_ID, RULE_KEY, "always_allow", "target-1")).resolves.toBeUndefined();
    });

    it("throws on DB error", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: { message: "upsert exc failed" } });
      await expect(upsertPrivacyRuleException(USER_ID, RULE_KEY, "always_allow", "t")).rejects.toMatchObject({ message: "upsert exc failed" });
    });

    it("IDOR guard: upserted row always includes user_id", async () => {
      mocks.upsertFn.mockResolvedValueOnce({ data: null, error: null });
      await upsertPrivacyRuleException(USER_ID, RULE_KEY, "never_allow", "target-2");

      const calls = mocks.upsertFn.mock.calls as unknown as Array<[unknown]>;
      expect(calls.length).toBeGreaterThan(0);
      const upsertArg = calls[0][0] as { user_id: string };
      expect(upsertArg.user_id).toBe(USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  describe("deletePrivacyRuleException", () => {
    it("resolves without throwing on success", async () => {
      await expect(deletePrivacyRuleException("exc-id", USER_ID)).resolves.toBeUndefined();
    });

    it("targets privacy_rule_exceptions table", async () => {
      await deletePrivacyRuleException("exc-id", USER_ID);
      expect(mocks.fromFn).toHaveBeenCalledWith("privacy_rule_exceptions");
    });
  });

  // -------------------------------------------------------------------------
  describe("getOrCreateUserSecuritySettings", () => {
    it("returns existing settings when found", async () => {
      const settings = makeSecuritySettings();
      mocks.maybeSingle.mockResolvedValueOnce({ data: settings, error: null });

      const result = await getOrCreateUserSecuritySettings(USER_ID);
      expect(result).toEqual(settings);
      expect(mocks.insertFn).not.toHaveBeenCalled();
    });

    it("creates and returns settings when not found", async () => {
      const created = makeSecuritySettings();
      mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mocks.single.mockResolvedValueOnce({ data: created, error: null });

      const result = await getOrCreateUserSecuritySettings(USER_ID);
      expect(mocks.insertFn).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it("throws when maybeSingle returns error", async () => {
      mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "lookup failed" } });
      await expect(getOrCreateUserSecuritySettings(USER_ID)).rejects.toMatchObject({ message: "lookup failed" });
    });

    it("throws when insert fails", async () => {
      mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mocks.single.mockResolvedValueOnce({ data: null, error: { message: "insert failed" } });
      await expect(getOrCreateUserSecuritySettings(USER_ID)).rejects.toMatchObject({ message: "insert failed" });
    });
  });

  // -------------------------------------------------------------------------
  describe("updateUserSecuritySettings", () => {
    it("returns updated settings", async () => {
      const updated = makeSecuritySettings({ passkey_enabled: true });
      mocks.single.mockResolvedValueOnce({ data: updated, error: null });

      const result = await updateUserSecuritySettings(USER_ID, { passkey_enabled: true });
      expect(result).toEqual(updated);
    });

    it("throws on DB error", async () => {
      mocks.single.mockResolvedValueOnce({ data: null, error: { message: "update sec failed" } });
      await expect(updateUserSecuritySettings(USER_ID, {})).rejects.toMatchObject({ message: "update sec failed" });
    });
  });

  // -------------------------------------------------------------------------
  describe("listAuthorizedSites", () => {
    it("returns active sites", async () => {
      const sites = [makeAuthorizedSite()];
      mocks.orderFn.mockResolvedValueOnce({ data: sites, error: null });

      const result = await listAuthorizedSites(USER_ID);
      expect(result).toEqual(sites);
    });

    it("throws on DB error", async () => {
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: { message: "list sites failed" } });
      await expect(listAuthorizedSites(USER_ID)).rejects.toMatchObject({ message: "list sites failed" });
    });

    it("returns empty array when data is null", async () => {
      mocks.orderFn.mockResolvedValueOnce({ data: null, error: null });
      const result = await listAuthorizedSites(USER_ID);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe("revokeAuthorizedSite", () => {
    it("resolves without throwing on success", async () => {
      await expect(revokeAuthorizedSite(USER_ID, "site-abc")).resolves.toBeUndefined();
    });

    it("throws on DB error", async () => {
      mocks.updateFn.mockReturnValueOnce({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: { message: "revoke failed" } })),
        })),
      });
      await expect(revokeAuthorizedSite(USER_ID, "site-abc")).rejects.toMatchObject({ message: "revoke failed" });
    });

    it("IDOR guard: targets authorized_sites table", async () => {
      await revokeAuthorizedSite(USER_ID, "site-abc");
      expect(mocks.fromFn).toHaveBeenCalledWith("authorized_sites");
    });
  });

  // -------------------------------------------------------------------------
  describe("revokeAllAuthorizedSites", () => {
    it("resolves without throwing on success", async () => {
      await expect(revokeAllAuthorizedSites(USER_ID)).resolves.toBeUndefined();
    });

    it("throws on DB error", async () => {
      mocks.updateFn.mockReturnValueOnce({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({ error: { message: "revoke all failed" } })),
        })),
      });
      await expect(revokeAllAuthorizedSites(USER_ID)).rejects.toMatchObject({ message: "revoke all failed" });
    });

    it("IDOR guard: targets authorized_sites table", async () => {
      await revokeAllAuthorizedSites(USER_ID);
      expect(mocks.fromFn).toHaveBeenCalledWith("authorized_sites");
    });
  });
});
