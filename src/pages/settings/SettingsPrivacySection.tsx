/**
 * src/pages/settings/SettingsPrivacySection.tsx
 * Screens: "privacy" | "privacy_blocked" | "security_sites" |
 *          "security_passcode" | "security_cloud_password" | "security_account_protection"
 *
 * All privacy sub-screens delegate to the existing PrivacySecurityCenter component.
 */
import { cn } from "@/lib/utils";
import { PrivacySecurityCenter } from "@/components/settings/PrivacySecurityCenter";
import { SettingsHeader } from "./helpers";
import type { SectionProps } from "./types";
// BlockedUsersPanel is inlined here to avoid circular imports
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Mail } from "lucide-react";
import { useRecoveryEmail } from "@/hooks/useRecoveryEmail";

type PrivacyScreen =
  | "privacy"
  | "privacy_blocked"
  | "security_sites"
  | "security_passcode"
  | "security_cloud_password"
  | "security_account_protection";

interface PrivacySectionProps extends SectionProps {
  currentScreen: PrivacyScreen;
}

interface BlockedUserRow {
  id: string;
  blocked_id: string;
  created_at: string;
}

interface BlockedProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function BlockedUsersPanel({ isDark }: { isDark: boolean }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BlockedUserRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, BlockedProfileRow>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("blocked_users")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as unknown as BlockedUserRow[];
      setRows(list);
      const ids = list.map((r) => r.blocked_id).filter(Boolean);
      if (ids.length) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", ids);
        const map: Record<string, BlockedProfileRow> = {};
        for (const p of (prof ?? []) as unknown as BlockedProfileRow[]) map[p.user_id] = p;
        setProfilesById(map);
      } else {
        setProfilesById({});
      }
    } catch (e) {
      toast({ title: "Заблокированные", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
      <div className="px-5 py-4">
        <p className="font-semibold">Список</p>
        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
          Заблокированные пользователи не смогут писать вам и видеть ваш профиль.
        </p>
      </div>
      {loading ? (
        <div className="px-5 pb-5">
          <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Никого нет в блок-листе.</p>
        </div>
      ) : (
        <div className="px-5 pb-5 grid gap-2">
          {rows.map((r) => {
            const p = profilesById[r.blocked_id];
            return (
              <div key={r.id} className={cn("flex items-center justify-between gap-3 p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                <div className="min-w-0">
                  <p className="font-medium truncate">{p?.display_name ?? r.blocked_id}</p>
                  <p className={cn("text-xs", isDark ? "text-white/50" : "text-white/60")}>
                    Заблокирован: {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const { error } = await supabase.from("blocked_users").delete().eq("id", r.id);
                      if (error) throw error;
                      toast({ title: "Готово", description: "Пользователь разблокирован." });
                      void load();
                    } catch (e) {
                      toast({ title: "Разблокировать", description: e instanceof Error ? e.message : String(e) });
                    }
                  }}
                >
                  Разблок.
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecoveryEmailPanel({ isDark }: { isDark: boolean }) {
  const {
    recoveryEmail,
    isLoading,
    codeSent,
    error,
    setRecoveryEmail,
    verifyCode,
    getRecoveryEmail,
    removeRecoveryEmail,
  } = useRecoveryEmail();

  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");

  useEffect(() => {
    void getRecoveryEmail();
  }, [getRecoveryEmail]);

  const handleSendCode = async () => {
    if (!emailInput.trim()) return;
    const ok = await setRecoveryEmail(emailInput.trim());
    if (ok) toast({ title: "Код отправлен", description: `Проверьте ${emailInput}` });
    else toast({ title: "Ошибка", description: error ?? "Не удалось отправить код", variant: "destructive" });
  };

  const handleVerify = async () => {
    if (!codeInput.trim()) return;
    const ok = await verifyCode(codeInput.trim());
    if (ok) {
      toast({ title: "Email подтверждён", description: "Recovery Email успешно привязан." });
      setCodeInput("");
    } else {
      toast({ title: "Ошибка", description: error ?? "Неверный код", variant: "destructive" });
    }
  };

  const handleRemove = async () => {
    await removeRecoveryEmail();
    setEmailInput("");
    setCodeInput("");
    toast({ title: "Удалено", description: "Recovery Email отвязан." });
  };

  return (
    <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <p className="font-semibold">Recovery Email</p>
          {recoveryEmail?.verified && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
        </div>
        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
          Резервный email для восстановления доступа к аккаунту.
        </p>
      </div>

      <div className="px-5 pb-5 grid gap-3">
        {recoveryEmail ? (
          <div className={cn("rounded-xl border px-3 py-2 flex items-center justify-between gap-2", isDark ? "border-white/10" : "border-white/20")}>
            <div>
              <p className="text-sm font-medium">{recoveryEmail.email}</p>
              <p className={cn("text-xs mt-0.5", recoveryEmail.verified ? "text-green-500" : isDark ? "text-white/50" : "text-white/60")}>
                {recoveryEmail.verified ? "✓ Подтверждён" : "Не подтверждён"}
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isLoading}>
              Удалить
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="your@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="flex-1 h-9 text-sm"
                disabled={isLoading}
              />
              <Button size="sm" onClick={handleSendCode} disabled={isLoading || !emailInput.trim()}>
                Отправить код
              </Button>
            </div>
            {codeSent && (
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-значный код"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="flex-1 h-9 text-sm tracking-widest"
                  disabled={isLoading}
                  maxLength={6}
                />
                <Button size="sm" onClick={handleVerify} disabled={isLoading || codeInput.length !== 6}>
                  Подтвердить
                </Button>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

export function SettingsPrivacySection({ isDark, currentScreen, onNavigate, onBack }: PrivacySectionProps) {
  const titles: Record<PrivacyScreen, string> = {
    privacy: "Конфиденциальность",
    privacy_blocked: "Заблокированные",
    security_sites: "Авторизованные сайты",
    security_passcode: "Код-пароль",
    security_cloud_password: "Облачный пароль",
    security_account_protection: "Защита аккаунта",
  };

  if (currentScreen === "privacy_blocked") {
    return (
      <>
        <SettingsHeader title={titles.privacy_blocked} isDark={isDark} currentScreen="privacy_blocked" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <BlockedUsersPanel isDark={isDark} />
          </div>
        </div>
      </>
    );
  }

  const modeMap: Record<PrivacyScreen, "privacy" | "sites" | "passcode" | "cloud_password" | "account_protection"> = {
    privacy: "privacy",
    security_sites: "sites",
    security_passcode: "passcode",
    security_cloud_password: "cloud_password",
    security_account_protection: "account_protection",
    privacy_blocked: "privacy", // fallback, handled above
  };

  return (
    <>
      <SettingsHeader title={titles[currentScreen]} isDark={isDark} currentScreen={currentScreen} onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <PrivacySecurityCenter
          mode={modeMap[currentScreen]}
          isDark={isDark}
          onOpenBlocked={currentScreen === "privacy" ? () => onNavigate("privacy_blocked") : undefined}
        />
        {currentScreen === "privacy" && (
          <div className="px-4 pb-4 mt-4">
            <RecoveryEmailPanel isDark={isDark} />
          </div>
        )}
      </div>
    </>
  );
}
