import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { sha256Hex } from "@/lib/passcode";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrCreatePrivacyRules,
  updatePrivacyRule,
  listPrivacyRuleExceptions,
  upsertPrivacyRuleException,
  deletePrivacyRuleException,
  type PrivacyAudience,
  type PrivacyRule,
  type PrivacyRuleException,
  type PrivacyRuleExceptionMode,
  type PrivacyRuleKey,
  listAuthorizedSites,
  revokeAllAuthorizedSites,
  revokeAuthorizedSite,
  getOrCreateUserSecuritySettings,
  updateUserSecuritySettings,
  type UserSecuritySettings,
} from "@/lib/privacy-security";

type Mode = "privacy" | "sites" | "passcode" | "cloud_password" | "account_protection";

type Props = {
  mode: Mode;
  isDark: boolean;
  onOpenBlocked?: () => void;
};

type RuleOption = { value: PrivacyAudience; label: string };

type RuleMeta = {
  key: PrivacyRuleKey;
  title: string;
  options: RuleOption[];
  allowAlwaysAllow: boolean;
  allowNeverAllow: boolean;
};

const RULES: RuleMeta[] = [
  { key: "phone_number", title: "Номер телефона", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: false },
  { key: "last_seen", title: "Время захода", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: false },
  { key: "profile_photos", title: "Фотографии профиля", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: true },
  { key: "bio", title: "Раздел «О себе»", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: true },
  { key: "gifts", title: "Подарки", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: true },
  { key: "birthday", title: "День рождения", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: false },
  { key: "saved_music", title: "Сохраненная музыка", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: false, allowNeverAllow: true },
  { key: "forwarded_messages", title: "Пересылка сообщений", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: false },
  { key: "calls", title: "Звонки", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: false, allowNeverAllow: true },
  { key: "voice_messages", title: "Голосовые сообщения", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: false, allowNeverAllow: true },
  { key: "messages", title: "Сообщения", options: [{ value: "everyone", label: "Все" }, { value: "contacts_and_premium", label: "Контакты и Premium" }, { value: "paid_messages", label: "Сообщения за звёзды" }], allowAlwaysAllow: false, allowNeverAllow: false },
  { key: "invites", title: "Группы и каналы", options: [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }], allowAlwaysAllow: true, allowNeverAllow: false },
];

function labelForAudience(v: string): string {
  const found = RULES.flatMap((r) => r.options).find((x) => x.value === v);
  return found?.label ?? v;
}

function cardClass(isDark: boolean): string {
  return cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20");
}

