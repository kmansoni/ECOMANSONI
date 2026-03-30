import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let modalProps: any = null;

vi.mock("@/components/feed/CreateContentModal", () => ({
  CreateContentModal: (props: any) => {
    modalProps = props;
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

describe("CreateCenterPage entry defaults", () => {
  beforeEach(() => {
    modalProps = null;
  });

  it("defaults to post for plus entry when tab is absent", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(modalProps).toBeDefined();
      expect(modalProps?.isOpen).toBe(true);
      expect(modalProps?.initialTab).toBe("publications");
    });
  });

  it("maps tab=story to stories in unified modal", async () => {
    const { CreateCenterPage } = await import("@/pages/CreateCenterPage");

    render(
      <MemoryRouter initialEntries={["/create?tab=story"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/create" element={<CreateCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(modalProps).toBeDefined();
      expect(modalProps?.initialTab).toBe("stories");
    });
  });
});
