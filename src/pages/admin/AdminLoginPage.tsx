import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { adminApi, AdminMe } from "@/lib/adminApi";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { SpinnerIcon, VerifiedIcon } from "@/components/ui/app-icons";
import {
  AppPageShell,
  AppGlassCard,
  AppGlassInput,
  AppPrimaryButton,
} from "@/components/ui/app-shell";

export function AdminLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { from?: string; notAdmin?: boolean } | null;

  const from = useMemo(() => locState?.from ?? "/admin", [locState?.from]);
  const notAdmin = Boolean(locState?.notAdmin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn(email.trim().toLowerCase(), password);
      if (res.error) {
        toast.error("Ошибка входа", { description: "Проверьте email и пароль." });
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
      toast.error("Ошибка", { description: "Не удалось выполнить вход. Попробуйте позже." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppPageShell centered aurora className="px-4 py-8">
      <div className="mx-auto w-full max-w-[420px]">
        <AppGlassCard>
          {/* Brand header — как у AuthPage */}
          <div className="flex items-center justify-center mb-5 sm:mb-6">
            <div
              className="flex items-center gap-3 text-[13px] tracking-[0.42em] uppercase opacity-70"
              style={{ fontFeatureSettings: '"ss01"' }}
            >
              <span aria-hidden className="relative inline-block h-1.5 w-1.5 rounded-full bg-current">
                <span className="absolute inset-0 rounded-full blur-[5px] opacity-60 bg-indigo-400" />
              </span>
              <span className="font-medium">mansoni · admin</span>
              <span aria-hidden className="relative inline-block h-1.5 w-1.5 rounded-full bg-current">
                <span className="absolute inset-0 rounded-full blur-[5px] opacity-60 bg-fuchsia-400" />
              </span>
            </div>
          </div>

          <div className="mb-5 sm:mb-6">
            <h1 className="glass-title text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight">
              Admin Console
            </h1>
            <p className="glass-muted mt-2 text-sm">
              Вход для администраторов по email и паролю. Доступ проверяется через{" "}
              <span className="font-mono text-[12.5px]">admin_users</span>.
            </p>
            {notAdmin && (
              <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                У аккаунта нет прав администратора.
              </div>
            )}
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <Label htmlFor="email" className="glass-muted text-xs uppercase tracking-[0.18em]">
                Email
              </Label>
              <AppGlassInput
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="glass-muted text-xs uppercase tracking-[0.18em]">
                Password
              </Label>
              <AppGlassInput
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <AppPrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <SpinnerIcon active size={16} />
                  Вход...
                </>
              ) : (
                "Войти"
              )}
            </AppPrimaryButton>

            <div className="glass-muted flex items-center justify-center gap-2 text-xs">
              <VerifiedIcon active size={16} noAnimate tone="green" className="text-emerald-500" />
              Защищено end-to-end шифрованием
            </div>
          </form>
        </AppGlassCard>
      </div>
    </AppPageShell>
  );
}
