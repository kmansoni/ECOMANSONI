import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoCallScreen } from "@/components/chat/VideoCallScreen";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const createCall = () => ({
  id: "call-1",
  caller_id: "user-1",
  callee_id: "user-2",
  conversation_id: "conv-1",
  call_type: "audio" as const,
  status: "answered",
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  ended_at: null,
  caller_profile: { display_name: "Я", avatar_url: null },
  callee_profile: { display_name: "Собеседник", avatar_url: null },
});

describe("VideoCallScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("shows connecting state without retry button while media is not connected", () => {
    render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="connecting"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/Подключение/)).toBeInTheDocument();
    expect(screen.queryByText("Повторить")).not.toBeInTheDocument();
  });

  it("shows retry button and error state when connection failed", () => {
    const onRetry = vi.fn();

    render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="failed"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Ошибка соединения")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /Повторить/i });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not show retry button in fully connected state", () => {
    render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="connected"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByText("Повторить")).not.toBeInTheDocument();
    expect(screen.queryByText("Ошибка соединения")).not.toBeInTheDocument();
  });
});
