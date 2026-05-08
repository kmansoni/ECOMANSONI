import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabaseAdmin = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};
const mockSupabaseUser = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

const mockCreateClient = vi.fn((_url: string, _key: string, opts?: any) => {
  return opts?.global?.headers?.Authorization ? mockSupabaseUser : mockSupabaseAdmin;
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.39.3", () => ({
  createClient: mockCreateClient,
}));

describe("GDPR Export Edge Function", () => {
  const userId = "user-gdpr-export-test-123";
  const validAuthHeader = "Bearer valid-token-123";

  function makeReq(overrides?: { method?: string; headers?: Record<string, string>; body?: any }) {
    return new Request("https://test.supabase.co/functions/v1/gdpr-export", {
      method: overrides?.method ?? "POST",
      headers: { "content-type": "application/json", authorization: validAuthHeader, ...overrides?.headers },
      body: overrides?.body !== undefined ? JSON.stringify(overrides.body) : JSON.stringify({ format: "json" }),
    });
  }

  function setupAuthenticatedUser() {
    mockSupabaseUser.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  }

  function setupRateLimitPass() {
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "gdpr_exports") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  }

  function setupStorage() {
    mockSupabaseAdmin.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://test.supabase.co/storage/signed/file.json" },
        error: null,
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  });

  describe("Authentication", () => {
    it("should return 401 if authorization header missing", async () => {
      const req = new Request("https://test.supabase.co/functions/v1/gdpr-export", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const { default: handler } = await import("./index.ts");
      const res = await handler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it("should return 401 if user not authenticated", async () => {
      mockSupabaseUser.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Unauthorized"),
      });

      const { default: handler } = await import("./index.ts");
      const res = await handler(makeReq());
      expect(res.status).toBe(401);
    });
  });

  describe("Rate Limiting (DB-based)", () => {
    it("should return 429 when export limit exceeded", async () => {
      setupAuthenticatedUser();
      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === "gdpr_exports") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 3, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const { default: handler } = await import("./index.ts");
      const res = await handler(makeReq());

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("Rate limit");
    });
  });

  describe("Data Export", () => {
    it("should return signed URL (not public URL)", async () => {
      setupAuthenticatedUser();
      setupRateLimitPass();
      setupStorage();

      const { default: handler } = await import("./index.ts");
      const res = await handler(makeReq());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.downloadUrl).toContain("signed");
      expect(body.fileName).toBeTruthy();
      expect(body.expiresAt).toBeTruthy();
    });

    it("should store file in user-scoped path", async () => {
      setupAuthenticatedUser();
      setupRateLimitPass();
      const uploadSpy = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseAdmin.storage.from.mockReturnValue({
        upload: uploadSpy,
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.url/signed" },
          error: null,
        }),
      });

      const { default: handler } = await import("./index.ts");
      await handler(makeReq());

      expect(uploadSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${userId}/`),
        expect.any(Blob),
        expect.objectContaining({ contentType: "application/json" })
      );
    });

    it("should return 500 if storage upload fails", async () => {
      setupAuthenticatedUser();
      setupRateLimitPass();
      mockSupabaseAdmin.storage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: new Error("Storage error") }),
      });

      const { default: handler } = await import("./index.ts");
      const res = await handler(makeReq());
      expect(res.status).toBe(500);
    });
  });
});
