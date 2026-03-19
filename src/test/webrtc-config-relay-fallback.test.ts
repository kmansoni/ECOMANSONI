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

describe("webrtc-config relay fallback policy", () => {
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

  it("keeps relay policy when forceRelay is requested and TURN is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: "turn:turn.example.test:3478", username: "u", credential: "c" },
          { urls: "stun:stun.l.google.com:19302" },
        ],
        ttlSeconds: 3600,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/webrtc-config");
    mod.clearIceServerCache();

    const result = await mod.getIceServers({ forceRelay: true });
    expect(result.iceTransportPolicy).toBe("relay");
  });

  it("downgrades to policy=all when relay requested but TURN is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        ttlSeconds: 3600,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/webrtc-config");
    mod.clearIceServerCache();

    const result = await mod.getIceServers({ forceRelay: true });
    expect(result.iceTransportPolicy).toBe("all");
  });

  it("uses relay for contacts-mode when callee is not a contact and TURN exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ["turn:turn.example.test:3478"], username: "u", credential: "c" },
        ],
        ttlSeconds: 3600,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/webrtc-config");
    mod.clearIceServerCache();

    const result = await mod.getIceServers({
      p2pMode: "contacts",
      isContactCall: false,
    });

    expect(result.iceTransportPolicy).toBe("relay");
  });
});
