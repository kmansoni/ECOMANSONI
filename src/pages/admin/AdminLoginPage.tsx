import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { adminApi, AdminMe } from "@/lib/adminApi";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function AdminLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;

  const from = useMemo(() => location?.state?.from || "/admin", [location?.state?.from]);
  const notAdmin = Boolean(location?.state?.notAdmin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn(email.trim().toLowerCase(), password);
      if (res.error) {
        toast.error("Ошибка входа", { description: res.error.message });
        return;
      }

      // Verify admin access via admin-api
      const me = await adminApi<AdminMe>("me");
      if (!me) {
        toast.error("Нет доступа", { description: "Аккаунт не является админом" });
        await supabase.auth.signOut();
        return;
      }

      toast.success("Вход выполнен");
      navigate(from, { replace: true });
    } catch (err) {
      toast.error("Ошибка", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Console</CardTitle>
          <CardDescription>
            Вход для админов (email + password). Доступ проверяется через `admin_users`.
          </CardDescription>
          {notAdmin && (
            <div className="text-sm text-destructive">У аккаунта нет прав администратора.</div>
          )}
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Вход...
                </span>
              ) : (
                "Войти"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
