import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rotateGroupMembershipAfterRemoval } from "@/lib/e2ee/groupMembershipRotation";

const getGroupKeyTreeMock = vi.fn();
const removeGroupMemberMock = vi.fn();

vi.mock("@/lib/e2ee/groupKeyTree", () => ({
  getGroupKeyTree: (...args: unknown[]) => getGroupKeyTreeMock(...args),
  removeGroupMember: (...args: unknown[]) => removeGroupMemberMock(...args),
}));

// Minimal E2EEKeyStore stub for testing
function makeKeyStore(keys: Map<string, CryptoKey>): {
  getKey: (id: string) => Promise<CryptoKey | null>;
} {
  return {
    async getKey(id: string) {
      return keys.get(id) ?? null;
    },
  };
}

// Stores the encryptFn passed to removeGroupMember so we can call it
let capturedEncryptFn: ((recipientId: string, nodeKey: ArrayBuffer) => Promise<{
  ciphertext: string; iv: string; ephemeralPublicKey: string;
}>) | null = null;

describe("group membership rotation helper", () => {
  beforeEach(() => {
    getGroupKeyTreeMock.mockReset();
    removeGroupMemberMock.mockReset();
    capturedEncryptFn = null;
    // Re-set mockImplementation AFTER reset so capturedEncryptFn is populated
    removeGroupMemberMock.mockImplementation(async (_convId: unknown, _removedId: unknown, encryptFn: Function) => {
      capturedEncryptFn = encryptFn;
      return { epoch: 2 };
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when local key tree is missing", async () => {
    getGroupKeyTreeMock.mockReturnValue(null);

    const ks = makeKeyStore(new Map());
    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a", ks, "user-initiator");

    expect(result).toBe(false);
    expect(removeGroupMemberMock).not.toHaveBeenCalled();
  });

  it("returns false when removeGroupMember throws", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });
    removeGroupMemberMock.mockRejectedValue(new Error("boom"));

    const ks = makeKeyStore(new Map());
    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a", ks, "user-initiator");

    expect(result).toBe(false);
  });

  it("passes correct parameters to removeGroupMember", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });

    const ks = makeKeyStore(new Map());
    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a", ks, "user-initiator");

    expect(result).toBe(true);
    expect(removeGroupMemberMock).toHaveBeenCalledTimes(1);
    const [conversationId, removedUserId] = removeGroupMemberMock.mock.calls[0];
    expect(conversationId).toBe("group-1");
    expect(removedUserId).toBe("user-a");
  });

  // ─── GROUP-3 mutation test ─────────────────────────────────────────────────────
  // SECURITY TEST: ciphertext MUST NOT equal raw nodeKey.
  // Before the fix: callback returned { ciphertext: toBase64(nodeKey) } — raw key leaked.
  // After the fix: callback uses ECDH+AES-GCM — ciphertext ≠ raw nodeKey.
  // This test FAILS if someone reverts the fix to `toBase64(nodeKey)`.

  it("encrypts node key — ciphertext must not equal raw nodeKey", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });

    // Pre-keyed identity for recipient so ECDH works
    const recipientPublicKp = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits", "deriveKey"],
    );

    const ks = makeKeyStore(new Map([
      ["identity:user-b:public", recipientPublicKp.publicKey],
    ]));

    await rotateGroupMembershipAfterRemoval("group-1", "user-a", ks, "user-initiator");

    // Call the captured encryptFn as removeGroupMember would
    const rawNodeKey = new Uint8Array(32);
    crypto.getRandomValues(rawNodeKey);
    const encrypted = await capturedEncryptFn!("user-b", rawNodeKey.buffer as ArrayBuffer);

    // Must have ephemeral public key (needed for recipient to derive AES key)
    expect(encrypted.ephemeralPublicKey).toBeTruthy();
    expect(typeof encrypted.ephemeralPublicKey).toBe("string");
    expect(encrypted.ephemeralPublicKey.length).toBeGreaterThan(10);

    // Ciphertext must not equal raw nodeKey (GROUP-3 mutation test)
    const rawB64 = btoa(String.fromCharCode(...rawNodeKey));
    expect(encrypted.ciphertext).not.toBe(rawB64);

    // IV must be present
    expect(encrypted.iv).toBeTruthy();
    expect(typeof encrypted.iv).toBe("string");
  });

  it("throws when recipient identity public key is missing from keyStore", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });

    const ks = makeKeyStore(new Map()); // no keys at all

    await rotateGroupMembershipAfterRemoval("group-1", "user-a", ks, "user-initiator");

    const rawNodeKey = new Uint8Array(32);
    crypto.getRandomValues(rawNodeKey);

    // Must throw when recipient public key is absent — fail-closed
    await expect(
      capturedEncryptFn!("user-b", rawNodeKey.buffer as ArrayBuffer),
    ).rejects.toThrow(/identity public key not found/i);
  });
});
