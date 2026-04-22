import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoCallScreen } from "@/components/chat/VideoCallScreen";

class MediaStreamMock {
  private readonly tracks: Array<{ kind: "audio" | "video" }>;

  constructor(tracks: Array<{ kind: "audio" | "video" }> = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

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

const createVideoCall = () => ({
  ...createCall(),
  call_type: "video" as const,
});

describe("VideoCallScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("MediaStream", MediaStreamMock as unknown as typeof MediaStream);

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
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  it("shows connecting state without retry button while media is not connected", () => {
    render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        callState="transport_connecting"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="new"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Подключение")).toBeInTheDocument();
    expect(screen.getByText(/Настраиваем аудио и видео/)).toBeInTheDocument();
    expect(screen.queryByText("Соединение")).not.toBeInTheDocument();
    expect(screen.queryByText("Повторить")).not.toBeInTheDocument();
  });

  it("shows retry button and error state when connection failed", () => {
    const onRetry = vi.fn();

    render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        callState="failed"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="new"
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
    const { container } = render(
      <VideoCallScreen
        call={createCall()}
        pendingCalleeProfile={null}
        status="connected"
        callState="in_call"
        localStream={null}
        remoteStream={null}
        isMuted={false}
        isVideoOff={false}
        connectionState="new"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute("data-call-connected", "true");
    expect(container.firstElementChild).toHaveAttribute("data-call-state", "in_call");
    expect(screen.queryByText("Повторить")).not.toBeInTheDocument();
    expect(screen.queryByText("Ошибка соединения")).not.toBeInTheDocument();
  });

  it("marks the connected video branch for e2e selectors", () => {
    const { container } = render(
      <VideoCallScreen
        call={createVideoCall()}
        pendingCalleeProfile={null}
        status="connected"
        callState="in_call"
        localStream={new MediaStreamMock() as unknown as MediaStream}
        remoteStream={new MediaStreamMock() as unknown as MediaStream}
        isMuted={false}
        isVideoOff={false}
        connectionState="connected"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute("data-call-connected", "true");
    expect(container.firstElementChild).toHaveAttribute("data-call-state", "in_call");
  });

  it("renders hidden remote audio sink in video-call layout", () => {
    const { container } = render(
      <VideoCallScreen
        call={createVideoCall()}
        pendingCalleeProfile={null}
        status="connected"
        callState="in_call"
        localStream={new MediaStreamMock([{ kind: "audio" }, { kind: "video" }]) as unknown as MediaStream}
        remoteStream={new MediaStreamMock([{ kind: "audio" }, { kind: "video" }]) as unknown as MediaStream}
        isMuted={false}
        isVideoOff={false}
        connectionState="connected"
        onEnd={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleVideo={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    const audioElements = container.querySelectorAll("audio");
    expect(audioElements.length).toBeGreaterThanOrEqual(1);
  });
});
