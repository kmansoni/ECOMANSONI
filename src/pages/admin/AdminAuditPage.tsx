import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type AuditRow = {
  id: string;
  sequence_number: number;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  severity: string;
  status: string;
  reason_code: string | null;
  ticket_id: string | null;
  request_id: string;
};

export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [actorId, setActorId] = useState("");

  const load = useCallback(async (filters?: { resourceType?: string; resourceId?: string; actorId?: string }) => {
    setLoading(true);
    try {
      const nextResourceType = filters?.resourceType ?? "";
      const nextResourceId = filters?.resourceId ?? "";
      const nextActorId = filters?.actorId ?? "";

      const data = await adminApi<AuditRow[]>("audit.search", {
        limit: 100,
        resource_type: nextResourceType || undefined,
        resource_id: nextResourceId || undefined,
        actor_id: nextActorId || undefined,
      });
      setRows(data);
    } catch (e) {
      toast.error("Не удалось загрузить аудит", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Admin Audit Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label>resource_type</Label>
              <Input value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="admin_user" />
            </div>
            <div className="space-y-2">
              <Label>resource_id</Label>
              <Input value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="id" />
            </div>
            <div className="space-y-2">
              <Label>actor_id</Label>
              <Input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="admin_user_id" />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() =>
                  void load({
                    resourceType,
                    resourceId,
                    actorId,
                  })
                }
              >
                Поиск
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Загрузка...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.sequence_number}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.actor_id ?? ""}>
                      {r.actor_type} {r.actor_id ? `(${r.actor_id})` : ""}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.action}>
                      {r.action}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={`${r.resource_type}:${r.resource_id ?? ""}`}>
                      {r.resource_type}:{r.resource_id ?? "—"}
                    </TableCell>
                    <TableCell>{r.severity}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
