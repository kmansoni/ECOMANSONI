import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminMe } from "@/hooks/useAdminMe";
import { adminApi, isOwner, KillSwitchRow, JitRequest } from "@/lib/adminApi";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useJitRequests } from "@/hooks/useJitRequests";

export function OwnerConsolePage() {
  const { me } = useAdminMe();
  const [killSwitches, setKillSwitches] = useState<KillSwitchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const { requests: jitRequests, refresh: refreshJit, loading: jitLoading } = useJitRequests(me);

  const canSee = useMemo(() => isOwner(me), [me]);

  const load = async () => {
    if (!canSee) return;
    setLoading(true);
    try {
      const data = await adminApi<KillSwitchRow[]>("killswitch.list");
      setKillSwitches(data);
    } catch (e) {
      toast.error("Не удалось загрузить kill-switch", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canSee]);

  const setSwitch = async (key: string, enabled: boolean) => {
    if (!reason.trim()) {
      toast.error("Укажите причину (reason)");
      return;
    }

    try {
      await adminApi("killswitch.set", { key, enabled, reason });
      toast.success(enabled ? `Включено: ${key}` : `Выключено: ${key}`);
      setReason("");
      await load();
    } catch (e) {
      toast.error("Ошибка", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const approveJit = async (jitRequestId: string) => {
    try {
      const result = await adminApi<{ jit_request_id: string; expires_at: string }>("jit.approve", {
        jit_request_id: jitRequestId,
      });
      toast.success("JIT одобрено", {
        description: `Доступ истечёт: ${new Date(result.expires_at).toLocaleString()}`,
      });
      await refreshJit();
    } catch (e) {
      toast.error("Ошибка одобрения JIT", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const revokeJit = async (jitRequestId: string) => {
    try {
      await adminApi("jit.revoke", { jit_request_id: jitRequestId });
      toast.success("JIT отозвано");
      await refreshJit();
    } catch (e) {
      toast.error("Ошибка отзыва JIT", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <AdminShell>
      {!isOwner(me) ? (
        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
            <CardDescription>Доступ только для роли owner</CardDescription>
          </CardHeader>
          <CardContent>Forbidden</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Kill Switches</CardTitle>
              <CardDescription>
                Серверная блокировка опасных операций. Работает даже если UI скомпрометирован.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Причина (обязательно)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Incident #123, mitigation..." />
              </div>

              {loading ? (
                <div className="text-sm text-muted-foreground">Загрузка...</div>
              ) : (
                <div className="space-y-3">
                  {killSwitches.map((ks) => (
                    <div key={ks.key} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ks.key}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {ks.reason || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          updated: {new Date(ks.updated_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={ks.enabled} onCheckedChange={(v) => setSwitch(ks.key, Boolean(v))} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void load()}
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>JIT Escalation Requests</CardTitle>
              <CardDescription>Break-glass запросы от Security Admin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {jitLoading ? (
                <div className="text-sm text-muted-foreground">Загрузка...</div>
              ) : jitRequests.length === 0 ? (
                <div className="text-sm text-muted-foreground">Нет активных запросов</div>
              ) : (
                <div className="space-y-3">
                  {jitRequests.map((jr) => (
                    <div key={jr.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            <span>{jr.requester.display_name || jr.requester.email}</span>
                            <Badge variant={jr.status === "active" ? "default" : jr.status === "pending" ? "secondary" : "outline"}>
                              {jr.status === "pending" ? "Ожидание" : jr.status === "active" ? "Активна" : jr.status === "revoked" ? "Отозвана" : "Истекла"}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Роль: {jr.role.display_name || jr.role.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Причина: {jr.reason}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Ticket: {jr.ticket_id} • {jr.duration_minutes} мин
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Запрос: {new Date(jr.requested_at).toLocaleString()}</div>
                          {jr.approved_at && <div>Одобрено: {new Date(jr.approved_at).toLocaleString()}</div>}
                          {jr.expires_at && <div>Истечение: {new Date(jr.expires_at).toLocaleString()}</div>}
                        </div>
                      </div>

                      {jr.status === "pending" && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => approveJit(jr.id)}
                          >
                            Одобрить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeJit(jr.id)}
                          >
                            Отклонить
                          </Button>
                        </div>
                      )}

                      {jr.status === "active" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeJit(jr.id)}
                        >
                          Отозвать доступ
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Admin Directory</CardTitle>
                <CardDescription>Назначение/удаление админов через IAM раздел</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Owner управляет админ-контуром и безопасностью, без доступа к пользовательским данным по умолчанию.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Center</CardTitle>
                <CardDescription>SEV0 аудит + approvals + incident mode</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Все действия логируются с hash-chain tamper detection. JIT escalation требует одобрения Owner.
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