export function PrivacySecurityCenter({ mode, isDark, onOpenBlocked }: Props) {
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState<PrivacyRule[]>([]);
  const [selectedRuleKey, setSelectedRuleKey] = useState<PrivacyRuleKey | null>(null);
  const [exceptions, setExceptions] = useState<PrivacyRuleException[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ user_id: string; display_name: string | null }>>([]);

  const [securitySettings, setSecuritySettings] = useState<UserSecuritySettings | null>(null);
  const [passcode, setPasscode] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [sites, setSites] = useState<any[]>([]);

  const selectedMeta = useMemo(() => RULES.find((r) => r.key === selectedRuleKey) ?? null, [selectedRuleKey]);
  const selectedRule = useMemo(() => rules.find((r) => r.rule_key === selectedRuleKey) ?? null, [rules, selectedRuleKey]);

  const loadRules = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await getOrCreatePrivacyRules(user.id);
      setRules(data);
    } catch (e) {
      toast({ title: "Конфиденциальность", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadSecurity = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getOrCreateUserSecuritySettings(user.id);
      setSecuritySettings(data);
    } catch (e) {
      toast({ title: "Безопасность", description: e instanceof Error ? e.message : String(e) });
    }
  }, [user?.id]);

  const loadSites = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listAuthorizedSites(user.id);
      setSites(data);
    } catch (e) {
      toast({ title: "Сайты", description: e instanceof Error ? e.message : String(e) });
    }
  }, [user?.id]);

  const loadExceptions = useCallback(async () => {
    if (!user?.id || !selectedRuleKey) return;
    try {
      const data = await listPrivacyRuleExceptions(user.id, selectedRuleKey);
      setExceptions(data);
      const ids = Array.from(new Set(data.map((x) => x.target_user_id)));
      if (!ids.length) {
        setProfilesById({});
        return;
      }
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      if (error) throw error;
      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      for (const p of profiles ?? []) map[(p as any).user_id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url };
      setProfilesById(map);
    } catch (e) {
      toast({ title: "Исключения", description: e instanceof Error ? e.message : String(e) });
    }
  }, [selectedRuleKey, user?.id]);

  useEffect(() => {
    if (mode === "privacy") void loadRules();
    if (mode === "sites") void loadSites();
    if (mode === "passcode" || mode === "cloud_password" || mode === "account_protection") void loadSecurity();
  }, [loadRules, loadSecurity, loadSites, mode]);

  useEffect(() => {
    if (mode === "privacy" && selectedRuleKey) void loadExceptions();
  }, [loadExceptions, mode, selectedRuleKey]);

  useEffect(() => {
    if (mode !== "privacy" || !selectedRuleKey || search.trim().length < 2 || !user?.id) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .neq("user_id", user.id)
          .ilike("display_name", `%${search.trim()}%`)
          .limit(8);
        if (error) throw error;
        if (!cancelled) setSearchResults((data ?? []) as any);
      } catch (e) {
        if (!cancelled) toast({ title: "Поиск", description: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, search, selectedRuleKey, user?.id]);

  if (mode === "sites") {
    return (
      <div className="px-4 pb-8 space-y-3">
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Отключить все сайты</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Завершит все веб-сессии входа через Telegram.</p>
            </div>
            <Button variant="destructive" onClick={async () => { if (!user?.id) return; await revokeAllAuthorizedSites(user.id); await loadSites(); }}>
              Отключить
            </Button>
          </div>
        </div>
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Авторизованные сайты</p>
            {sites.length === 0 ? (
              <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Нет активных сессий.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {sites.map((s) => (
                  <div key={s.id} className={cn("p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{s.site_name}</p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{s.domain} {s.browser ? `• ${s.browser}` : ""}</p>
                      </div>
                      <Button variant="secondary" onClick={async () => { if (!user?.id) return; await revokeAuthorizedSite(user.id, s.id); await loadSites(); }}>
                        Отключить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "passcode") {
    return (
      <div className="px-4 pb-8">
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4 space-y-3">
            <p className="font-semibold">Код-пароль</p>
            <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} type="password" placeholder="Введите код-пароль" />
            <Button
              className="w-full"
              onClick={async () => {
                if (!user?.id) return;
                const hash = passcode.trim() ? await sha256Hex(passcode.trim()) : null;
                const next = await updateUserSecuritySettings(user.id, { app_passcode_hash: hash });
                setSecuritySettings(next);
                setPasscode("");
                toast({ title: "Код-пароль", description: hash ? "Код включен." : "Код отключен." });
              }}
            >
              {securitySettings?.app_passcode_hash ? "Обновить / отключить" : "Включить код-пароль"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "cloud_password") {
    return (
      <div className="px-4 pb-8">
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4 space-y-3">
            <p className="font-semibold">Облачный пароль (2FA)</p>
            <Input value={cloudPassword} onChange={(e) => setCloudPassword(e.target.value)} type="password" placeholder="Введите облачный пароль" />
            <Button
              className="w-full"
              onClick={async () => {
                if (!user?.id) return;
                const hash = cloudPassword.trim() ? await sha256Hex(cloudPassword.trim()) : null;
                const next = await updateUserSecuritySettings(user.id, { cloud_password_hash: hash });
                setSecuritySettings(next);
                setCloudPassword("");
                toast({ title: "Облачный пароль", description: hash ? "Пароль сохранен." : "Пароль отключен." });
              }}
            >
              {securitySettings?.cloud_password_hash ? "Обновить / отключить" : "Включить облачный пароль"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "account_protection") {
    return (
      <div className="px-4 pb-8">
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Защита аккаунта ключом доступа</p>
            <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Флаг использования Passkey хранится в Supabase и синхронизируется между устройствами.</p>
            <div className="mt-4 flex items-center justify-between">
              <p className="font-medium">Ключ доступа</p>
              <Switch
                checked={!!securitySettings?.passkey_enabled}
                onCheckedChange={async (val) => {
                  if (!user?.id) return;
                  const next = await updateUserSecuritySettings(user.id, { passkey_enabled: val });
                  setSecuritySettings(next);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedRule && selectedMeta) {
    const allowList = exceptions.filter((e) => e.mode === "always_allow");
    const denyList = exceptions.filter((e) => e.mode === "never_allow");

    const renderExceptionList = (title: string, modeValue: PrivacyRuleExceptionMode, rows: PrivacyRuleException[]) => (
      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">{title}</p>
          {rows.length === 0 ? (
            <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Пусто</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {rows.map((r) => (
                <div key={r.id} className={cn("p-3 rounded-xl border flex items-center justify-between gap-2", isDark ? "border-white/10" : "border-white/20")}>
                  <p className="truncate">{profilesById[r.target_user_id]?.display_name ?? r.target_user_id}</p>
                  <Button size="sm" variant="secondary" onClick={async () => { if (!user?.id) return; await deletePrivacyRuleException(r.id, user.id); await loadExceptions(); }}>
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск пользователя" />
            {searchResults.length > 0 ? (
              <div className={cn("rounded-xl border overflow-hidden", isDark ? "border-white/10" : "border-white/20")}>
                {searchResults.map((r) => (
                  <button
                    key={r.user_id}
                    type="button"
                    className={cn("w-full text-left px-3 py-2 border-b last:border-b-0", isDark ? "border-white/10 hover:bg-white/5" : "border-white/20 hover:bg-white/5")}
                    onClick={async () => {
                      if (!user?.id || !selectedRuleKey) return;
                      await upsertPrivacyRuleException(user.id, selectedRuleKey, modeValue, r.user_id);
                      setSearch("");
                      setSearchResults([]);
                      await loadExceptions();
                    }}
                  >
                    {r.display_name ?? r.user_id}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );

    return (
      <div className="px-4 pb-8 space-y-3">
        <button className="inline-flex items-center gap-2 text-sm opacity-80" onClick={() => setSelectedRuleKey(null)}>
          <ChevronLeft className="w-4 h-4" />
          Назад к списку
        </button>

        <div className={cardClass(isDark)}>
          {selectedMeta.options.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              className={cn("w-full px-5 py-4 text-left flex items-center justify-between", idx < selectedMeta.options.length - 1 ? (isDark ? "border-b border-white/10" : "border-b border-white/20") : "")}
              onClick={async () => {
                if (!user?.id || !selectedRuleKey) return;
                const next = await updatePrivacyRule(user.id, selectedRuleKey, { audience: opt.value });
                setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
              }}
            >
              <span>{opt.label}</span>
              <span className={cn("text-sm", selectedRule.audience === opt.value ? "text-blue-400" : "opacity-0")}>✓</span>
            </button>
          ))}
        </div>

        {selectedRuleKey === "phone_number" ? (
          <div className={cardClass(isDark)}>
            <div className="px-5 py-4">
              <p className="font-semibold">Кто может найти меня по номеру</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant={selectedRule.phone_discovery_audience === "everyone" ? "default" : "secondary"} onClick={async () => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "phone_number", { phone_discovery_audience: "everyone" });
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }}>Все</Button>
                <Button variant={selectedRule.phone_discovery_audience === "contacts" ? "default" : "secondary"} onClick={async () => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "phone_number", { phone_discovery_audience: "contacts" });
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }}>Контакты</Button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedRuleKey === "last_seen" ? (
          <div className={cardClass(isDark)}>
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Скрывать время прочтения</p>
              </div>
              <Switch checked={selectedRule.hide_read_time} onCheckedChange={async (val) => {
                if (!user?.id) return;
                const next = await updatePrivacyRule(user.id, "last_seen", { hide_read_time: val });
                setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
              }} />
            </div>
          </div>
        ) : null}

        {selectedRuleKey === "calls" ? (
          <div className={cardClass(isDark)}>
            <div className="px-5 py-4">
              <p className="font-semibold">Peer-to-Peer</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button variant={selectedRule.p2p_mode === "always" ? "default" : "secondary"} onClick={async () => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "calls", { p2p_mode: "always" });
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }}>Всегда</Button>
                <Button variant={selectedRule.p2p_mode === "contacts" ? "default" : "secondary"} onClick={async () => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "calls", { p2p_mode: "contacts" });
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }}>Контакты</Button>
                <Button variant={selectedRule.p2p_mode === "never" ? "default" : "secondary"} onClick={async () => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "calls", { p2p_mode: "never" });
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }}>Никогда</Button>
              </div>
            </div>
            <div className={cn("px-5 py-4 border-t flex items-center justify-between gap-3", isDark ? "border-white/10" : "border-white/20")}>
              <p className="font-medium">Интеграция со звонками iOS</p>
              <Switch checked={selectedRule.ios_call_integration} onCheckedChange={async (val) => {
                if (!user?.id) return;
                const next = await updatePrivacyRule(user.id, "calls", { ios_call_integration: val });
                setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
              }} />
            </div>
          </div>
        ) : null}

        {selectedRuleKey === "gifts" ? (
          <div className={cardClass(isDark)}>
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <p className="font-medium">Значок подарка в чатах</p>
              <Switch checked={selectedRule.gift_badge_enabled} onCheckedChange={async (val) => {
                if (!user?.id) return;
                const next = await updatePrivacyRule(user.id, "gifts", { gift_badge_enabled: val });
                setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
              }} />
            </div>
            {[
              ["gift_allow_common", "Обычные"],
              ["gift_allow_rare", "Редкие"],
              ["gift_allow_unique", "Уникальные"],
              ["gift_allow_channels", "От каналов"],
              ["gift_allow_premium", "Telegram Premium"],
            ].map(([key, title]) => (
              <div key={key} className={cn("px-5 py-4 border-t flex items-center justify-between gap-3", isDark ? "border-white/10" : "border-white/20")}>
                <p className="font-medium">{title}</p>
                <Switch checked={Boolean((selectedRule as any)[key])} onCheckedChange={async (val) => {
                  if (!user?.id) return;
                  const next = await updatePrivacyRule(user.id, "gifts", { [key]: val } as any);
                  setRules((prev) => prev.map((r) => (r.rule_key === next.rule_key ? next : r)));
                }} />
              </div>
            ))}
          </div>
        ) : null}

        {selectedMeta.allowAlwaysAllow ? renderExceptionList("Всегда разрешать", "always_allow", allowList) : null}
        {selectedMeta.allowNeverAllow ? renderExceptionList("Никогда не разрешать", "never_allow", denyList) : null}
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 space-y-3">
      <div className={cardClass(isDark)}>
        {RULES.map((r, idx) => {
          const row = rules.find((x) => x.rule_key === r.key);
          return (
            <button
              key={r.key}
              type="button"
              className={cn("w-full px-5 py-4 text-left flex items-center justify-between gap-3", idx < RULES.length - 1 ? (isDark ? "border-b border-white/10" : "border-b border-white/20") : "")}
              onClick={() => setSelectedRuleKey(r.key)}
            >
              <span>{r.title}</span>
              <span className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>{labelForAudience(row?.audience ?? "everyone")}</span>
            </button>
          );
        })}
      </div>

      <div className={cardClass(isDark)}>
        <div className={cn("px-5 py-4 border-b", isDark ? "border-white/10" : "border-white/20")}>
          <p className="font-semibold">Автоудаление сообщений</p>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              [0, "Нет"],
              [86400, "1 день"],
              [604800, "1 нед."],
              [2592000, "1 месяц"],
            ].map(([sec, lbl]) => (
              <Button key={sec} variant={(settings?.messages_auto_delete_seconds ?? 0) === sec ? "default" : "secondary"} onClick={async () => {
                await updateSettings({ messages_auto_delete_seconds: Number(sec) });
              }}>{lbl}</Button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="font-semibold">Удалить аккаунт автоматически</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              [30, "1 мес."],
              [180, "6 мес."],
              [365, "1 год"],
            ].map(([days, lbl]) => (
              <Button key={days} variant={(settings?.account_self_destruct_days ?? 180) === days ? "default" : "secondary"} onClick={async () => {
                await updateSettings({ account_self_destruct_days: Number(days) });
              }}>{lbl}</Button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <button type="button" className="w-full px-5 py-4 text-left flex items-center justify-between" onClick={onOpenBlocked}>
          <span>Черный список</span>
          <span className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Управление</span>
        </button>
      </div>

      {loading ? <p className={cn("text-sm px-1", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p> : null}
    </div>
  );
}

