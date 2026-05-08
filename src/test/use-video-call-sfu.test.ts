import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Mock auth
const authState = { user: { id: "u-test" } as null | { id: string } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));

// Mock Supabase
const supabaseMock = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({ eq: vi.fn().mockReturnValue({ error: null }) })),
    select: vi.fn(() => ({ eq: vi.fn().mockReturnValue({ maybeSingle: { mockResolvedValue: vi.fn().mockResolvedValue({ data: null }) } }) })),
    insert: vi.fn(() => ({ eq: vi.fn().mockReturnValue({ error: null }) })),
  })),
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), track: { send: vi.fn() } }),
  removeChannel: vi.fn(),
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

function mockGetUserMedia(hasVideo: boolean) {
  const tracks = [{ kind: "audio", stop: vi.fn(), enabled: true, id: "audio-1" }];
  if (hasVideo) tracks.push({ kind: "video", stop: vi.fn(), enabled: true, id: "video-1" });
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t: any) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t: any) => t.kind === "video"),
  } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
}
function resetAll() { vi.clearAllMocks(); authState.user = { id: "u-test" }; }

describe("useVideoCallSfu", () => {
  beforeEach(() => { resetAll(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("initializes with idle state", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    expect(result.current.status).toBe("idle");
    expect(result.current.isMuted).toBe(true);
    expect(result.current.isVideoOff).toBe(false);
  });

  it("starts a video call", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    mockGetUserMedia(true);
    await act(async () => { await result.current.startCall("u-callee", "conv-1", "video"); });
    expect(result.current.status).toBe("calling");
    expect(result.current.currentCall?.call_type).toBe("video");
  });

  it("starts an audio call", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    mockGetUserMedia(false);
    await act(async () => { await result.current.startCall("u-callee", "conv-1", "audio"); });
    expect(result.current.status).toBe("calling");
    expect(result.current.currentCall?.call_type).toBe("audio");
  });

  it("answers a call", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    mockGetUserMedia(false);
    const call = {
      id: "call-1", caller_id: "u-caller", callee_id: "u-callee", conversation_id: "conv-1",
      call_type: "audio" as const, status: "ringing" as const,
      created_at: new Date().toISOString(), started_at: null, ended_at: null,
      caller_profile: { display_name: "Caller", avatar_url: null },
      callee_profile: { display_name: "Callee", avatar_url: null },
    };
    await act(async () => { await result.current.answerCall(call); });
    expect(result.current.status).toBe("connected");
    expect(result.current.connectionState).toBe("connecting");
  });

  it("ends a call", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    mockGetUserMedia(false);
    await act(async () => { await result.current.startCall("u-callee", "conv-1", "audio"); });
    expect(result.current.status).toBe("calling");
    expect(result.current.connectionState).toBe("connecting");
    await act(async () => { await result.current.endCall(); });
    expect(result.current.status).toBe("idle");
    expect(result.current.connectionState).toBe("unknown");
  });

  it("toggles mute", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    act(() => result.current.toggleMute());
    expect(result.current.isMuted).toBe(false);
    act(() => result.current.toggleMute());
    expect(result.current.isMuted).toBe(true);
  });

  it("toggles video", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    act(() => result.current.toggleVideo());
    expect(result.current.isVideoOff).toBe(true);
    act(() => result.current.toggleVideo());
    expect(result.current.isVideoOff).toBe(false);
  });

  it("tracks media bootstrap progress", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());
    act(() => {
      result.current.markMediaBootstrapProgress("send_transport_created");
      result.current.markMediaBootstrapProgress("recv_transport_created");
    });
    expect([...result.current.mediaBootstrapProgress]).toContain("send_transport_created");
    expect([...result.current.mediaBootstrapProgress]).toContain("recv_transport_created");
    expect([...result.current.mediaBootstrapProgress]).toHaveLength(2);
  });
});
