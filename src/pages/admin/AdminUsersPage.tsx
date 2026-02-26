import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  admin_user_roles?: { role?: { name: string; display_name: string; category: string } | null }[];
};

type AdminRoleRow = {
  id: string;
  name: string;
  display_name: string;
  category: string;
  requires_approval: boolean;
};

type RevokeDraft = {
  admin_user_id: string;
  role_name: string;
  role_display_name: string;
  role_category: string;
};

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const [targetAdminId, setTargetAdminId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [reason, setReason] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [deactivateTargetId, setDeactivateTargetId] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  const [revokeDraft, setRevokeDraft] = useState<RevokeDraft | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeTicketId, setRevokeTicketId] = useState("");
  const [revokeApprovalId, setRevokeApprovalId] = useState("");
  const [revoking, setRevoking] = useState(false);

  const selectedRole = useMemo(() => roles.find((r) => r.name === roleName) ?? null, [roles, roleName]);
  const assignNeedsApproval = Boolean(selectedRole?.requires_approval) || selectedRole?.category === "owner" || selectedRole?.category === "security";
  const revokeNeedsApproval = revokeDraft?.role_category === "owner" || revokeDraft?.role_category === "security";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [admins, roleData] = await Promise.all([
        adminApi<AdminUserRow[]>("admin_users.list", { limit: 100 }),
        adminApi<AdminRoleRow[]>("admin_roles.list"),
      ]);
      setRows(admins ?? []);
      setRoles(roleData ?? []);
      if (admins?.length) {
        setTargetAdminId((prev) => prev || admins[0].id);
      }
      if (roleData?.length) {
        setRoleName((prev) => prev || roleData[0].name);
      }
    } catch (e) {
      toast.error("Failed to load admins", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi("admin_users.create", {
        email: email.trim(),
        display_name: displayName.trim(),
      });
      toast.success("Admin created");
      setEmail("");
      setDisplayName("");
      await load();
    } catch (e) {
      toast.error("Create failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const requestAssignApproval = async () => {
    if (!targetAdminId || !roleName || !reason.trim()) {
      toast.error("Fill admin, role and reason");
      return;
    }
    try {
      const data = await adminApi<{ id: string }>("approvals.request", {
        operation_type: "iam.role.assign",
        operation_description: `Assign role ${roleName} to ${targetAdminId}`,
        operation_payload: { admin_user_id: targetAdminId, role_name: roleName },
        request_reason: reason.trim(),
        ticket_id: ticketId.trim() || undefined,
        required_approvers: 1,
        approver_roles: ["owner"],
      });
      setApprovalId(data.id);
      toast.success("Approval requested", { description: data.id });
    } catch (e) {
      toast.error("Approval request failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const assignRole = async () => {
    if (!targetAdminId || !roleName || !reason.trim()) {
      toast.error("Fill admin, role and reason");
      return;
    }
    if (assignNeedsApproval && !approvalId.trim()) {
      toast.error("approval_id required for this role");
      return;
    }
    setAssigning(true);
    try {
      await adminApi("admin_user_roles.assign", {
        admin_user_id: targetAdminId,
        role_name: roleName,
        reason: reason.trim(),
        ticket_id: ticketId.trim() || undefined,
        approval_id: approvalId.trim() || undefined,
      });
      toast.success("Role assigned");
      setReason("");
      setTicketId("");
      setApprovalId("");
      await load();
    } catch (e) {
      toast.error("Assign failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAssigning(false);
    }
  };

  const requestRevokeApproval = async () => {
    if (!revokeDraft || !revokeReason.trim()) {
      toast.error("Fill revoke reason");
      return;
    }
    try {
      const data = await adminApi<{ id: string }>("approvals.request", {
        operation_type: "iam.role.revoke",
        operation_description: `Revoke role ${revokeDraft.role_name} from ${revokeDraft.admin_user_id}`,
        operation_payload: {
          admin_user_id: revokeDraft.admin_user_id,
          role_name: revokeDraft.role_name,
        },
        request_reason: revokeReason.trim(),
        ticket_id: revokeTicketId.trim() || undefined,
        required_approvers: 1,
        approver_roles: ["owner"],
      });
      setRevokeApprovalId(data.id);
      toast.success("Approval requested", { description: data.id });
    } catch (e) {
      toast.error("Approval request failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const revokeRole = async () => {
    if (!revokeDraft || !revokeReason.trim()) {
      toast.error("Fill revoke reason");
      return;
    }
    if (revokeNeedsApproval && !revokeApprovalId.trim()) {
      toast.error("approval_id required for this role");
      return;
    }
    setRevoking(true);
    try {
      await adminApi("admin_user_roles.revoke", {
        admin_user_id: revokeDraft.admin_user_id,
        role_name: revokeDraft.role_name,
        reason: revokeReason.trim(),
        ticket_id: revokeTicketId.trim() || undefined,
        approval_id: revokeApprovalId.trim() || undefined,
      });
      toast.success("Role revoked");
      setRevokeDraft(null);
      setRevokeReason("");
      setRevokeTicketId("");
      setRevokeApprovalId("");
      await load();
    } catch (e) {
      toast.error("Revoke failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRevoking(false);
    }
  };

  const deactivateAdmin = async () => {
    if (!deactivateTargetId || !deactivateReason.trim()) {
      toast.error("Select admin and reason");
      return;
    }
    setDeactivating(true);
    try {
      await adminApi("admin_users.deactivate", {
        admin_user_id: deactivateTargetId,
        reason: deactivateReason.trim(),
      });
      toast.success("Admin deactivated");
      setDeactivateTargetId("");
      setDeactivateReason("");
      await load();
    } catch (e) {
      toast.error("Deactivate failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>Create Admin</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={createAdmin}>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Admin" />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={creating} className="w-full">Create</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assign Role</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Admin</Label>
              <Select value={targetAdminId} onValueChange={setTargetAdminId}>
                <SelectTrigger><SelectValue placeholder="Admin" /></SelectTrigger>
                <SelectContent>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={roleName} onValueChange={setRoleName}>
                <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.display_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                data-testid="assign-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ticket_id</Label>
              <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="SUP-123" />
            </div>
            <div className="space-y-2">
              <Label>approval_id</Label>
              <Input value={approvalId} onChange={(e) => setApprovalId(e.target.value)} placeholder={assignNeedsApproval ? "required" : "optional"} />
            </div>
            <div className="md:col-span-5 flex justify-end gap-2">
              {assignNeedsApproval ? (
                <Button data-testid="request-assign-approval" variant="outline" onClick={requestAssignApproval}>
                  Request approval
                </Button>
              ) : null}
              <Button onClick={assignRole} disabled={assigning}>Assign</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Admin Directory</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.display_name}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="flex flex-wrap gap-1">
                          {(r.admin_user_roles ?? []).map((x) => x.role).filter(Boolean).map((role) => (
                            <Button
                              key={(role as any).name}
                              size="sm"
                              variant="secondary"
                              onClick={() => setRevokeDraft({
                                admin_user_id: r.id,
                                role_name: (role as any).name,
                                role_display_name: (role as any).display_name,
                                role_category: (role as any).category,
                              })}
                            >
                              {(role as any).display_name}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell>{r.last_login_at ? new Date(r.last_login_at).toLocaleString() : "-"}</TableCell>
                      <TableCell className="text-right">
                        {r.status === "active" ? (
                          <Button size="sm" variant="outline" onClick={() => setDeactivateTargetId(r.id)}>
                            Prepare deactivate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Deactivate Admin</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Admin</Label>
              <Select value={deactivateTargetId} onValueChange={setDeactivateTargetId}>
                <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
                <SelectContent>
                  {rows.filter((r) => r.status === "active").map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="destructive" className="w-full" onClick={deactivateAdmin} disabled={deactivating}>Deactivate</Button>
            </div>
          </CardContent>
        </Card>

        {revokeDraft ? (
          <Card>
            <CardHeader><CardTitle>Revoke Role</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Target: {revokeDraft.admin_user_id} / {revokeDraft.role_display_name}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input
                    data-testid="revoke-role-reason-input"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ticket_id</Label>
                  <Input value={revokeTicketId} onChange={(e) => setRevokeTicketId(e.target.value)} placeholder="SUP-123" />
                </div>
                <div className="space-y-2">
                  <Label>approval_id</Label>
                  <Input value={revokeApprovalId} onChange={(e) => setRevokeApprovalId(e.target.value)} placeholder={revokeNeedsApproval ? "required" : "optional"} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {revokeNeedsApproval ? (
                  <Button data-testid="request-revoke-approval" variant="outline" onClick={requestRevokeApproval}>
                    Request approval
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setRevokeDraft(null)}>Cancel</Button>
                <Button variant="destructive" onClick={revokeRole} disabled={revoking}>Revoke role</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
