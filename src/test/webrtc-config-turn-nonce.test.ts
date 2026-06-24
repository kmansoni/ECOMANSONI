import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("webrtc-config TURN nonce contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_TURN_CREDENTIALS_URL", "https://example.test/functions/v1/turn-credentials");
    vi.stubEnv("VITE_TURN_CREDENTIALS_API_KEY", "public-turn-key");
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "jwt-token",
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends x-turn-nonce and x-request-id to direct TURN endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [{ urls: "turn:turn.example.test:3478", username: "u", credential: "c" }],
        ttlSeconds: 3600,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/webrtc-config");
    mod.clearIceServerCache();

    const result = await mod.getIceServers({ forceRelay: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/functions/v1/turn-credentials");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-token");
    expect(headers.apikey).toBe("public-turn-key");
    expect(headers["x-turn-nonce"]).toBeTruthy();
    expect(headers["x-request-id"]).toBeTruthy();
    // RFC 7635 §4.2: nonce MUST be random and different from requestId
    expect(headers["x-turn-nonce"]).not.toBe(headers["x-request-id"]);
    // Nonce must be base64url-encoded (no +/= chars)
    expect(headers["x-turn-nonce"]).toMatch(/^[A-Za-z0-9_-]+$/);
    // Nonce should be reasonably long (16 bytes → ~22 base64 chars)
    expect(headers["x-turn-nonce"].length).toBeGreaterThanOrEqual(20);

    const body = JSON.parse(String(init.body)) as { nonce: string; requestId: string };
    expect(body.nonce).toBe(headers["x-turn-nonce"]);
    expect(body.requestId).toBe(headers["x-request-id"]);
    expect(result.iceTransportPolicy).toBe("relay");
  });

  it("sends nonce metadata in fallback Supabase invoke after direct endpoint failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_request"}',
    });
    vi.stubGlobal("fetch", fetchMock);
    invokeMock.mockResolvedValue({
      data: {
        iceServers: [{ urls: "turn:turn.example.test:3478", username: "u", credential: "c" }],
        ttlSeconds: 3600,
      },
      error: null,
    });

    const mod = await import("@/lib/webrtc-config");
    mod.clearIceServerCache();

    await mod.getIceServers({ forceRelay: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const [fnName, options] = invokeMock.mock.calls[0] as [string, {
      body: { nonce: string; requestId: string };
      headers: Record<string, string>;
    }];

    expect(fnName).toBe("turn-credentials");
    expect(options.headers["x-turn-nonce"]).toBeTruthy();
    expect(options.headers["x-request-id"]).toBeTruthy();
    expect(options.headers["x-turn-nonce"]).toBe(options.body.nonce);
    expect(options.headers["x-request-id"]).toBe(options.body.requestId);
  });
});
