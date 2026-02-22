import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const navigateSpy = vi.fn();

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
  reels: [] as any[],
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("@/components/reels/CreateReelSheet", () => ({
  CreateReelSheet: () => null,
}));

vi.mock("@/components/reels/ReelShareSheet", () => ({
  ReelShareSheet: () => null,
}));

vi.mock("@/components/reels/ReelCommentsSheet", () => ({
  ReelCommentsSheet: () => null,
}));

vi.mock("@/components/feed/CreateMenu", () => ({
  CreateMenu: ({ onSelect }: { onSelect: (type: string) => void }) => (
    <button type="button" onClick={() => onSelect("reels")}>
      select-reels
    </button>
  ),
}));

vi.mock("@/components/feed/PostEditorFlow", () => ({
  PostEditorFlow: () => null,
}));

vi.mock("@/components/feed/StoryEditorFlow", () => ({
  StoryEditorFlow: () => null,
}));

vi.mock("@/components/profile/FollowersSheet", () => ({
  FollowersSheet: () => null,
}));

vi.mock("@/components/profile/HighlightsManager", () => ({
  HighlightsManager: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: {
      display_name: "Tester",
      avatar_url: null,
      verified: false,
      bio: "",
      website: "",
      stats: { postsCount: 0, followersCount: 0, followingCount: 0 },
    },
    loading: false,
    updateProfile: vi.fn(),
  }),
  useUserPosts: () => ({ posts: [], loading: false }),
}));

vi.mock("@/hooks/useSavedPosts", () => ({
  useSavedPosts: () => ({ savedPosts: [], fetchSavedPosts: vi.fn(), loading: false }),
}));

vi.mock("@/hooks/useReels", () => ({
  useReels: () => ({
    reels: state.reels,
    loading: false,
    toggleLike: vi.fn(),
    toggleSave: vi.fn(),
    toggleRepost: vi.fn(),
    recordView: vi.fn(),
    recordImpression: vi.fn(),
    recordViewed: vi.fn(),
    recordWatched: vi.fn(),
    recordSkip: vi.fn(),
    setReelFeedback: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe("reels create entrypoints", () => {
  beforeAll(() => {
    class IO {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", IO as any);
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  beforeEach(() => {
    state.user = { id: "user-1" };
    state.reels = [];
    navigateSpy.mockClear();
    vi.clearAllMocks();
  });

  it("opens CreateReelSheet from CreatePost menu reels action", async () => {
    const { CreatePost } = await import("@/components/feed/CreatePost");
    render(<CreatePost />);

    fireEvent.click(screen.getByRole("button", { name: "select-reels" }));

    expect(navigateSpy).toHaveBeenCalledWith("/create?tab=reels&auto=1");
  });

  it("opens CreateReelSheet from ProfilePage menu reels action", async () => {
    const { ProfilePage } = await import("@/pages/ProfilePage");
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "select-reels" }));

    expect(navigateSpy).toHaveBeenCalledWith("/create?tab=reels&auto=1");
  });

  it("opens CreateReelSheet from empty ReelsPage CTA", async () => {
    state.reels = [];
    const { ReelsPage } = await import("@/pages/ReelsPage");
    render(<ReelsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Создать Reel" }));

    expect(navigateSpy).toHaveBeenCalledWith("/create?tab=reels&auto=1");
  });

  it("opens CreateReelSheet from ReelsPage sidebar create button when feed has items", async () => {
    state.reels = [
      {
        id: "reel-1",
        author_id: "author-1",
        video_url: "https://example.com/video.mp4",
        thumbnail_url: null,
        description: "desc",
        likes_count: 0,
        comments_count: 0,
        saves_count: 0,
        reposts_count: 0,
        author: { display_name: "Author", avatar_url: "", verified: false },
      },
    ];

    const { ReelsPage } = await import("@/pages/ReelsPage");
    render(<ReelsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Создать Reel" }));

    expect(navigateSpy).toHaveBeenCalledWith("/create?tab=reels&auto=1");
  });
});
