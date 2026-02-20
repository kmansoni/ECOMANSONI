import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminMe } from "@/hooks/useAdminMe";

export function AdminHomePage() {
  const { me } = useAdminMe();

  return (
    <AdminShell>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Профиль админа</CardTitle>
            <CardDescription>Кто вы и какие роли/скоупы активны</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">{me?.display_name}</div>
            <div className="text-sm text-muted-foreground">{me?.email}</div>
            <div className="pt-2 text-xs text-muted-foreground">Роли</div>
            <div className="text-sm">
              {(me?.roles ?? []).map((r) => r.display_name).join(", ") || "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Безопасность</CardTitle>
            <CardDescription>Серверная проверка прав + аудит действий</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Все операции выполняются через Edge Function `admin-api`.</div>
            <div>Аудит пишется через `admin_audit_append` (hash-chain).</div>
            <div className="text-muted-foreground text-xs">UI не имеет service role ключей.</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Scopes</CardTitle>
          <CardDescription>Список доступных scopes (для отладки)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1 text-sm">
            {(me?.scopes ?? []).length === 0 ? "—" : (me?.scopes ?? []).map((s) => <div key={s}>{s}</div>)}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
