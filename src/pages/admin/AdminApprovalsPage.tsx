import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ApprovalRow = {
  id: string;
  operation_type: string;
  operation_description: string;
  requested_by: string;
  requested_at: string;
  required_approvers: number;
  approver_roles: string[] | null;
  status: string;
  expires_at: string;
  executed_at: string | null;
};

export function AdminApprovalsPage() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [operationType, setOperationType] = useState("iam.role.assign");
  const [description, setDescription] = useState("High-risk operation approval");
  const [payloadJson, setPayloadJson] = useState('{"admin_user_id":"","role_name":""}');
  const [reason, setReason] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [approverRoles, setApproverRoles] = useState("owner");
  const [decisionReason, setDecisionReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi<ApprovalRow[]>("approvals.list", { limit: 100 });
      setRows(data ?? []);
    } catch (e) {
      toast.error("Failed to load approvals", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const requestApproval = async () => {
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadJson) as Record<string, unknown>;
    } catch {
      toast.error("operation_payload must be valid JSON");
      return;
    }

    setSubmitting(true);
    try {
      await adminApi("approvals.request", {
        operation_type: operationType.trim(),
        operation_description: description.trim(),
        operation_payload: payload,
        request_reason: reason.trim(),
        ticket_id: ticketId.trim() || undefined,
        required_approvers: 1,
        approver_roles: approverRoles
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      toast.success("Approval request created");
      setReason("");
      setTicketId("");
      await load();
    } catch (e) {
      toast.error("Request failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (approvalId: string, decision: "approved" | "denied") => {
    try {
      await adminApi("approvals.decide", {
        approval_id: approvalId,
        decision,
        reason: decisionReason.trim() || undefined,
      });
      toast.success("Decision saved");
      await load();
    } catch (e) {
      toast.error("Decision failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Request Approval</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>operation_type</Label>
              <Input value={operationType} onChange={(e) => setOperationType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>operation_payload (JSON)</Label>
              <Input value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>approver_roles (comma-separated)</Label>
              <Input value={approverRoles} onChange={(e) => setApproverRoles(e.target.value)} placeholder="owner,security_admin" />
            </div>
            <div className="space-y-2">
              <Label>reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>ticket_id</Label>
              <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="SUP-123" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={requestApproval} disabled={submitting}>Create Request</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Decision reason (optional)</Label>
              <Input
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="Applied policy / ticket evidence"
              />
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[360px] truncate" title={r.operation_description}>
                        {r.operation_type}
                        <div className="text-xs text-muted-foreground truncate">{r.operation_description}</div>
                      </TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{new Date(r.requested_at).toLocaleString()}</TableCell>
                      <TableCell>{new Date(r.expires_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {r.status === "pending" ? (
                          <div className="inline-flex gap-2">
                            <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(r.id, "denied")}>Deny</Button>
                          </div>
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

