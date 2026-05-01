import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Label } from "@/components/ui/label";
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

type Step = "phone" | "otp";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { from?: string; notAdmin?: boolean } | null;

  const from = useMemo(() => locState?.from ?? "/admin", [locState?.from]);
  const notAdmin = Boolean(locState?.notAdmin);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        maskedEmail?: string;
      }>("send-email-otp", {
        body: { phone: trimmed, admin_check: true },
      });

      if (error || !data?.ok) {
        let desc = "Проверьте номер телефона.";
        try {
          // FunctionsHttpError may expose body via .context
          const body = await (error as { context?: Response })?.context?.json?.();
          if (body?.message) desc = body.message;
        } catch { /* ignore */ }
        toast.error("Аккаунт не найден", { description: desc });
        return;
      }

      setMaskedEmail(data.maskedEmail ?? "");
      setStep("otp");
      toast.success("Код отправлен", { description: `На почту ${data.maskedEmail ?? ""} отправлен код подтверждения.` });
    } catch {
      toast.error("Ошибка", { description: "Не удалось отправить код. Попробуйте позже." });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.trim();
    if (!code) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        accessToken?: string;
        refreshToken?: string;
      }>("verify-email-otp", {
        body: { phone: phone.trim(), code },
      });

      if (error || !data?.ok || !data.accessToken || !data.refreshToken) {
        toast.error("Неверный код", { description: "Код недействителен или истёк. Попробуйте снова." });
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });
      if (sessionError) {
        toast.error("Ошибка сессии", { description: sessionError.message });
        return;
      }

      const me = await adminApi<AdminMe>("me");
      if (!me) {
        toast.error("Нет доступа", { description: "Аккаунт не является администратором." });
        await supabase.auth.signOut();
        return;
      }

      toast.success("Вход выполнен");
      navigate(from, { replace: true });
    } catch {
      toast.error("Ошибка", { description: "Не удалось подтвердить код. Попробуйте позже." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppPageShell centered aurora className="px-4 py-8">
      <div className="mx-auto w-full max-w-[420px]">
        <AppGlassCard>
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
            {step === "phone" ? (
              <p className="glass-muted mt-2 text-sm">
                Введите номер телефона. Система найдёт почту и отправит код подтверждения.
              </p>
            ) : (
              <p className="glass-muted mt-2 text-sm">
                Код отправлен на{" "}
                <span className="font-medium text-white/80">{maskedEmail}</span>.
                Введите его ниже.
              </p>
            )}
            {notAdmin && (
              <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                У аккаунта нет прав администратора.
              </div>
            )}
          </div>

          {step === "phone" ? (
            <form className="flex flex-col gap-4" onSubmit={handleSendOtp}>
              <div className="space-y-2">
                <Label htmlFor="phone" className="glass-muted text-xs uppercase tracking-[0.18em]">
                  Номер телефона
                </Label>
                <AppGlassInput
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="+7 999 000 00 00"
                />
              </div>

              <AppPrimaryButton type="submit" disabled={loading || !phone.trim()}>
                {loading ? (
                  <>
                    <SpinnerIcon active size={16} />
                    Отправка кода...
                  </>
                ) : (
                  "Получить код"
                )}
              </AppPrimaryButton>

              <div className="glass-muted flex items-center justify-center gap-2 text-xs">
                <VerifiedIcon active size={16} noAnimate tone="green" className="text-emerald-500" />
                Защищено end-to-end шифрованием
              </div>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleVerifyOtp}>
              <div className="space-y-2">
                <Label htmlFor="otp" className="glass-muted text-xs uppercase tracking-[0.18em]">
                  Код из письма
                </Label>
                <AppGlassInput
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoComplete="one-time-code"
                  placeholder="000 000"
                />
              </div>

              <AppPrimaryButton type="submit" disabled={loading || otp.trim().length !== 6}>
                {loading ? (
                  <>
                    <SpinnerIcon active size={16} />
                    Проверка кода...
                  </>
                ) : (
                  "Войти"
                )}
              </AppPrimaryButton>

              <button
                type="button"
                className="glass-muted text-xs text-center hover:text-white/70 transition-colors"
                onClick={() => { setStep("phone"); setOtp(""); }}
              >
                ← Изменить номер телефона
              </button>
            </form>
          )}
        </AppGlassCard>
      </div>
    </AppPageShell>
  );
}
