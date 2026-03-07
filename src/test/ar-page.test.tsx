import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ARPage } from "@/pages/ARPage";

vi.mock("@/lib/ar/faceDetection", () => ({
  loadModel: vi.fn().mockResolvedValue(undefined),
  detectFaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/ar/backgroundSegmentation", () => ({
  loadSegmentationModel: vi.fn().mockResolvedValue(undefined),
  segmentPerson: vi.fn().mockResolvedValue(null),
  applyBackgroundBlur: vi.fn(),
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
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    }
    console.error = originalConsoleError;
  });

  it("renders the page heading", () => {
    renderARPage();
    expect(screen.getByText("AR Камера")).toBeInTheDocument();
  });

  it("renders the hero section", () => {
    renderARPage();
    expect(screen.getByText("AR Фильтры")).toBeInTheDocument();
  });

  it("shows the AR launch button", () => {
    renderARPage();
    expect(screen.getByRole("button", { name: /открыть камеру/i })).toBeInTheDocument();
  });

  it("renders filter preview grid", () => {
    renderARPage();
    expect(screen.getByText("🌅")).toBeInTheDocument();
    expect(screen.getByText("🎮")).toBeInTheDocument();
    expect(screen.getByText(/18\+ уникальных фильтров/i)).toBeInTheDocument();
  });

  it("opens AR camera when launch button is clicked", async () => {
    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
    });

    renderARPage();

    fireEvent.click(screen.getByRole("button", { name: /открыть камеру/i }));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: /фото/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /видео/i })).toBeInTheDocument();
  });

  it("shows camera error state when access is denied", async () => {
    console.error = vi.fn();
    const mockGetUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
    });

    renderARPage();

    fireEvent.click(screen.getByRole("button", { name: /открыть камеру/i }));

    await waitFor(() => {
      expect(screen.getByText(/нет доступа к камере/i)).toBeInTheDocument();
    });
  });
});
