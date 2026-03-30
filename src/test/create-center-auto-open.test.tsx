import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Track component props via render context
let componentProps: {
  createContentModal?: any;
} = {};

vi.mock("@/components/feed/CreateContentModal", () => ({
  CreateContentModal: (props: any) => {
    componentProps.createContentModal = props;
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

  it("opens unified modal with reels tab when url has tab=reels&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter
        initialEntries={["/create?tab=reels&auto=1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.createContentModal).toBeDefined();
      expect(componentProps.createContentModal?.isOpen).toBe(true);
      expect(componentProps.createContentModal?.initialTab).toBe("reels");
    });
  });

  it("opens unified modal with publications tab when url has tab=post&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter
        initialEntries={["/create?tab=post&auto=1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.createContentModal).toBeDefined();
      expect(componentProps.createContentModal?.isOpen).toBe(true);
      expect(componentProps.createContentModal?.initialTab).toBe("publications");
    });
  });

  it("opens unified modal with stories tab when url has tab=story&auto=1", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter
        initialEntries={["/create?tab=story&auto=1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(componentProps.createContentModal).toBeDefined();
      expect(componentProps.createContentModal?.isOpen).toBe(true);
      expect(componentProps.createContentModal?.initialTab).toBe("stories");
    });
  });
});
