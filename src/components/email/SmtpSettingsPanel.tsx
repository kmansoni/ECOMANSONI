/**
 * src/components/email/SmtpSettingsPanel.tsx
 *
 * Full SMTP/IMAP settings panel for configuring real email delivery.
 * Allows the user to:
 *   - Set custom SMTP credentials (Gmail, Yandex, Mail.ru, Outlook, custom)
 *   - Test the connection before saving
 *   - Set IMAP credentials for incoming mail polling
 *   - View verification status
 *
 * Security:
 *   - Password is sent once to the Edge Function, then encrypted server-side
 *   - On subsequent GETs, only has_password: true is returned — password never
 *     leaves the server after initial save
 *   - CSRF protection via Supabase JWT (Bearer token check in Edge Function)
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, Shield, Wifi, Settings, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ─── Preset configurations for popular providers ───────────────────────────────

interface SmtpPreset {
  label: string;
  smtp_host: string;
  smtp_port: number;
  tls_mode: "starttls" | "ssl" | "none";
  imap_host: string;
  imap_port: number;
  imap_tls: "ssl" | "starttls" | "none";
  note?: string;
}

const SMTP_PRESETS: Record<string, SmtpPreset> = {
  gmail: {
    label: "Gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_tls: "ssl",
    note: "Требуется пароль приложения (2FA должен быть включён)",
  },
  yandex: {
    label: "Яндекс Почта",
    smtp_host: "smtp.yandex.ru",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "imap.yandex.ru",
    imap_port: 993,
    imap_tls: "ssl",
    note: "Включите 'Доступ по протоколам' в настройках Яндекс ID",
  },
  mailru: {
    label: "Mail.ru",
    smtp_host: "smtp.mail.ru",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "imap.mail.ru",
    imap_port: 993,
    imap_tls: "ssl",
    note: "Создайте пароль для внешних приложений в настройках",
  },
  outlook: {
    label: "Outlook / Office 365",
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "outlook.office365.com",
    imap_port: 993,
    imap_tls: "ssl",
    note: "Для личных аккаунтов — smtp-mail.outlook.com:587",
  },
  sendgrid: {
    label: "SendGrid",
    smtp_host: "smtp.sendgrid.net",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "",
    imap_port: 993,
    imap_tls: "ssl",
    note: "User: apikey, Password: ваш API ключ SendGrid",
  },
  custom: {
    label: "Другой SMTP",
    smtp_host: "",
    smtp_port: 587,
    tls_mode: "starttls",
    imap_host: "",
    imap_port: 993,
    imap_tls: "ssl",
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmtpSettings {
  id?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  tls_mode: "starttls" | "ssl" | "none";
  from_name: string;
  from_email: string;
  reply_to: string;
  message_id_domain: string;
  verified_at: string | null;
  last_error: string | null;
  has_password: boolean;
}

interface ImapSettings {
  id?: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  tls_mode: "ssl" | "starttls" | "none";
  sync_folders: string[];
  poll_interval_s: number;
  verified_at: string | null;
  last_synced_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callSmtpSettingsApi(
  path: string,
  method: string = "GET",
  body?: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: "NOT_AUTHENTICATED" };

  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/email-smtp-settings${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, error: (data as any)?.error ?? `HTTP ${resp.status}` };
  return { ok: true, data };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SmtpSettingsPanel() {
  const [preset, setPreset] = useState<string>("custom");
  const [activeTab, setActiveTab] = useState<"smtp" | "imap">("smtp");

  // SMTP state
  const [smtp, setSmtp] = useState<SmtpSettings>({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    tls_mode: "starttls",
    from_name: "",
    from_email: "",
    reply_to: "",
    message_id_domain: "",
    verified_at: null,
    last_error: null,
    has_password: false,
  });
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // IMAP state
  const [imap, setImap] = useState<ImapSettings>({
    imap_host: "",
    imap_port: 993,
    imap_user: "",
    tls_mode: "ssl",
    sync_folders: ["INBOX", "Sent", "Drafts", "Spam", "Trash"],
    poll_interval_s: 60,
    verified_at: null,
    last_synced_at: null,
  });
  const [imapPassword, setImapPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load existing settings
  const loadSettings = useCallback(async () => {
    setInitialLoading(true);
    const [smtpResult, imapResult] = await Promise.all([
      callSmtpSettingsApi("/"),
      callSmtpSettingsApi("/imap"),
    ]);

    if (smtpResult.ok && (smtpResult.data as any)?.data) {
      const d = (smtpResult.data as any).data;
      setSmtp({
        id: d.id,
        smtp_host: d.smtp_host ?? "",
        smtp_port: d.smtp_port ?? 587,
        smtp_user: d.smtp_user ?? "",
        tls_mode: d.tls_mode ?? "starttls",
        from_name: d.from_name ?? "",
        from_email: d.from_email ?? "",
        reply_to: d.reply_to ?? "",
        message_id_domain: d.message_id_domain ?? "",
        verified_at: d.verified_at ?? null,
        last_error: d.last_error ?? null,
        has_password: d.has_password ?? false,
      });
    }

    if (imapResult.ok && (imapResult.data as any)?.data) {
      const d = (imapResult.data as any).data;
      setImap({
        id: d.id,
        imap_host: d.imap_host ?? "",
        imap_port: d.imap_port ?? 993,
        imap_user: d.imap_user ?? "",
        tls_mode: d.tls_mode ?? "ssl",
        sync_folders: d.sync_folders ?? ["INBOX", "Sent", "Drafts", "Spam", "Trash"],
        poll_interval_s: d.poll_interval_s ?? 60,
        verified_at: d.verified_at ?? null,
        last_synced_at: d.last_synced_at ?? null,
      });
    }
    setInitialLoading(false);
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Apply preset
  const applyPreset = (presetKey: string) => {
    setPreset(presetKey);
    const p = SMTP_PRESETS[presetKey];
    if (!p) return;
    setSmtp((prev) => ({
      ...prev,
      smtp_host: p.smtp_host,
      smtp_port: p.smtp_port,
      tls_mode: p.tls_mode,
    }));
    if (p.imap_host) {
      setImap((prev) => ({
        ...prev,
        imap_host: p.imap_host,
        imap_port: p.imap_port,
        tls_mode: p.imap_tls,
      }));
    }
  };

  // Test SMTP connection
  const testSmtp = async () => {
    if (!smtp.smtp_host || !smtp.smtp_user) {
      toast.error("Заполните SMTP хост и имя пользователя");
      return;
    }
    if (!smtp.has_password && !smtpPassword) {
      toast.error("Введите пароль для тестирования");
      return;
    }

    setLoadingTest(true);
    const result = await callSmtpSettingsApi("/test", "POST", {
      smtp_host: smtp.smtp_host,
      smtp_port: smtp.smtp_port,
      smtp_user: smtp.smtp_user,
      smtp_password: smtpPassword || "[EXISTING]",
      tls_mode: smtp.tls_mode,
      from_email: smtp.from_email || smtp.smtp_user,
    });
    setLoadingTest(false);

    if (result.ok && (result.data as any)?.ok) {
      toast.success("✅ SMTP подключение успешно!");
      setSmtp((prev) => ({ ...prev, verified_at: new Date().toISOString(), last_error: null }));
    } else {
      const err = (result.data as any)?.error ?? result.error ?? "Неизвестная ошибка";
      toast.error(`❌ SMTP ошибка: ${err}`);
      setSmtp((prev) => ({ ...prev, verified_at: null, last_error: err }));
    }
  };

  // Save SMTP
  const saveSmtp = async () => {
    if (!smtp.smtp_host || !smtp.smtp_user || !smtp.from_email) {
      toast.error("Заполните обязательные поля: хост, пользователь, from_email");
      return;
    }
    if (!smtp.has_password && !smtpPassword) {
      toast.error("Введите пароль SMTP");
      return;
    }

    setLoading(true);
    const result = await callSmtpSettingsApi("/", "PUT", {
      smtp_host: smtp.smtp_host,
      smtp_port: smtp.smtp_port,
      smtp_user: smtp.smtp_user,
      smtp_password: smtpPassword,
      tls_mode: smtp.tls_mode,
      from_name: smtp.from_name || null,
      from_email: smtp.from_email,
      reply_to: smtp.reply_to || null,
      message_id_domain: smtp.message_id_domain || null,
    });
    setLoading(false);

    if (result.ok) {
      const d = (result.data as any)?.data;
      if (d) {
        setSmtp((prev) => ({ ...prev, ...d, has_password: true }));
        setSmtpPassword(""); // clear password from memory
      }
      toast.success("SMTP настройки сохранены");
    } else {
      toast.error(`Ошибка сохранения: ${result.error}`);
    }
  };

  // Save IMAP
  const saveImap = async () => {
    if (!imap.imap_host || !imap.imap_user || !imapPassword) {
      toast.error("Заполните хост, пользователя и пароль IMAP");
      return;
    }

    setLoading(true);
    const result = await callSmtpSettingsApi("/imap", "PUT", {
      imap_host: imap.imap_host,
      imap_port: imap.imap_port,
      imap_user: imap.imap_user,
      imap_password: imapPassword,
      tls_mode: imap.tls_mode,
      sync_folders: imap.sync_folders,
      poll_interval_s: imap.poll_interval_s,
    });
    setLoading(false);

    if (result.ok) {
      setImapPassword("");
      toast.success("IMAP настройки сохранены");
      void loadSettings();
    } else {
      toast.error(`Ошибка: ${result.error}`);
    }
  };

  // Delete SMTP
  const deleteSmtp = async () => {
    if (!confirm("Удалить SMTP настройки? Это отключит отправку через ваш SMTP.")) return;
    setLoading(true);
    const result = await callSmtpSettingsApi("/", "DELETE");
    setLoading(false);
    if (result.ok) {
      setSmtp({ smtp_host: "", smtp_port: 587, smtp_user: "", tls_mode: "starttls", from_name: "", from_email: "", reply_to: "", message_id_domain: "", verified_at: null, last_error: null, has_password: false });
      setSmtpPassword("");
      toast.success("SMTP настройки удалены");
    } else {
      toast.error(`Ошибка: ${result.error}`);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка настроек...
      </div>
    );
  }

  const selectedPreset = SMTP_PRESETS[preset];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Настройки почты
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Настройте собственный SMTP для реальной доставки писем. Письма будут отправляться
          от вашего имени через ваш почтовый провайдер с корректными SPF/DKIM заголовками.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {(["smtp", "imap"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "smtp" ? "Исходящая (SMTP)" : "Входящая (IMAP)"}
          </button>
        ))}
      </div>

      {activeTab === "smtp" && (
        <div className="space-y-5">
          {/* Preset selector */}
          <div className="space-y-1.5">
            <Label>Провайдер</Label>
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SMTP_PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset?.note && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2">
                ⚠️ {selectedPreset.note}
              </p>
            )}
          </div>

          <Separator />

          {/* Connection settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>SMTP хост *</Label>
              <Input
                value={smtp.smtp_host}
                onChange={(e) => setSmtp((p) => ({ ...p, smtp_host: e.target.value }))}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Порт *</Label>
              <Input
                type="number"
                value={smtp.smtp_port}
                onChange={(e) => setSmtp((p) => ({ ...p, smtp_port: parseInt(e.target.value) || 587 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Шифрование *</Label>
              <Select
                value={smtp.tls_mode}
                onValueChange={(v) => setSmtp((p) => ({ ...p, tls_mode: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starttls">STARTTLS (рекомендуется, порт 587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (порт 465)</SelectItem>
                  <SelectItem value="none">Без шифрования (небезопасно)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auth */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label>Логин (email или username) *</Label>
              <Input
                value={smtp.smtp_user}
                onChange={(e) => setSmtp((p) => ({ ...p, smtp_user: e.target.value }))}
                placeholder="your@gmail.com"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Пароль SMTP {smtp.has_password ? "(оставьте пустым, чтобы не менять)" : "*"}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder={smtp.has_password ? "••••••••" : "Пароль приложения"}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {smtp.has_password && (
                <p className="text-xs text-muted-foreground">Пароль сохранён в зашифрованном виде на сервере (AES-256-GCM)</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Identity */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label>Email отправителя (From) *</Label>
              <Input
                type="email"
                value={smtp.from_email}
                onChange={(e) => setSmtp((p) => ({ ...p, from_email: e.target.value }))}
                placeholder="your@gmail.com"
              />
              <p className="text-xs text-muted-foreground">
                Должен совпадать с адресом SMTP аккаунта для прохождения SPF/DKIM
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Имя отправителя</Label>
              <Input
                value={smtp.from_name}
                onChange={(e) => setSmtp((p) => ({ ...p, from_name: e.target.value }))}
                placeholder="Иван Иванов"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reply-To (необязательно)</Label>
              <Input
                type="email"
                value={smtp.reply_to}
                onChange={(e) => setSmtp((p) => ({ ...p, reply_to: e.target.value }))}
                placeholder="support@yourdomain.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Домен для Message-ID (необязательно)</Label>
              <Input
                value={smtp.message_id_domain}
                onChange={(e) => setSmtp((p) => ({ ...p, message_id_domain: e.target.value }))}
                placeholder="yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                Используется для формирования Message-ID заголовка. Должен совпадать с DKIM-доменом.
              </p>
            </div>
          </div>

          {/* Verification status */}
          <div className="rounded-lg border p-3 flex items-center gap-3">
            {smtp.verified_at ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Подключение проверено</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(smtp.verified_at).toLocaleString("ru-RU")}
                  </p>
                </div>
              </>
            ) : smtp.last_error ? (
              <>
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Ошибка подключения</p>
                  <p className="text-xs text-muted-foreground truncate max-w-sm">{smtp.last_error}</p>
                </div>
              </>
            ) : (
              <>
                <Wifi className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Подключение не проверено</p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => void testSmtp()}
              disabled={loadingTest || !smtp.smtp_host}
              className="gap-2"
            >
              {loadingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              Тест подключения
            </Button>
            <Button
              onClick={() => void saveSmtp()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Сохранить SMTP
            </Button>
            {smtp.has_password && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void deleteSmtp()}
                disabled={loading}
              >
                Удалить
              </Button>
            )}
          </div>

          {/* SPF/DKIM instructions */}
          <div className="rounded-lg border border-dashed p-4 bg-muted/20">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Настройка SPF / DKIM / DMARC (рекомендуется)
            </h3>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>
                Для гарантированной доставки (не в спам) настройте DNS-записи вашего домена:
              </p>
              <div className="font-mono bg-muted rounded p-2 space-y-1">
                <div>
                  <span className="text-blue-500">SPF:</span>{" "}
                  <span>TXT v=spf1 include:_spf.{smtp.smtp_host.split(".").slice(-2).join(".") || "yourprovider.com"} ~all</span>
                </div>
                <div>
                  <span className="text-green-500">DKIM:</span>{" "}
                  <span>настраивается в панели управления вашего провайдера</span>
                </div>
                <div>
                  <span className="text-orange-500">DMARC:</span>{" "}
                  <span>TXT v=DMARC1; p=quarantine; rua=mailto:dmarc@{smtp.from_email.split("@")[1] || "yourdomain.com"}</span>
                </div>
              </div>
              <p>
                При использовании Gmail/Яндекс/Outlook — SPF и DKIM уже настроены провайдером.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "imap" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            IMAP настройки позволяют системе получать входящие письма от вашего провайдера
            и синхронизировать их в почтовый клиент.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>IMAP хост *</Label>
              <Input
                value={imap.imap_host}
                onChange={(e) => setImap((p) => ({ ...p, imap_host: e.target.value }))}
                placeholder="imap.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Порт</Label>
              <Input
                type="number"
                value={imap.imap_port}
                onChange={(e) => setImap((p) => ({ ...p, imap_port: parseInt(e.target.value) || 993 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Шифрование</Label>
              <Select
                value={imap.tls_mode}
                onValueChange={(v) => setImap((p) => ({ ...p, tls_mode: v as any }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssl">SSL/TLS</SelectItem>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="none">Без шифрования</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Логин IMAP *</Label>
            <Input
              value={imap.imap_user}
              onChange={(e) => setImap((p) => ({ ...p, imap_user: e.target.value }))}
              placeholder="your@gmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Пароль IMAP *</Label>
            <Input
              type="password"
              value={imapPassword}
              onChange={(e) => setImapPassword(e.target.value)}
              placeholder="Пароль приложения"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Интервал опроса (секунды)</Label>
            <Select
              value={String(imap.poll_interval_s)}
              onValueChange={(v) => setImap((p) => ({ ...p, poll_interval_s: parseInt(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="60">60 секунд (1 мин)</SelectItem>
                <SelectItem value="300">300 секунд (5 мин)</SelectItem>
                <SelectItem value="600">600 секунд (10 мин)</SelectItem>
                <SelectItem value="1800">1800 секунд (30 мин)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {imap.last_synced_at && (
            <p className="text-xs text-muted-foreground">
              Последняя синхронизация: {new Date(imap.last_synced_at).toLocaleString("ru-RU")}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => void saveImap()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Сохранить IMAP
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
