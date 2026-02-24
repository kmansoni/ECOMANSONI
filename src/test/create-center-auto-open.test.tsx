import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Track component props via render context
let componentProps: {
  createReelSheet?: any;
  postEditorFlow?: any;
  storyEditorFlow?: any;
} = {};

vi.mock("@/components/reels/CreateReelSheet", () => ({
  CreateReelSheet: (props: any) => {
    componentProps.createReelSheet = props;
    return null;
  },
}));

vi.mock("@/components/feed/PostEditorFlow", () => ({
  PostEditorFlow: (props: any) => {
    componentProps.postEditorFlow = props;
    return null;
  },
}));

vi.mock("@/components/feed/StoryEditorFlow", () => ({
  StoryEditorFlow: (props: any) => {
    componentProps.storyEditorFlow = props;
    return null;
  },
}));

vi.mock("@/contexts/ChatOpenContext", () => ({
  useChatOpen: () => ({ setIsCreatingContent: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("CreateCenterPage auto-open", () => {
  beforeEach(() => {
    componentProps = {};
  });

  it("auto-opens CreateReelSheet when url has tab=reels&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create?tab=reels&auto=1"]}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.createReelSheet).toBeDefined();
      expect(componentProps.createReelSheet?.open).toBe(true);
    });
  });

  it("auto-opens PostEditorFlow when url has tab=post&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create?tab=post&auto=1"]}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.postEditorFlow).toBeDefined();
      expect(componentProps.postEditorFlow?.isOpen).toBe(true);
    });
  });

  it("auto-opens StoryEditorFlow when url has tab=story&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create?tab=story&auto=1"]}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.storyEditorFlow).toBeDefined();
      expect(componentProps.storyEditorFlow?.isOpen).toBe(true);
    });
  });
});
