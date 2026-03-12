import { beforeEach, describe, expect, it, vi } from "vitest";

const selectByUserIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock("@/lib/e2ee/db-types", () => ({
  e2eeDb: {
    userEncryptionKeys: {
      selectByUserId: selectByUserIdMock,
    },
  },
}));

vi.mock("@/lib/e2ee/crypto", () => ({
  deriveSharedSecret: vi.fn(),
  hkdfDerive: vi.fn(),
  wrapKey: vi.fn(),
  unwrapKey: vi.fn(),
  importPublicKey: vi.fn(),
  generateMessageKey: vi.fn(),
  exportPublicKey: vi.fn(),
}));

describe("keyDistribution identity-key retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it("retries identity-key lookup and returns data when it appears", async () => {
    selectByUserIdMock
      .mockResolvedValueOnce({ data: null, error: { message: "not found" } })
      .mockResolvedValueOnce({ data: null, error: { message: "not found" } })
      .mockResolvedValueOnce({
        data: { public_key_raw: "pk-raw", fingerprint: "fp-1" },
        error: null,
      });

    const { fetchIdentityKeyWithRetry } = await import("@/lib/e2ee/keyDistribution");

    const pending = fetchIdentityKeyWithRetry("user-1");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(selectByUserIdMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ public_key_raw: "pk-raw", fingerprint: "fp-1" });
  });

  it("returns null after bounded retries when identity key is still unavailable", async () => {
    selectByUserIdMock
      .mockResolvedValueOnce({ data: null, error: { message: "missing" } })
      .mockResolvedValueOnce({ data: null, error: { message: "missing" } })
      .mockResolvedValueOnce({ data: null, error: { message: "missing" } });

    const { fetchIdentityKeyWithRetry } = await import("@/lib/e2ee/keyDistribution");

    const pending = fetchIdentityKeyWithRetry("user-2");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(selectByUserIdMock).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  });
});
