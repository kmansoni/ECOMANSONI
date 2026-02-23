import { beforeEach, describe, expect, it } from "vitest";

import {
  clearTokens,
  deriveUsernameFromDisplayName,
  getActiveAccountId,
  listAccountsIndex,
  readTokens,
  setActiveAccountId,
  upsertAccountIndex,
  writeAccountsIndex,
  writeTokens,
} from "@/lib/multiAccount/vault";

describe("multiAccount/vault", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("derives stable username", () => {
    expect(deriveUsernameFromDisplayName("Александр Иванов")).toBe("user");
    // Latin
    expect(deriveUsernameFromDisplayName("John Doe")).toBe("john_doe");
    expect(deriveUsernameFromDisplayName("  ")).toBe("user");
  });

  it("stores and reads activeAccountId", () => {
    expect(getActiveAccountId()).toBeNull();
    setActiveAccountId("u1");
    expect(getActiveAccountId()).toBe("u1");
    setActiveAccountId(null);
    expect(getActiveAccountId()).toBeNull();
  });

  it("upserts account index and keeps newest first", () => {
    expect(listAccountsIndex()).toEqual([]);

    const a1 = upsertAccountIndex({ accountId: "u1", touchActive: true });
    expect(a1[0]?.accountId).toBe("u1");
    expect(a1[0]?.requiresReauth).toBe(false);

    const a2 = upsertAccountIndex({ accountId: "u2" });
    expect(a2[0]?.accountId).toBe("u2");
    expect(a2[1]?.accountId).toBe("u1");

    const a3 = upsertAccountIndex({ accountId: "u1", requiresReauth: true });
    const u1 = a3.find((x) => x.accountId === "u1");
    expect(u1?.requiresReauth).toBe(true);
  });

  it("survives corrupted index JSON", () => {
    localStorage.setItem("ma:v1:accountsIndex", "{not-json");
    expect(listAccountsIndex()).toEqual([]);
  });

  it("stores and clears tokens", () => {
    expect(readTokens("u1")).toBeNull();
    writeTokens("u1", { accessToken: "a", refreshToken: "r", expiresAt: 123 });
    expect(readTokens("u1")).toEqual({ accessToken: "a", refreshToken: "r", expiresAt: 123 });
    clearTokens("u1");
    expect(readTokens("u1")).toBeNull();
  });

  it("normalizes malformed index entries", () => {
    writeAccountsIndex([
      // @ts-expect-error - intentionally malformed (missing required fields)
      { accountId: "u1" },
      // @ts-expect-error - intentionally malformed (invalid accountId)
      { accountId: "" },
      null,
    ]);
    const list = listAccountsIndex();
    expect(list.length).toBe(1);
    expect(list[0]?.accountId).toBe("u1");
    expect(typeof list[0]?.addedAt).toBe("string");
    expect(typeof list[0]?.lastActiveAt).toBe("string");
    expect(list[0]?.profile).toBeNull();
  });
});
