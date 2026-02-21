import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InsuranceAssistant } from "@/components/insurance/InsuranceAssistant";

// Silence fetch during unit tests
global.fetch = vi.fn();

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("InsuranceAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the floating button when closed", () => {
    render(<InsuranceAssistant />);
    // The assistant starts as a floating button (not open)
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
  });

  it("opens the chat panel when the floating button is clicked", () => {
    render(<InsuranceAssistant />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Страховой консультант")).toBeInTheDocument();
  });

  it("shows the welcome message and suggested questions on first open", () => {
    render(<InsuranceAssistant />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText(/Привет/)).toBeInTheDocument();
    expect(screen.getByText("Сколько стоит ОСАГО?")).toBeInTheDocument();
    expect(screen.getByText("Что лучше: КАСКО или ОСАГО?")).toBeInTheDocument();
  });

  it("closes the chat when the close button is clicked", () => {
    render(<InsuranceAssistant />);
    // Open
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Страховой консультант")).toBeInTheDocument();

    // The header contains 3 icon buttons: [Maximize, Minimize, X]
    // The submit button in the form is after those. The X button is at index 2.
    const allButtons = screen.getAllByRole("button");
    const xButton = allButtons[2]; // Close (X) button
    fireEvent.click(xButton);

    // When closed, the input form should no longer be visible
    expect(screen.queryByPlaceholderText("Напишите вопрос...")).not.toBeInTheDocument();
  });

  it("disables the send button when input is empty", () => {
    render(<InsuranceAssistant />);
    fireEvent.click(screen.getByRole("button"));

    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    const submitBtn = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(true);
  });

  it("enables the send button when text is typed", () => {
    render(<InsuranceAssistant />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Напишите вопрос...");
    fireEvent.change(input, { target: { value: "Тест" } });

    const form = document.querySelector("form");
    const submitBtn = form!.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });
});
