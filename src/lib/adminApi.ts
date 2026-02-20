import { supabase } from "@/lib/supabase";

export type AdminApiAction =
  | "me"
  | "admin_users.list"
  | "admin_users.create"
  | "admin_users.deactivate"
  | "admin_roles.list"
  | "admin_user_roles.assign"
  | "admin_user_roles.revoke"
  | "killswitch.list"
  | "killswitch.set"
  | "audit.search"
  | "approvals.list"
  | "approvals.request"
  | "approvals.decide"
  | "jit.request"
  | "jit.active"
  | "jit.approve"
  | "jit.revoke";

export type KillSwitchRow = {
  key: string;
  enabled: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type JitRequest = {
  id: string;
  requested_by: string;
  requester: { email: string; display_name: string };
  approver_id: string | null;
  role_id: string;
  role: { name: string; display_name: string };
  reason: string;
  ticket_id: string;
  requested_at: string;
  approved_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  duration_minutes: number;
  status: "pending" | "active" | "revoked" | "expired";
};

export type AdminRole = {
  id: string;
  name: string;
  display_name: string;
  category: string;
};

export type AdminMe = {
  admin_user_id: string;
  email: string;
  display_name: string;
  status: string;
  roles: AdminRole[];
  scopes: string[];
};

export type AdminApiOk<T> = { ok: true; data: T };
export type AdminApiErr = { ok?: false; error: string };

export async function adminApi<T>(action: AdminApiAction, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-api", {
    body: { action, params },
  });

  if (error) throw error;

  const payload = data as AdminApiOk<T> | AdminApiErr;
  if (!payload || (payload as any).ok !== true) {
    throw new Error((payload as any)?.error || "Admin API error");
  }

  return (payload as AdminApiOk<T>).data;
}

export function isOwner(me: AdminMe | null | undefined): boolean {
  return !!me?.roles?.some((r) => r.name === "owner");
}

export function hasScope(me: AdminMe | null | undefined, scope: string): boolean {
  return !!me?.scopes?.includes(scope);
}
