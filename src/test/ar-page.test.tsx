import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ARPage } from "@/pages/ARPage";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function renderARPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ARPage />
    </MemoryRouter>
  );
}

describe("ARPage", () => {
  // Store original mediaDevices so each test restores it
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    }
  });

  it("renders the page heading", () => {
    renderARPage();
    expect(screen.getByText("AR-просмотр")).toBeInTheDocument();
  });

  it("renders the hero section", () => {
    renderARPage();
    expect(screen.getByText("Дополненная реальность")).toBeInTheDocument();
  });

  it("shows the AR launch button", () => {
    renderARPage();
    expect(screen.getByRole("button", { name: /запустить ar/i })).toBeInTheDocument();
  });

  it("renders all AR feature cards", () => {
    renderARPage();
    expect(screen.getByText("Сканирование объектов")).toBeInTheDocument();
    expect(screen.getByText("3D-просмотр недвижимости")).toBeInTheDocument();
    expect(screen.getByText("AR-примерка")).toBeInTheDocument();
  });

  it("requests camera access when launch button is clicked (granted)", async () => {
    // Mock getUserMedia to resolve (camera granted)
    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
    });

    const { toast } = await import("sonner");
    renderARPage();

    fireEvent.click(screen.getByRole("button", { name: /запустить ar/i }));

    await waitFor(() => {
      expect(screen.getByText(/доступ к камере предоставлен/i)).toBeInTheDocument();
    });

    expect(toast.info).toHaveBeenCalled();
  });

  it("shows error state when camera access is denied", async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
    });

    const { toast } = await import("sonner");
    renderARPage();

    fireEvent.click(screen.getByRole("button", { name: /запустить ar/i }));

    await waitFor(() => {
      expect(screen.getByText(/доступ к камере отклонён/i)).toBeInTheDocument();
    });

    expect(toast.error).toHaveBeenCalled();
  });
});
