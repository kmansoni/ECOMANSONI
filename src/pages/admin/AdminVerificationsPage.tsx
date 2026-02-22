import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type VerificationType = "owner" | "verified" | "professional" | "business";

type VerificationRow = {
  id: string;
  user_id: string;
  verification_type: VerificationType;
  is_active: boolean;
  verified_at: string | null;
  verified_by_admin_id: string | null;
  revoked_at: string | null;
  revoked_by_admin_id: string | null;
  reason: string | null;
  ticket_id: string | null;
};

const VERIFICATION_TYPES: VerificationType[] = ["owner", "verified", "professional", "business"];

export function AdminVerificationsPage() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filterUserId, setFilterUserId] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [targetUserId, setTargetUserId] = useState("");
  const [targetType, setTargetType] = useState<VerificationType>("verified");
  const [reason, setReason] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [approvalId, setApprovalId] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<VerificationRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeTicketId, setRevokeTicketId] = useState("");
  const [revokeApprovalId, setRevokeApprovalId] = useState("");

  const ownerTargetSummary = useMemo(() => `${targetUserId.trim()}:owner`, [targetUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi<VerificationRow[]>("verifications.list", {
        limit: 200,
        user_id: filterUserId || undefined,
        verification_type: filterType === "all" ? undefined : filterType,
        is_active: filterStatus === "all" ? undefined : filterStatus === "active",
      });
      setRows(data ?? []);
    } catch (e) {
      toast.error("Failed to load verifications", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const requestOwnerApproval = async (operation: "verification.grant" | "verification.revoke", userId: string) => {
    if (!userId.trim()) {
      toast.error("user_id is required");
      return;
    }
    if (!reason.trim() && operation === "verification.grant") {
      toast.error("reason is required");
      return;
    }
    const reqReason = operation === "verification.grant" ? reason.trim() : revokeReason.trim();
    const reqTicket = operation === "verification.grant" ? ticketId.trim() : revokeTicketId.trim();
    try {
      const resp = await adminApi<{ id: string; status: string; requested_at: string }>("approvals.request", {
        operation_type: operation,
        operation_description: `Owner verification ${operation.endsWith("grant") ? "grant" : "revoke"}: ${userId}`,
        operation_payload: {
          user_id: userId,
          verification_type: "owner",
        },
        request_reason: reqReason || "Owner verification change",
        ticket_id: reqTicket || undefined,
        required_approvers: 1,
        approver_roles: ["owner"],
      });
      toast.success("Approval request created", { description: `approval_id: ${resp.id}` });
      if (operation === "verification.grant") {
        setApprovalId(resp.id);
      } else {
        setRevokeApprovalId(resp.id);
      }
    } catch (e) {
      toast.error("Failed to request approval", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const grant = async () => {
    if (!targetUserId.trim() || !reason.trim()) {
      toast.error("Fill user_id and reason");
      return;
    }
    if (targetType === "owner" && !approvalId.trim()) {
      toast.error("owner verification requires approval_id");
      return;
    }
    setSubmitting(true);
    try {
      await adminApi("verifications.grant", {
        user_id: targetUserId.trim(),
        verification_type: targetType,
        reason: reason.trim(),
        ticket_id: ticketId.trim() || undefined,
        approval_id: targetType === "owner" ? approvalId.trim() : undefined,
      });
      toast.success("Verification granted");
      setReason("");
      setTicketId("");
      setApprovalId("");
      await load();
    } catch (e) {
      toast.error("Grant failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    if (!revokeReason.trim()) {
      toast.error("reason is required for revoke");
      return;
    }
    if (revokeTarget.verification_type === "owner" && !revokeApprovalId.trim()) {
      toast.error("owner verification revoke requires approval_id");
      return;
    }

    try {
      await adminApi("verifications.revoke", {
        user_id: revokeTarget.user_id,
        verification_type: revokeTarget.verification_type,
        reason: revokeReason.trim(),
        ticket_id: revokeTicketId.trim() || undefined,
        approval_id: revokeTarget.verification_type === "owner" ? revokeApprovalId.trim() : undefined,
      });
      toast.success("Verification revoked");
      setRevokeTarget(null);
      setRevokeReason("");
      setRevokeTicketId("");
      setRevokeApprovalId("");
      await load();
    } catch (e) {
      toast.error("Revoke failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Grant Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="UUID" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={targetType} onValueChange={(v) => setTargetType(v as VerificationType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERIFICATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-reason">Reason</Label>
                <Input id="grant-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
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
                  placeholder={targetType === "owner" ? "required" : "optional"}
                />
              </div>

              {targetType === "owner" ? (
                <div className="md:col-span-5 flex items-center justify-between gap-3 rounded border p-3">
                  <div className="text-sm text-muted-foreground">
                    Owner verification target: {ownerTargetSummary}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => requestOwnerApproval("verification.grant", targetUserId.trim())}
                  >
                    Request owner approval
                  </Button>
                </div>
              ) : null}

              <div className="md:col-span-5 flex justify-end">
                <Button onClick={grant} disabled={submitting}>Grant</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification Registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Filter user_id</Label>
                <Input value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} placeholder="UUID" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    {VERIFICATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="revoked">revoked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => void load()}>Refresh</Button>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Verified At</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[260px] truncate" title={r.user_id}>{r.user_id}</TableCell>
                      <TableCell>{r.verification_type}</TableCell>
                      <TableCell>{r.is_active ? <Badge>active</Badge> : <Badge variant="outline">revoked</Badge>}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={r.reason || ""}>{r.reason || "-"}</TableCell>
                      <TableCell>{r.verified_at ? new Date(r.verified_at).toLocaleString() : "-"}</TableCell>
                      <TableCell className="text-right">
                        {r.is_active ? (
                          <Button size="sm" variant="outline" onClick={() => setRevokeTarget(r)}>Prepare Revoke</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {revokeTarget ? (
          <Card>
            <CardHeader>
              <CardTitle>Revoke Verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Target: {revokeTarget.user_id}:{revokeTarget.verification_type}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="revoke-reason">Reason</Label>
                  <Input
                    id="revoke-reason"
                    data-testid="revoke-reason-input"
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
                  <Input
                    value={revokeApprovalId}
                    onChange={(e) => setRevokeApprovalId(e.target.value)}
                    placeholder={revokeTarget.verification_type === "owner" ? "required" : "optional"}
                  />
                </div>
              </div>

              {revokeTarget.verification_type === "owner" ? (
                <div className="flex justify-between rounded border p-3">
                  <div className="text-sm text-muted-foreground">Owner verification revoke requires approval</div>
                  <Button
                    data-testid="request-owner-revoke-approval"
                    variant="outline"
                    onClick={() => requestOwnerApproval("verification.revoke", revokeTarget.user_id)}
                  >
                    Request owner approval
                  </Button>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
                <Button variant="destructive" onClick={revoke}>Revoke</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
