import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/components/reels/CreateReelSheet", () => ({
  CreateReelSheet: () => null,
}));

vi.mock("@/components/feed/PostEditorFlow", () => ({
  PostEditorFlow: () => null,
}));

vi.mock("@/components/feed/StoryEditorFlow", () => ({
  StoryEditorFlow: () => null,
}));

vi.mock("@/contexts/ChatOpenContext", () => ({
  useChatOpen: () => ({ setIsCreatingContent: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("CreateCenterPage entry defaults", () => {
  it("defaults to post for plus entry when tab is absent", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Новая публикация" })).toBeInTheDocument();
  });

  it("defaults to story for swipe entry when tab is absent", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create?entry=swipe"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Новая история" })).toBeInTheDocument();
  });
});
