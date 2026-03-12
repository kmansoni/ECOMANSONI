import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rotateGroupMembershipAfterRemoval } from "@/lib/e2ee/groupMembershipRotation";

const getGroupKeyTreeMock = vi.fn();
const removeGroupMemberMock = vi.fn();

vi.mock("@/lib/e2ee/groupKeyTree", () => ({
  getGroupKeyTree: (...args: unknown[]) => getGroupKeyTreeMock(...args),
  removeGroupMember: (...args: unknown[]) => removeGroupMemberMock(...args),
}));

describe("group membership rotation helper", () => {
  beforeEach(() => {
    getGroupKeyTreeMock.mockReset();
    removeGroupMemberMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when local key tree is missing", async () => {
    getGroupKeyTreeMock.mockReturnValue(null);

    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a");

    expect(result).toBe(false);
    expect(removeGroupMemberMock).not.toHaveBeenCalled();
  });

  it("invokes removeGroupMember when tree is present", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });
    removeGroupMemberMock.mockResolvedValue({ epoch: 2 });

    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a");

    expect(result).toBe(true);
    expect(removeGroupMemberMock).toHaveBeenCalledTimes(1);
    const [conversationId, removedUserId, encryptFn] = removeGroupMemberMock.mock.calls[0];
    expect(conversationId).toBe("group-1");
    expect(removedUserId).toBe("user-a");
    expect(typeof encryptFn).toBe("function");
  });

  it("returns false when removeGroupMember throws", async () => {
    getGroupKeyTreeMock.mockReturnValue({ conversationId: "group-1" });
    removeGroupMemberMock.mockRejectedValue(new Error("boom"));

    const result = await rotateGroupMembershipAfterRemoval("group-1", "user-a");

    expect(result).toBe(false);
  });
});
