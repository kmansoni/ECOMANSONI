/**
 * src/pages/settings/SettingsSecuritySection.tsx
 * Screens: "security" | "security_sites" | "security_passcode"
 *         | "security_cloud_password" | "security_account_protection"
 *         | "security_sessions" | "security_2fa"
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Globe, Key, Mail, Shield, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn, getErrorMessage } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useUserSessions } from "@/hooks/useUserSessions";
import { supabase } from "@/integrations/supabase/client";
import { revokeOtherSessions, revokeSessionById } from "@/lib/sessions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PrivacySecurityCenter } from "@/components/settings/PrivacySecurityCenter";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { Screen, SectionProps } from "./types";

type MfaFactor = {
  id: string;
  status?: string;
  factor_type?: string;
};

type MfaEnrollData = {
  id: string;
  totp?: { qr_code?: string | null; uri?: string | null };
};

type SupabaseAuthLike = {
  getSession: () => Promise<{ data?: { session?: unknown } }>;
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<{ error?: unknown }>;
  mfa: {
    listFactors: () => Promise<{ data?: { all?: MfaFactor[] }; error?: unknown }>;
    enroll: (options: { factorType: "totp" }) => Promise<{ data?: MfaEnrollData; error?: unknown }>;
    challenge: (options: { factorId: string }) => Promise<{ data?: { id?: string }; error?: unknown }>;
    verify: (options: { factorId: string; challengeId?: string | null; code: string }) => Promise<{ error?: unknown }>;
    unenroll: (options: { factorId: string }) => Promise<{ error?: unknown }>;
  };
};

export interface SettingsSecurityProps extends SectionProps {
  currentScreen: Screen;
}

export function SettingsSecuritySection({
  isDark,
  onNavigate,
  onBack,
  currentScreen,
}: SettingsSecurityProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const { rows: deviceSessions, loading: deviceSessionsLoading, refetch: refetchDeviceSessions } = useUserSessions();

  const isAuthed = !!user?.id;
  const authClient = supabase.auth as unknown as SupabaseAuthLike;

  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaEnroll, setMfaEnroll] = useState<MfaEnrollData | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);

  const mfaQrImageSrc = useMemo(() => {
    const qr = mfaEnroll?.totp?.qr_code;
    if (!qr || typeof qr !== "string") return null;
    if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(qr)) return qr;
    const trimmed = qr.trim();
    if (trimmed.startsWith("<svg") && trimmed.endsWith("</svg>")) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
    }
    return null;
  }, [mfaEnroll?.totp?.qr_code]);

  const loadMfaState = useCallback(async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await authClient.mfa.listFactors();
      if (error) throw error;
      setMfaFactors([...(data?.all ?? [])]);
    } catch (e) {
      toast({ title: "2FA", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setMfaLoading(false);
    }
  }, [authClient]);

  useEffect(() => {
    if (!isAuthed || currentScreen !== "security_2fa") return;
    void loadMfaState();
  }, [currentScreen, isAuthed, loadMfaState]);

  const iconCls = cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground");
  const cardCls = cn(
    "backdrop-blur-xl rounded-2xl border overflow-hidden",
    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
  );
  const hintCls = cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70");

  // ── security (menu) ──────────────────────────────────────────────────
  if (currentScreen === "security") {
    return (
      <>
        <SettingsHeader title="Безопасность" isDark={isDark} currentScreen="security" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll">
          <div className={cn("mx-4", cardCls)}>
            <SettingsMenuItem icon={<Key className={iconCls} />} label="Код-пароль" isDark={isDark} onClick={() => onNavigate("security_passcode")} />
            <SettingsMenuItem icon={<Shield className={iconCls} />} label="Облачный пароль" isDark={isDark} onClick={() => onNavigate("security_cloud_password")} />
            <SettingsMenuItem icon={<Shield className={iconCls} />} label="Защита аккаунта" isDark={isDark} onClick={() => onNavigate("security_account_protection")} />
            <SettingsMenuItem icon={<Shield className={iconCls} />} label="Двухэтапная аутентификация" isDark={isDark} onClick={() => onNavigate("security_2fa")} />
          </div>
          <div className={cn("mx-4 mt-3", cardCls)}>
            <SettingsMenuItem icon={<Smartphone className={iconCls} />} label="Активные сеансы" isDark={isDark} onClick={() => onNavigate("security_sessions")} />
            <SettingsMenuItem icon={<Globe className={iconCls} />} label="Сайты" isDark={isDark} onClick={() => onNavigate("security_sites")} />
            <SettingsMenuItem icon={<Mail className={iconCls} />} label="Письма от нас" isDark={isDark} onClick={() => onNavigate("notifications")} />
            <SettingsMenuItem icon={<Database className={iconCls} />} label="Данные аккаунта" isDark={isDark} onClick={() => navigate("/profile")} />
          </div>
        </div>
      </>
    );
  }

  // ── security_sites ──────────────────────────────────────────────────
  if (currentScreen === "security_sites") {
    return (
      <>
        <SettingsHeader title="Сайты" isDark={isDark} currentScreen="security_sites" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <PrivacySecurityCenter mode="sites" isDark={isDark} />
        </div>
      </>
    );
  }

  // ── security_passcode ───────────────────────────────────────────────
  if (currentScreen === "security_passcode") {
    return (
      <>
        <SettingsHeader title="Код-пароль" isDark={isDark} currentScreen="security_passcode" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <PrivacySecurityCenter mode="passcode" isDark={isDark} />
        </div>
      </>
    );
  }

  // ── security_cloud_password ─────────────────────────────────────────
  if (currentScreen === "security_cloud_password") {
    return (
      <>
        <SettingsHeader title="Облачный пароль" isDark={isDark} currentScreen="security_cloud_password" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <PrivacySecurityCenter mode="cloud_password" isDark={isDark} />
        </div>
      </>
    );
  }

  // ── security_account_protection ─────────────────────────────────────
  if (currentScreen === "security_account_protection") {
    return (
      <>
        <SettingsHeader title="Защита аккаунта" isDark={isDark} currentScreen="security_account_protection" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <PrivacySecurityCenter mode="account_protection" isDark={isDark} />
        </div>
      </>
    );
  }

  // ── security_sessions ───────────────────────────────────────────────
  if (currentScreen === "security_sessions") {
    return (
      <>
        <SettingsHeader title="Активные сеансы" isDark={isDark} currentScreen="security_sessions" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <div className={cardCls}>
              <div className="px-5 py-4">
                <p className="font-semibold">Это устройство</p>
                <p className={hintCls}>{navigator.userAgent}</p>
              </div>
            </div>

            <div className={cn(cardCls, "mt-3")}>
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Завершить другие сеансы</p>
                  <p className={hintCls}>Выйдет со всех других устройств. Это устройство останется.</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      if (!user?.id) return;
                      const { data } = await authClient.getSession();
                      if (!data?.session) return;
                      await revokeOtherSessions({ userId: user.id, session: data.session });
                      const { error } = await authClient.signOut({ scope: "others" });
                      if (error) throw error;
                      toast({ title: "Готово", description: "Другие сеансы завершены." });
                      await refetchDeviceSessions();
                    } catch (e) {
                      toast({ title: "Сеансы", description: getErrorMessage(e) });
                    }
                  }}
                >
                  Выйти
                </Button>
              </div>

              <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                <p className="font-semibold">Автоматически завершать сеансы</p>
                <p className={hintCls}>Если сеанс неактивен</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([7, 30, 90, 180] as const).map((days) => (
                    <Button
                      key={days}
                      variant="secondary"
                      onClick={async () => {
                        if (!isAuthed) return;
                        await updateSettings({ sessions_auto_terminate_days: days });
                        toast({ title: "Готово", description: "Настройка сохранена." });
                      }}
                      className={cn(
                        (settings?.sessions_auto_terminate_days ?? 180) === days &&
                          (isDark ? "bg-white/20" : "bg-white/20"),
                      )}
                    >
                      {days === 7 ? "1 нед." : days === 30 ? "1 месяц" : days === 90 ? "3 месяца" : "6 месяцев"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className={cn(cardCls, "mt-3")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Активные сеансы</p>
              </div>

              {deviceSessionsLoading ? (
                <div className="px-5 pb-5">
                  <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                </div>
              ) : deviceSessions.length === 0 ? (
                <div className="px-5 pb-5">
                  <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Нет данных.</p>
                </div>
              ) : (
                <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                  {deviceSessions.map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "px-5 py-4 flex items-center justify-between gap-3",
                        isDark ? "hover:bg-white/5" : "hover:bg-muted/30",
                        "border-b",
                        isDark ? "border-white/10" : "border-white/20",
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                          {s.device_name || "Устройство"}
                        </p>
                        <p className={cn("text-xs mt-1 truncate", isDark ? "text-white/60" : "text-white/70")}>
                          {s.user_agent || ""}
                        </p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/50" : "text-white/70")}>
                          Последняя активность: {new Date(s.last_seen_at).toLocaleString("ru-RU")}
                        </p>
                      </div>
                      {!s.revoked_at ? (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            if (!user?.id) return;
                            await revokeSessionById({ userId: user.id, sessionId: s.id });
                            await refetchDeviceSessions();
                          }}
                        >
                          Завершить
                        </Button>
                      ) : (
                        <span className={cn("text-xs", isDark ? "text-white/50" : "text-white/70")}>Завершён</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── security_2fa ────────────────────────────────────────────────────
  const verifiedFactors = mfaFactors.filter((f) => f.status === "verified");
  const totpFactor = verifiedFactors.find((f) => f.factor_type === "totp") ?? null;

  return (
    <>
      <SettingsHeader title="Двухфакторная аутентификация" isDark={isDark} currentScreen="security_2fa" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div className="px-4">
          <div className={cardCls}>
            <div className="px-5 py-4">
              <p className="font-semibold">Статус</p>
              <p className={hintCls}>
                {mfaLoading ? "Загрузка…" : totpFactor ? "Включено (TOTP)" : "Не включено"}
              </p>
            </div>
          </div>

          {!totpFactor && !mfaEnroll ? (
            <div className={cn(cardCls, "mt-3")}>
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Включить 2FA (TOTP)</p>
                  <p className={hintCls}>Используйте Google Authenticator / 1Password / Authy.</p>
                </div>
                <Button
                  onClick={async () => {
                    setMfaLoading(true);
                    try {
                      const { data, error } = await authClient.mfa.enroll({ factorType: "totp" });
                      if (error) throw error;
                      setMfaEnroll(data);
                      setMfaCode("");
                      setMfaChallengeId(null);
                    } catch (e) {
                      toast({ title: "2FA", description: e instanceof Error ? e.message : String(e) });
                    } finally {
                      setMfaLoading(false);
                    }
                  }}
                  disabled={mfaLoading}
                >
                  Включить
                </Button>
              </div>
            </div>
          ) : null}

          {mfaEnroll ? (
            <div className={cn(cardCls, "mt-3")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Шаг 1. Сканируйте QR</p>
                <p className={hintCls}>Сканируйте QR код в приложении‑аутентификаторе.</p>

                <div className="mt-4 flex items-center justify-center">
                  {mfaEnroll.totp?.qr_code ? (
                    mfaQrImageSrc ? (
                      <img
                        src={mfaQrImageSrc}
                        alt="2FA QR"
                        className={cn("rounded-xl border p-3 bg-white", isDark ? "border-white/10" : "border-white/20")}
                      />
                    ) : (
                      <div className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                        QR недоступен в безопасном формате. Используйте URI ниже.
                      </div>
                    )
                  ) : (
                    <div className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                      QR недоступен. Используйте URI ниже.
                    </div>
                  )}
                </div>

                {mfaEnroll.totp?.uri ? (
                  <div
                    className={cn(
                      "mt-4 p-3 rounded-xl border text-xs break-all",
                      isDark ? "border-white/10 text-white/70" : "border-white/20 text-white/80",
                    )}
                  >
                    {mfaEnroll.totp.uri}
                  </div>
                ) : null}

                <div className="mt-6">
                  <p className="font-semibold">Шаг 2. Введите код</p>
                  <p className={hintCls}>Введите 6‑значный код из приложения.</p>

                  <div className="mt-3 flex items-center justify-center">
                    <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={async () => {
                        if (!mfaEnroll?.id) return;
                        if (mfaCode.trim().length !== 6) {
                          toast({ title: "2FA", description: "Введите 6‑значный код." });
                          return;
                        }
                        setMfaLoading(true);
                        try {
                          const { data: challenge, error: chErr } = await authClient.mfa.challenge({
                            factorId: mfaEnroll.id,
                          });
                          if (chErr) throw chErr;
                          const challengeId = challenge?.id;
                          setMfaChallengeId(challengeId);
                          const { error: vErr } = await authClient.mfa.verify({
                            factorId: mfaEnroll.id,
                            challengeId,
                            code: mfaCode,
                          });
                          if (vErr) throw vErr;
                          toast({ title: "2FA", description: "2FA включена." });
                          setMfaEnroll(null);
                          setMfaCode("");
                          setMfaChallengeId(null);
                          await loadMfaState();
                        } catch (e) {
                          toast({ title: "2FA", description: e instanceof Error ? e.message : String(e) });
                        } finally {
                          setMfaLoading(false);
                        }
                      }}
                      disabled={mfaLoading}
                    >
                      Подтвердить
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMfaEnroll(null);
                        setMfaCode("");
                        setMfaChallengeId(null);
                      }}
                      disabled={mfaLoading}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {totpFactor ? (
            <div className={cn(cardCls, "mt-3")}>
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Отключить 2FA</p>
                  <p className={hintCls}>Удалит фактор TOTP и вернёт вход только по паролю/OTP.</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    setMfaLoading(true);
                    try {
                      const { error } = await authClient.mfa.unenroll({ factorId: totpFactor.id });
                      if (error) throw error;
                      toast({ title: "2FA", description: "2FA отключена." });
                      await loadMfaState();
                    } catch (e) {
                      toast({ title: "2FA", description: e instanceof Error ? e.message : String(e) });
                    } finally {
                      setMfaLoading(false);
                    }
                  }}
                  disabled={mfaLoading}
                >
                  Отключить
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
