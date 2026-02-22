import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const adminApiMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("@/lib/adminApi", () => ({
  adminApi: (...args: any[]) => adminApiMock(...args),
}));

vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: any[]) => toastErrorMock(...args),
    success: (...args: any[]) => toastSuccessMock(...args),
  },
}));

describe("AdminVerificationsPage owner approval flow", () => {
  beforeEach(() => {
    adminApiMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    adminApiMock.mockImplementation(async (action: string) => {
      if (action === "verifications.list") {
        return [
          {
            id: "v-1",
            user_id: "u-owner",
            verification_type: "owner",
            is_active: true,
            verified_at: "2026-02-22T10:00:00.000Z",
            verified_by_admin_id: "a-1",
            revoked_at: null,
            revoked_by_admin_id: null,
            reason: "Owner role",
            ticket_id: "SUP-1",
          },
        ];
      }
      if (action === "approvals.request") {
        return { id: "appr-1", status: "pending", requested_at: "2026-02-22T10:01:00.000Z" };
      }
      return {};
    });
  });

  it("requests approval for owner revoke from inline revoke form", async () => {
    const { AdminVerificationsPage } = await import("@/pages/admin/AdminVerificationsPage");
    render(<AdminVerificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("u-owner")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Prepare Revoke" }));

    fireEvent.change(screen.getByTestId("revoke-reason-input"), { target: { value: "Policy breach" } });
    fireEvent.click(screen.getByTestId("request-owner-revoke-approval"));

    await waitFor(() => {
      expect(adminApiMock).toHaveBeenCalledWith(
        "approvals.request",
        expect.objectContaining({
          operation_type: "verification.revoke",
          operation_payload: {
            user_id: "u-owner",
            verification_type: "owner",
          },
          approver_roles: ["owner"],
        }),
      );
    });
  });
});
