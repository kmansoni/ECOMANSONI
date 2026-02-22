import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("AdminUsersPage approval flows", () => {
  beforeEach(() => {
    adminApiMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    adminApiMock.mockImplementation(async (action: string) => {
      if (action === "admin_users.list") {
        return [
          {
            id: "admin-1",
            email: "security@example.com",
            display_name: "Security Admin",
            status: "active",
            created_at: "2026-02-22T10:00:00.000Z",
            last_login_at: null,
            admin_user_roles: [
              {
                role: {
                  name: "owner",
                  display_name: "Owner",
                  category: "owner",
                },
              },
            ],
          },
        ];
      }
      if (action === "admin_roles.list") {
        return [
          {
            id: "role-1",
            name: "security_admin",
            display_name: "Security Admin",
            category: "security",
            requires_approval: true,
          },
        ];
      }
      if (action === "approvals.request") {
        return { id: "appr-1" };
      }
      return {};
    });
  });

  it("requests approval for high-risk role assign", async () => {
    const { AdminUsersPage } = await import("@/pages/admin/AdminUsersPage");
    render(<AdminUsersPage />);

    await screen.findByTestId("request-assign-approval");

    fireEvent.change(screen.getByTestId("assign-reason-input"), { target: { value: "Need incident access" } });
    fireEvent.click(screen.getByTestId("request-assign-approval"));

    await waitFor(() => {
      expect(adminApiMock).toHaveBeenCalledWith(
        "approvals.request",
        expect.objectContaining({
          operation_type: "iam.role.assign",
          operation_payload: {
            admin_user_id: "admin-1",
            role_name: "security_admin",
          },
          approver_roles: ["owner"],
        }),
      );
    });
  });

  it("requests approval for high-risk role revoke", async () => {
    const { AdminUsersPage } = await import("@/pages/admin/AdminUsersPage");
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText("Owner")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Owner" }));
    fireEvent.change(screen.getByTestId("revoke-role-reason-input"), { target: { value: "Role rotation" } });
    fireEvent.click(screen.getByTestId("request-revoke-approval"));

    await waitFor(() => {
      expect(adminApiMock).toHaveBeenCalledWith(
        "approvals.request",
        expect.objectContaining({
          operation_type: "iam.role.revoke",
          operation_payload: {
            admin_user_id: "admin-1",
            role_name: "owner",
          },
          approver_roles: ["owner"],
        }),
      );
    });
  });
});
