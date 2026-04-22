import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContactProfilePage } from "@/pages/ContactProfilePage";

const navigateMock = vi.fn();
const startCallMock = vi.fn();
const updateSettingMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ userId: "user-2" }),
    useLocation: () => ({
      pathname: "/contact/user-2",
      search: "",
      hash: "",
      key: "test",
      state: {
        name: "Собеседник",
        avatar: null,
        conversationId: "conv-1",
      },
    }),
  };
});

vi.mock("@/contexts/VideoCallContext", () => ({
  useVideoCallContext: () => ({
    startCall: startCallMock,
  }),
}));

vi.mock("@/hooks/useUserPresenceStatus", () => ({
  useUserPresenceStatus: () => ({
    isOnline: true,
    statusText: "в сети",
  }),
}));

vi.mock("@/hooks/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: { notifications_enabled: true },
    updateSetting: updateSettingMock,
  }),
}));

vi.mock("@/components/chat/MediaGallerySheet", () => ({
  MediaGallerySheet: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    display_name: "Собеседник",
                    username: "sobеседник",
                    avatar_url: null,
                    bio: null,
                    verified: false,
                    last_seen_at: null,
                    status_emoji: null,
                    status_sticker_url: null,
                  },
                }),
              }),
            }),
          }),
        };
      }

      if (table === "messages") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }

      if (table === "blocked_users") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  },
}));

describe("ContactProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders accessible audio and video call actions", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ContactProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Аудиозвонок" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Видеозвонок" })).toBeInTheDocument();
  });
});