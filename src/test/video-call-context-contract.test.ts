import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const signalingMock = {
  status: "connected",
  callState: "active",
  currentCall: null,
  incomingCall: null,
  connectionState: "connected",
  pendingCalleeProfile: null,
  startCall: vi.fn(),
  answerCall: vi.fn(),
  declineCall: vi.fn(),
  endCall: vi.fn(),
  retryConnection: vi.fn(),
};

const mediaMock = {
  localStream: null,
  remoteStream: null,
  remoteScreenStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  screenStream: null,
  noiseSuppressionEnabled: false,
  backgroundBlurEnabled: false,
  isE2eeActive: true,
  toggleMute: vi.fn(),
  toggleVideo: vi.fn(),
  toggleScreenShare: vi.fn(),
  toggleNoiseSuppression: vi.fn(),
  toggleBackgroundBlur: vi.fn(),
};

const uiMock = {
  isCallUiActive: true,
};

vi.mock("@/contexts/video-call/VideoCallSignalingContext", () => ({
  useVideoCallSignaling: () => signalingMock,
}));

vi.mock("@/contexts/video-call/VideoCallMediaContext", () => ({
  useVideoCallMedia: () => mediaMock,
}));

vi.mock("@/contexts/video-call/VideoCallUIContext", () => ({
  useVideoCallUI: () => uiMock,
}));

import { useVideoCallContext } from "@/contexts/video-call/index";

describe("useVideoCallContext contract", () => {
  it("includes isE2eeActive from media context in merged API", () => {
    const { result } = renderHook(() => useVideoCallContext());

    expect(result.current.isE2eeActive).toBe(true);
    expect(result.current.status).toBe("connected");
    expect(result.current.isCallUiActive).toBe(true);
  });
});
