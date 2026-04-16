import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Check, Loader2, LogOut, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsHeader } from "./helpers";
import type { SectionProps } from "./types";
import { useMultiAccount } from "@/contexts/MultiAccountContext";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type AddMode = "none" | "password" | "otp" | "otp-verify";

export function SettingsAccountsSection({ isDark, onBack }: SectionProps) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const {
    accounts,
    activeAccountId,
    switchAccount,
    isSwitchingAccount,
    addAccountWithPassword,
    startAddAccountEmailOtp,
    verifyAddAccountEmailOtp,
  } = useMultiAccount();

  const [addMode, setAddMode] = useState<AddMode>("none");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const handleSwitch = async (accountId: string) => {
    if (accountId === activeAccountId || isSwitchingAccount) return;
    try {
      await switchAccount(accountId);
      toast.success("Аккаунт переключён");
    } catch {
      toast.error("Не удалось переключить аккаунт");
    }
  };

  const handleAddWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = addEmail.trim().toLowerCase();
    if (!trimmedEmail || !addPassword) {
      toast.error("Заполните email и пароль");
      return;
    }
    setAddLoading(true);
    try {
      const { error } = await addAccountWithPassword(trimmedEmail, addPassword);
      if (error) throw error;
      toast.success("Аккаунт добавлен");
      resetAddForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка добавления");
    } finally {
      setAddLoading(false);
    }
  };

  const handleStartOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = addEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Введите email");
      return;
    }
    setAddLoading(true);
    try {
      const { error } = await startAddAccountEmailOtp(trimmedEmail);
      if (error) throw error;
      setAddMode("otp-verify");
      toast.success("Код отправлен на " + trimmedEmail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки кода");
    } finally {
      setAddLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = addEmail.trim().toLowerCase();
    if (!otpCode || otpCode.length < 6) {
      toast.error("Введите 6-значный код");
      return;
    }
    setAddLoading(true);
    try {
      const { error } = await verifyAddAccountEmailOtp(trimmedEmail, otpCode);
      if (error) throw error;
      toast.success("Аккаунт добавлен");
      resetAddForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Неверный код");
    } finally {
      setAddLoading(false);
    }
  };

  const resetAddForm = () => {
    setAddMode("none");
    setAddEmail("");
    setAddPassword("");
    setOtpCode("");
  };

  const handleLogoutCurrent = async () => {
    try {
      await signOut();
      navigate("/auth", { replace: true });
    } catch {
      toast.error("Не удалось выйти");
    }
  };

  const getDisplayName = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.display_name || p?.displayName || p?.username || "Аккаунт";
  };

  const getUsername = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.username || entry.accountId.slice(0, 8);
  };

  const getAvatar = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.avatar_url || p?.avatarUrl || undefined;
  };

  return (
    <>
      <SettingsHeader
        title="Мои аккаунты"
        showBack
        isDark={isDark}
        currentScreen="accounts"
        onBack={onBack}
        onClose={onBack}
      />

      <div className="flex-1 pb-8">
        {/* Список аккаунтов */}
        <div className="px-4 mb-4">
          <p className={cn("text-xs mb-2 px-1", isDark ? "text-white/50" : "text-muted-foreground")}>
            {accounts.length} {accounts.length === 1 ? "аккаунт" : "аккаунтов"} на этом устройстве
          </p>

          <div className={cn(
            "backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}>
            {accounts.map((entry) => {
              const isActive = entry.accountId === activeAccountId;
              const switching = isSwitchingAccount && !isActive;
              const needsReauth = entry.requiresReauth;

              return (
                <button
                  key={entry.accountId}
                  onClick={() => needsReauth ? navigate("/auth") : handleSwitch(entry.accountId)}
                  disabled={switching || isActive}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 transition-colors border-b last:border-0",
                    isDark ? "border-white/5" : "border-black/5",
                    isActive
                      ? isDark ? "bg-primary/10" : "bg-primary/5"
                      : isDark ? "hover:bg-white/5" : "hover:bg-black/5",
                    switching && "opacity-50",
                  )}
                >
                  <Avatar className="w-11 h-11">
                    <AvatarImage src={getAvatar(entry)} alt={getDisplayName(entry)} />
                    <AvatarFallback className={cn(
                      "text-sm font-medium",
                      isDark ? "bg-white/10 text-white" : "bg-muted text-foreground"
                    )}>
                      {getDisplayName(entry)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 text-left min-w-0">
                    <p className={cn(
                      "font-medium truncate",
                      isDark ? "text-white" : "text-foreground"
                    )}>
                      {getUsername(entry)}
                    </p>
                    <p className={cn(
                      "text-sm truncate",
                      isDark ? "text-white/50" : "text-muted-foreground"
                    )}>
                      {needsReauth
                        ? "Требуется повторный вход"
                        : isActive ? "Текущий аккаунт" : getDisplayName(entry)}
                    </p>
                  </div>

                  {needsReauth && <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />}
                  {isActive && !needsReauth && <Check className="w-5 h-5 text-primary shrink-0" />}
                  {switching && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Добавить аккаунт */}
        <div className="px-4 mb-4">
          {addMode === "none" ? (
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <button
                onClick={() => setAddMode("password")}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 transition-colors border-b",
                  isDark ? "border-white/5 hover:bg-white/5" : "border-black/5 hover:bg-black/5"
                )}
              >
                <div className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center",
                  isDark ? "bg-white/10" : "bg-muted"
                )}>
                  <Plus className={cn("w-5 h-5", isDark ? "text-white" : "text-foreground")} />
                </div>
                <span className={cn("font-medium", isDark ? "text-white" : "text-foreground")}>
                  Войти по паролю
                </span>
              </button>

              <button
                onClick={() => setAddMode("otp")}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                  isDark ? "hover:bg-white/5" : "hover:bg-black/5"
                )}
              >
                <div className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center",
                  isDark ? "bg-white/10" : "bg-muted"
                )}>
                  <Plus className={cn("w-5 h-5", isDark ? "text-white" : "text-foreground")} />
                </div>
                <span className={cn("font-medium", isDark ? "text-white" : "text-foreground")}>
                  Войти по коду из email
                </span>
              </button>
            </div>
          ) : (
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border p-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              {addMode === "password" && (
                <form onSubmit={handleAddWithPassword} className="space-y-3">
                  <p className={cn("text-sm font-medium mb-2", isDark ? "text-white" : "text-foreground")}>
                    Добавить аккаунт (email + пароль)
                  </p>
                  <Input
                    type="email"
                    placeholder="Email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    autoFocus
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                  <Input
                    type="password"
                    placeholder="Пароль"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetAddForm} className="flex-1">
                      Отмена
                    </Button>
                    <Button type="submit" disabled={addLoading} className="flex-1">
                      {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Войти"}
                    </Button>
                  </div>
                </form>
              )}

              {addMode === "otp" && (
                <form onSubmit={handleStartOtp} className="space-y-3">
                  <p className={cn("text-sm font-medium mb-2", isDark ? "text-white" : "text-foreground")}>
                    Добавить аккаунт (код из email)
                  </p>
                  <Input
                    type="email"
                    placeholder="Email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    autoFocus
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetAddForm} className="flex-1">
                      Отмена
                    </Button>
                    <Button type="submit" disabled={addLoading} className="flex-1">
                      {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отправить код"}
                    </Button>
                  </div>
                </form>
              )}

              {addMode === "otp-verify" && (
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <p className={cn("text-sm font-medium mb-2", isDark ? "text-white" : "text-foreground")}>
                    Введите код из письма ({addEmail})
                  </p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                    className={cn(
                      "text-center text-2xl tracking-[0.3em]",
                      isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40"
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetAddForm} className="flex-1">
                      Отмена
                    </Button>
                    <Button type="submit" disabled={addLoading} className="flex-1">
                      {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Подтвердить"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Выйти из текущего */}
        <div className="px-4 mt-4">
          <button
            onClick={handleLogoutCurrent}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl transition-colors",
              isDark
                ? "bg-red-500/15 border border-red-500/20 text-red-300 hover:bg-red-500/25"
                : "bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/15",
            )}
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Выйти из текущего аккаунта</span>
          </button>
        </div>
      </div>
    </>
  );
}
