import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  auto_expire_hours: number | null;
};

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const [targetAdminId, setTargetAdminId] = useState<string>("");
  const [roleName, setRoleName] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [ticketId, setTicketId] = useState<string>("");
  const [approvalId, setApprovalId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const targetAdmin = useMemo(() => rows.find((r) => r.id === targetAdminId) ?? null, [rows, targetAdminId]);
  const selectedRole = useMemo(() => roles.find((r) => r.name === roleName) ?? null, [roles, roleName]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi<AdminUserRow[]>("admin_users.list", { limit: 100 });
      setRows(data);
      const roleData = await adminApi<AdminRoleRow[]>("admin_roles.list");
      setRoles(roleData);
      if (!targetAdminId && data.length > 0) setTargetAdminId(data[0].id);
      if (!roleName && roleData.length > 0) setRoleName(roleData[0].name);
    } catch (e) {
      toast.error("Не удалось загрузить админов", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi("admin_users.create", {
        email,
        display_name: displayName,
      });
      toast.success("Админ создан");
      setEmail("");
      setDisplayName("");
      await load();
    } catch (err) {
      toast.error("Ошибка", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (adminUserId: string) => {
    const reason = prompt("Причина деактивации?");
    if (!reason) return;

    try {
      await adminApi("admin_users.deactivate", { admin_user_id: adminUserId, reason });
      toast.success("Админ деактивирован");
      await load();
    } catch (err) {
      toast.error("Ошибка", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAssignRole = async () => {
    if (!targetAdminId || !roleName || !reason.trim()) {
      toast.error("Заполните admin/role/reason");
      return;
    }

    setAssigning(true);
    try {
      await adminApi("admin_user_roles.assign", {
        admin_user_id: targetAdminId,
        role_name: roleName,
        reason,
        ticket_id: ticketId || undefined,
        approval_id: approvalId || undefined,
      });
      toast.success("Роль назначена");
      setReason("");
      setTicketId("");
      setApprovalId("");
      await load();
    } catch (e) {
      toast.error("Ошибка", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAssigning(false);
    }
  };

  const handleRevokeRole = async (adminUserId: string, roleToRevoke: string) => {
    const revokeReason = prompt("Причина снятия роли?");
    if (!revokeReason) return;

    const localTicket = prompt("ticket_id (опционально)") || undefined;
    const localApproval = prompt("approval_id (нужно для owner/security)") || undefined;

    try {
      await adminApi("admin_user_roles.revoke", {
        admin_user_id: adminUserId,
        role_name: roleToRevoke,
        reason: revokeReason,
        ticket_id: localTicket,
        approval_id: localApproval,
      });
      toast.success("Роль снята");
      await load();
    } catch (e) {
      toast.error("Ошибка", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Создать админа</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Admin" />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={creating} className="w-full">
                  Создать
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Назначить роль</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Admin</Label>
                <Select value={targetAdminId} onValueChange={setTargetAdminId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {rows.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={roleName} onValueChange={setRoleName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.name}>
                        {r.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why" />
              </div>

              <div className="space-y-2">
                <Label>ticket_id</Label>
                <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="SUP-123" />
              </div>

              <div className="space-y-2">
                <Label>approval_id</Label>
                <Input
                  value={approvalId}
                  onChange={(e) => setApprovalId(e.target.value)}
                  placeholder={selectedRole?.category === "security" || selectedRole?.category === "owner" ? "required" : "optional"}
                />
              </div>

              <div className="md:col-span-5 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {targetAdmin ? `Target: ${targetAdmin.email}` : ""}
                </div>
                <Button onClick={handleAssignRole} disabled={assigning}>
                  Назначить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Directory</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Имя</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Создан</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.email}</TableCell>
                      <TableCell>{r.display_name}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {(r.admin_user_roles ?? [])
                            .map((x) => x.role)
                            .filter(Boolean)
                            .map((role) => (
                              <Button
                                key={(role as any).name}
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRevokeRole(r.id, (role as any).name)}
                                title="Нажмите, чтобы снять роль"
                              >
                                {(role as any).display_name}
                              </Button>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell>{r.last_login_at ? new Date(r.last_login_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.status === "active" ? (
                          <Button variant="outline" size="sm" onClick={() => handleDeactivate(r.id)}>
                            Deactivate
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
      </div>
    </AdminShell>
  );
}
