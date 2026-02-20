import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminMe } from "@/hooks/useAdminMe";
import { adminApi, hasScope, JitRequest } from "@/lib/adminApi";
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useJitRequests } from "@/hooks/useJitRequests";

type AdminRole = {
  id: string;
  name: string;
  display_name: string;
  category: string;
};

export function SecurityAdminJitPage() {
  const { me } = useAdminMe();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [reason, setReason] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [duration, setDuration] = useState("30");
  const [requesting, setRequesting] = useState(false);

  const { requests: jitRequests, refresh: refreshJit, loading: jitLoading } = useJitRequests(me);

  const canRequest = useMemo(() => hasScope(me, "security.jit.request"), [me]);

  const loadRoles = async () => {
    if (!canRequest) return;
    try {
      setRolesLoading(true);
      const data = await adminApi<AdminRole[]>("admin_roles.list");
      setRoles(data || []);
    } catch (e) {
      toast.error("Ошибка загрузки ролей", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, [canRequest]);

  const requestJit = async () => {
    if (!selectedRoleId || !reason.trim() || !ticketId.trim()) {
      toast.error("Заполните все поля");
      return;
    }

    try {
      setRequesting(true);
      const result = await adminApi<{ jit_request_id: string }>("jit.request", {
        role_id: selectedRoleId,
        reason,
        ticket_id: ticketId,
        duration_minutes: parseInt(duration, 10),
      });
      toast.success("JIT запрос отправлен", {
        description: `ID: ${result.jit_request_id.slice(0, 8)}... Ожидает одобрения Owner`,
      });
      setSelectedRoleId("");
      setReason("");
      setTicketId("");
      setDuration("30");
      await refreshJit();
    } catch (e) {
      toast.error("Ошибка создания JIT запроса", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRequesting(false);
    }
  };

  if (!canRequest) {
    return (
      <AdminShell>
        <Card>
          <CardHeader>
            <CardTitle>JIT Access Request</CardTitle>
            <CardDescription>Доступ только для Security Admin</CardDescription>
          </CardHeader>
          <CardContent>Forbidden</CardContent>
        </Card>
      </AdminShell>
    );
  }

  const myRequests = jitRequests.filter((jr) => jr.requested_by === me?.admin_user_id);
  const pendingRequests = myRequests.filter((jr) => jr.status === "pending");
  const activeRequests = myRequests.filter((jr) => jr.status === "active");

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Request JIT Access (Break-glass)</CardTitle>
            <CardDescription>
              Запросите временный доступ для инцидента. Требует одобрения Owner.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Роль</Label>
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles || []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.display_name || r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Причина</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Investigate security incident, debug production issue"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket">Ticket ID</Label>
                <Input
                  id="ticket"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="e.g., INC-12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={requestJit} disabled={requesting || rolesLoading}>
                {requesting ? "Отправка..." : "Запросить доступ"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
              <CardDescription>Ожидают одобрения Owner</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingRequests.map((jr) => (
                <div key={jr.id} className="border rounded-lg p-3 space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <span>{jr.role.display_name || jr.role.name}</span>
                    <Badge variant="secondary">Ожидание</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Причина: {jr.reason}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Ticket: {jr.ticket_id} • {jr.duration_minutes} мин
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Запрос: {new Date(jr.requested_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {activeRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Access</CardTitle>
              <CardDescription>Активные JIT сессии</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRequests.map((jr) => {
                const expiresAt = new Date(jr.expires_at!);
                const now = new Date();
                const minsLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60000));

                return (
                  <div key={jr.id} className="border rounded-lg p-3 space-y-2 bg-green-50 dark:bg-green-950">
                    <div className="font-medium flex items-center gap-2">
                      <span>{jr.role.display_name || jr.role.name}</span>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Ticket: {jr.ticket_id}
                    </div>
                    <div className="text-sm font-mono">
                      Expires in: <span className="font-bold">{minsLeft} min</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Approved: {new Date(jr.approved_at!).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>JIT Policy</CardTitle>
            <CardDescription>Правила и ограничения</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Запрос может создать только Security Admin</p>
            <p>• Одобрение требует role Owner</p>
            <p>• Максимальная длительность: 60 минут</p>
            <p>• Все действия логируются в SEV0 (SEV0 = critical security event)</p>
            <p>• Owner может отозвать доступ в любой момент</p>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
