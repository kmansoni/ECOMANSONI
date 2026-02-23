import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "u1" } as null | { id: string },
}));

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
    message: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/lib/supabase", () => {
  const supabase = {
    rpc: vi.fn(() => Promise.resolve({ data: "conv-1", error: null })),
    from: vi.fn(() => {
      throw new Error("from() must not be called in contract-only DM creation");
    }),
  };
  return { supabase };
});

describe("DM creation contract (Project B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "u1" };
  });

  it("creates DM via RPC get_or_create_dm only", async () => {
    const { useCreateConversation } = await import("@/hooks/useChat");
    const { supabase } = await import("@/lib/supabase");

    const { result } = renderHook(() => useCreateConversation());
    const convId = await result.current.createConversation("u2");

    expect(convId).toBe("conv-1");
    expect((supabase as any).rpc).toHaveBeenCalledWith("get_or_create_dm", {
      target_user: "u2",
    });
    expect((supabase as any).from).not.toHaveBeenCalled();
  });

  it("hard-fails when RPC is unavailable and does not fallback", async () => {
    const { supabase } = await import("@/lib/supabase");
    (supabase as any).rpc.mockResolvedValueOnce({ data: null, error: { message: "function missing" } });

    const { useCreateConversation } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useCreateConversation());
    const convId = await result.current.createConversation("u2");

    expect(convId).toBeNull();
    expect(toastError).toHaveBeenCalled();
    expect((supabase as any).from).not.toHaveBeenCalled();
  });
});
