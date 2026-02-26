import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi, PrimaryOwner, StaffProfile } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAdminMe } from "@/hooks/useAdminMe";
import { isOwner } from "@/lib/adminApi";

type StaffKind = "moderator" | "administrator" | "owner";

export function AdminStaffProfilesPage() {
  const { me } = useAdminMe();
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [primaryOwner, setPrimaryOwner] = useState<PrimaryOwner | null>(null);
  const [primaryReason, setPrimaryReason] = useState("");
  const [primaryTarget, setPrimaryTarget] = useState("");
  const [settingPrimary, setSettingPrimary] = useState(false);

  const [targetAdminId, setTargetAdminId] = useState("");
  const [staffKind, setStaffKind] = useState<StaffKind>("administrator");
  const [messengerPanelAccess, setMessengerPanelAccess] = useState(false);
  const [canAssignRoles, setCanAssignRoles] = useState(false);
  const [canManageVerifications, setCanManageVerifications] = useState(false);
  const [canReviewReports, setCanReviewReports] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [notes, setNotes] = useState("");

  const canManage = useMemo(() => isOwner(me), [me]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profiles, owner] = await Promise.all([
        adminApi<StaffProfile[]>("staff_profiles.list", { limit: 200 }),
        adminApi<PrimaryOwner | null>("owner.primary.get"),
      ]);
      setRows(profiles ?? []);
      setPrimaryOwner(owner ?? null);

      if (!targetAdminId && profiles.length > 0) {
        const first = profiles[0];
        setTargetAdminId(first.admin_user_id);
        hydrateForm(first);
      }
      if (!primaryTarget && owner?.admin_user_id) {
        setPrimaryTarget(owner.admin_user_id);
      }
    } catch (e) {
      toast.error("Failed to load staff profiles", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [primaryTarget, targetAdminId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hydrateForm = (row: StaffProfile) => {
    setStaffKind(row.staff_kind);
    setMessengerPanelAccess(Boolean(row.messenger_panel_access));
    setCanAssignRoles(Boolean(row.can_assign_roles));
    setCanManageVerifications(Boolean(row.can_manage_verifications));
    setCanReviewReports(Boolean(row.can_review_reports));
    setTimezone(row.timezone ?? "");
    setNotes(row.notes ?? "");
  };

  const onSelectTarget = (adminUserId: string) => {
    setTargetAdminId(adminUserId);
    const row = rows.find((x) => x.admin_user_id === adminUserId);
    if (row) hydrateForm(row);
  };

  const saveProfile = async () => {
    if (!targetAdminId) {
      toast.error("Select admin user");
      return;
    }
    setSaving(true);
    try {
      await adminApi("staff_profiles.upsert", {
        admin_user_id: targetAdminId,
        staff_kind: staffKind,
        messenger_panel_access: messengerPanelAccess,
        can_assign_roles: canAssignRoles,
        can_manage_verifications: canManageVerifications,
        can_review_reports: canReviewReports,
        timezone: timezone.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Staff profile updated");
      await load();
    } catch (e) {
      toast.error("Update failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async () => {
    if (!primaryTarget) {
      toast.error("Select owner admin");
      return;
    }
    if (!primaryReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSettingPrimary(true);
    try {
      await adminApi("owner.primary.set", {
        admin_user_id: primaryTarget,
        reason: primaryReason.trim(),
      });
      toast.success("Primary owner updated");
      setPrimaryReason("");
      await load();
    } catch (e) {
      toast.error("Failed to update primary owner", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSettingPrimary(false);
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Primary Owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current:{" "}
              {primaryOwner?.admin
                ? `${primaryOwner.admin.display_name || primaryOwner.admin.email} (${primaryOwner.admin.email})`
                : "not set"}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Owner admin</Label>
                <Select value={primaryTarget} onValueChange={setPrimaryTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {rows
                      .filter((r) => r.staff_kind === "owner")
                      .map((r) => (
                        <SelectItem key={r.admin_user_id} value={r.admin_user_id}>
                          {r.admin?.email || r.admin_user_id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={primaryReason}
                  onChange={(e) => setPrimaryReason(e.target.value)}
                  placeholder="Ownership transfer reason"
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={setPrimary} disabled={!canManage || settingPrimary}>
                  Set Primary Owner
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Messenger</TableHead>
                    <TableHead>Role Assign</TableHead>
                    <TableHead>Verifications</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.admin_user_id}>
                      <TableCell>
                        <div className="font-medium">{r.admin?.display_name || r.admin?.email || r.admin_user_id}</div>
                        <div className="text-xs text-muted-foreground">{r.admin?.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.staff_kind}</Badge>
                      </TableCell>
                      <TableCell>{r.messenger_panel_access ? "yes" : "no"}</TableCell>
                      <TableCell>{r.can_assign_roles ? "yes" : "no"}</TableCell>
                      <TableCell>{r.can_manage_verifications ? "yes" : "no"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => onSelectTarget(r.admin_user_id)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit Staff Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Admin user</Label>
                <Select value={targetAdminId} onValueChange={onSelectTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {rows.map((r) => (
                      <SelectItem key={r.admin_user_id} value={r.admin_user_id}>
                        {r.admin?.email || r.admin_user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Staff kind</Label>
                <Select value={staffKind} onValueChange={(v) => setStaffKind(v as StaffKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moderator">moderator</SelectItem>
                    <SelectItem value="administrator">administrator</SelectItem>
                    <SelectItem value="owner">owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Moscow" />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal profile notes" />
              </div>

              <div className="flex items-center justify-between rounded border p-3">
                <Label>Messenger panel access</Label>
                <Switch checked={messengerPanelAccess} onCheckedChange={(v) => setMessengerPanelAccess(Boolean(v))} />
              </div>
              <div className="flex items-center justify-between rounded border p-3">
                <Label>Can assign roles</Label>
                <Switch checked={canAssignRoles} onCheckedChange={(v) => setCanAssignRoles(Boolean(v))} />
              </div>
              <div className="flex items-center justify-between rounded border p-3">
                <Label>Can manage verifications</Label>
                <Switch checked={canManageVerifications} onCheckedChange={(v) => setCanManageVerifications(Boolean(v))} />
              </div>
              <div className="flex items-center justify-between rounded border p-3 md:col-span-3">
                <Label>Can review reports</Label>
                <Switch checked={canReviewReports} onCheckedChange={(v) => setCanReviewReports(Boolean(v))} />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <Button onClick={saveProfile} disabled={!canManage || saving}>
                  Save Staff Profile
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

