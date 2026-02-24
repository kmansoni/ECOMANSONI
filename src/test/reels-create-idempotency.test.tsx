import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();

  return {
    user: { id: "user-123" } as null | { id: string },
    createReel: vi.fn(),
    upload,
    getPublicUrl,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock("@/hooks/useReels", () => ({
  useReels: () => ({
    createReel: state.createReel,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        if (bucket !== "reels-media") throw new Error(`Unexpected bucket: ${bucket}`);
        return {
          upload: state.upload,
          getPublicUrl: state.getPublicUrl,
        };
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/hashtagModeration", () => ({
  checkHashtagsAllowedForText: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("CreateReelSheet idempotency (P0C)", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn> | null = null;
  let randomUuidSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    state.user = { id: "user-123" };
    state.createReel.mockReset();
    state.upload.mockReset();
    state.getPublicUrl.mockReset();

    sessionStorage.clear();

    // jsdom does not implement createObjectURL by default.
    (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:mock");
    (globalThis.URL as any).revokeObjectURL = vi.fn(() => undefined);

    // Simulate video metadata load so duration precheck can pass.
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: any, options?: any) => {
      const el = originalCreateElement(tagName, options) as any;
      if (String(tagName).toLowerCase() !== "video") return el;

      Object.defineProperty(el, "duration", {
        configurable: true,
        get: () => 1,
      });

      Object.defineProperty(el, "src", {
        configurable: true,
        set: () => {
          queueMicrotask(() => {
            if (typeof el.onloadedmetadata === "function") el.onloadedmetadata(new Event("loadedmetadata"));
          });
        },
        get: () => "",
      });

      return el;
    });

    randomUuidSpy = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockImplementationOnce(() => "publish-1")
      .mockImplementation(() => "publish-next");
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
    createElementSpy = null;
    randomUuidSpy?.mockRestore();
    randomUuidSpy = null;
  });

  it("T1: double-tap publish triggers only one in-flight write", async () => {
    const { CreateReelSheet } = await import("@/components/reels/CreateReelSheet");

    state.upload.mockResolvedValue({ error: null });
    state.createReel.mockResolvedValue({ data: { id: "reel-1" }, error: null });

    render(<CreateReelSheet open={true} onOpenChange={() => {}} />);

    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });

    const publish = await screen.findByRole("button", { name: "Опубликовать" });
    fireEvent.click(publish);
    fireEvent.click(publish);

    await waitFor(() => {
      expect(state.upload).toHaveBeenCalledTimes(1);
      expect(state.createReel).toHaveBeenCalledTimes(1);
    });

    expect(state.upload).toHaveBeenCalledWith(
      "user-123/reels/publish-1/original.mp4",
      expect.any(File),
      expect.objectContaining({
        upsert: false,
      }),
    );

    expect(state.createReel).toHaveBeenCalledWith(
      "user-123/reels/publish-1/original.mp4",
      undefined,
      undefined,
      undefined,
      "publish-1",
    );
  });

  it("T2: retry reuses client_publish_id and deterministic storage path (409 treated as success)", async () => {
    const { CreateReelSheet } = await import("@/components/reels/CreateReelSheet");

    state.upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: { message: "Resource already exists", statusCode: 409 },
      });

    state.createReel
      .mockResolvedValueOnce({ data: null, error: "timeout" })
      .mockResolvedValueOnce({ data: { id: "reel-1" }, error: null });

    render(<CreateReelSheet open={true} onOpenChange={() => {}} />);

    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const publish = await screen.findByRole("button", { name: "Опубликовать" });
    fireEvent.click(publish);

    await waitFor(() => {
      expect(state.createReel).toHaveBeenCalledTimes(1);
    });

    // Key must be persisted after a failure so retry uses the same intent id.
    expect(sessionStorage.getItem("reels_client_publish_id:user-123")).toBe("publish-1");

    // Retry after failure
    fireEvent.click(await screen.findByRole("button", { name: "Опубликовать" }));

    await waitFor(() => {
      expect(state.upload).toHaveBeenCalledTimes(2);
      expect(state.createReel).toHaveBeenCalledTimes(2);
    });

    // Both attempts must target the same deterministic object key.
    expect(state.upload.mock.calls[0][0]).toBe("user-123/reels/publish-1/original.mp4");
    expect(state.upload.mock.calls[1][0]).toBe("user-123/reels/publish-1/original.mp4");

    // Both attempts must reuse the same idempotency key.
    expect(state.createReel.mock.calls[0][4]).toBe("publish-1");
    expect(state.createReel.mock.calls[1][4]).toBe("publish-1");

    // Successful publish clears the persisted intent.
    expect(sessionStorage.getItem("reels_client_publish_id:user-123")).toBeNull();
  });
});
