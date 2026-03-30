/**
 * src/pages/settings/SettingsBrandedContentSection.tsx
 *
 * Self-contained branded content section extracted from SettingsPage.
 * Handles screens: branded_content, branded_content_info,
 * branded_content_requests, branded_content_authors.
 *
 * Owns all partner/author search state, request/approval state,
 * profile resolution, and realtime subscriptions.
 */
import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Info,
  Share2,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  approveBrandedAuthor,
  createBrandedPartnerRequest,
  decideBrandedPartnerRequest,
  listIncomingBrandedPartnerRequests,
  listBrandedApprovedAuthors,
  listOutgoingBrandedPartnerRequests,
  revokeBrandedAuthor,
  type BrandedPartnerRequest,
  type BrandedApprovedAuthor,
} from "@/lib/user-settings";
import { SettingsHeader, SettingsMenuItem, SettingsToggleItem } from "./helpers";
import type { Screen, SectionProps } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SimpleProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export interface SettingsBrandedContentProps extends SectionProps {
  currentScreen: Screen;
  profileVerified: boolean | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsBrandedContentSection({
  isDark,
  onNavigate,
  onBack,
  currentScreen,
  profileVerified,
}: SettingsBrandedContentProps) {
  const { user } = useAuth();
  const isAuthed = !!user;
  const { settings, update: updateSettings } = useUserSettings();

  // Approved authors
  const [approvedAuthors, setApprovedAuthors] = useState<BrandedApprovedAuthor[]>([]);
  const [approvedAuthorsLoading, setApprovedAuthorsLoading] = useState(false);
  const [approvedAuthorProfiles, setApprovedAuthorProfiles] = useState<Record<string, SimpleProfile>>({});
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorSearchLoading, setAuthorSearchLoading] = useState(false);
  const [authorSearchResults, setAuthorSearchResults] = useState<SimpleProfile[]>([]);

  // Partner requests
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerSearchResults, setPartnerSearchResults] = useState<Array<Pick<SimpleProfile, "user_id" | "display_name">>>([]);
  const [partnerSearchLoading, setPartnerSearchLoading] = useState(false);
  const [partnerRequestMessage, setPartnerRequestMessage] = useState("");
  const [outgoingRequests, setOutgoingRequests] = useState<BrandedPartnerRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<BrandedPartnerRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestProfiles, setRequestProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});

  // -----------------------------------------------------------------------
  // Data loaders
  // -----------------------------------------------------------------------

  const loadApprovedAuthors = useCallback(async () => {
    if (!isAuthed) return;
    setApprovedAuthorsLoading(true);
    try {
      const rows = await listBrandedApprovedAuthors(user!.id);
      setApprovedAuthors(rows);

      const ids = rows.map((r) => r.author_user_id);
      if (ids.length) {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", ids);
        if (profErr) throw profErr;
        const map: Record<string, SimpleProfile> = {};
        for (const p of (prof ?? []) as SimpleProfile[]) {
          map[p.user_id] = p;
        }
        setApprovedAuthorProfiles(map);
      } else {
        setApprovedAuthorProfiles({});
      }
    } catch (e) {
      toast({ title: "Брендированный контент", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setApprovedAuthorsLoading(false);
    }
  }, [isAuthed, user]);

  const loadPartnerRequests = useCallback(async () => {
    if (!isAuthed) return;
    setRequestsLoading(true);
    try {
      const [outgoing, incoming] = await Promise.all([
        listOutgoingBrandedPartnerRequests(user!.id),
        listIncomingBrandedPartnerRequests(user!.id),
      ]);
      setOutgoingRequests(outgoing);
      setIncomingRequests(incoming);

      const allIds = [
        ...outgoing.map((r) => r.partner_user_id),
        ...incoming.map((r) => r.brand_user_id),
      ].filter(Boolean);
      const uniqueIds = [...new Set(allIds)];
      if (uniqueIds.length) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", uniqueIds);
        const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
        for (const p of (prof ?? []) as Array<Pick<SimpleProfile, "user_id" | "display_name" | "avatar_url">>) {
          map[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
        setRequestProfiles(map);
      } else {
        setRequestProfiles({});
      }
    } catch (e) {
      toast({ title: "Бренд‑партнёры", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRequestsLoading(false);
    }
  }, [isAuthed, user]);

  // Auto-load + realtime for approved authors
  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "branded_content_authors") return;
    void loadApprovedAuthors();

    const channel = supabase
      .channel(`branded-approved-authors:${user!.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "branded_content_approved_authors",
          filter: `brand_user_id=eq.${user!.id}`,
        },
        () => {
          void loadApprovedAuthors();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentScreen, isAuthed, loadApprovedAuthors, user]);

  // Auto-load + realtime for partner requests
  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "branded_content_requests") return;
    void loadPartnerRequests();

    const channel = supabase
      .channel(`branded-partner-requests:${user!.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branded_content_partner_requests" },
        () => {
          void loadPartnerRequests();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentScreen, isAuthed, loadPartnerRequests, user]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderHeader = (title: string) => (
    <SettingsHeader
      title={title}
      isDark={isDark}
      currentScreen={currentScreen}
      onBack={onBack}
      onClose={onBack}
    />
  );

  const renderMenuItem = (
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    value?: string,
  ) => (
    <SettingsMenuItem icon={icon} label={label} isDark={isDark} onClick={onClick} value={value} />
  );

  const renderToggleItem = (
    icon: React.ReactNode,
    label: string,
    description: string,
    checked: boolean,
    onCheckedChange: (val: boolean) => void,
  ) => (
    <SettingsToggleItem
      icon={icon}
      label={label}
      description={description}
      isDark={isDark}
      checked={checked}
      onCheckedChange={onCheckedChange}
    />
  );

  // -----------------------------------------------------------------------
  // Screen: branded_content (menu)
  // -----------------------------------------------------------------------

  if (currentScreen === "branded_content") {
    return (
      <>
        {renderHeader("Брендированный контент")}
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Статус</p>
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              {renderMenuItem(
                <BadgeCheck className={cn("w-5 h-5", isDark ? "text-green-400" : "text-green-400")} />,
                profileVerified === false ? "Требуется подтверждение" : "Соответствует требованиям",
                () => {
                  toast({
                    title: "Статус",
                    description:
                      profileVerified === false
                        ? "Ваш профиль не отмечен как verified. Для бренд‑меток нужен verified аккаунт."
                        : "Аккаунт соответствует требованиям."
                  });
                },
              )}
            </div>
            <p className={cn("text-xs mt-2 px-1", isDark ? "text-white/60" : "text-white/60")}>
              Вы можете использовать метку &quot;Оплачено спонсором&quot;.
            </p>
          </div>

          <div className="px-4 mt-5">
            <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>
              Метка &quot;Оплачено спонсором&quot;
            </p>
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              {renderMenuItem(
                <Share2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                "Отправить запрос на одобрение бренд‑партнёрам",
                () => onNavigate("branded_content_requests"),
              )}
              {renderToggleItem(
                <Shield className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                "Одобрять авторов контента вручную",
                "Когда включено, только одобренные авторы могут добавлять вас к брендированному контенту",
                !!settings?.branded_content_manual_approval,
                async (val) => {
                  if (!isAuthed) return;
                  await updateSettings({ branded_content_manual_approval: val });
                },
              )}
              {renderMenuItem(
                <Users className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                "Одобрение авторов контента",
                () => onNavigate("branded_content_authors"),
              )}
            </div>
          </div>

          <div className="px-4 mt-5">
            <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Поддержать</p>
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              {renderMenuItem(
                <Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                "Подробнее",
                () => onNavigate("branded_content_info"),
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: branded_content_info
  // -----------------------------------------------------------------------

  if (currentScreen === "branded_content_info") {
    return (
      <>
        {renderHeader("Брендированный контент")}
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-5 py-5",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className={cn("text-lg font-semibold", isDark ? "text-white" : "text-white")}>Как это работает</p>
              <div className={cn("text-sm mt-3 space-y-2", isDark ? "text-white/60" : "text-white/70")}>
                <p>1) Вы включаете метку &quot;Оплачено спонсором&quot; для публикаций.</p>
                <p>2) Вы можете отправлять запросы бренд‑партнёрам на одобрение сотрудничества.</p>
                <p>3) Если включено &quot;ручное одобрение авторов&quot;, только одобренные авторы смогут добавлять вас к бренд‑контенту.</p>
                <p>4) Все решения фиксируются в базе (Supabase) и синхронизируются в реальном времени.</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: branded_content_requests
  // -----------------------------------------------------------------------

  if (currentScreen === "branded_content_requests") {
    return (
      <>
        {renderHeader("Запросы бренд‑партнёрам")}
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4 grid gap-3">
            {/* Send request form */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <div className="px-5 py-4">
                <p className="font-semibold">Отправить запрос</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                  Найдите партнёра по имени и отправьте запрос. Партнёр сможет одобрить или отклонить.
                </p>

                <div className="mt-3 flex gap-2">
                  <Input
                    value={partnerQuery}
                    onChange={(e) => setPartnerQuery(e.target.value)}
                    placeholder="Поиск партнёра по display name…"
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                  <Button
                    onClick={async () => {
                      if (!isAuthed) return;
                      const q = partnerQuery.trim();
                      if (q.length < 2) {
                        toast({ title: "Поиск", description: "Введите минимум 2 символа." });
                        return;
                      }
                      setPartnerSearchLoading(true);
                      try {
                        const { data, error } = await supabase
                          .from("profiles")
                          .select("user_id, display_name")
                          .ilike("display_name", `%${q}%`)
                          .limit(10);
                        if (error) throw error;
                        setPartnerSearchResults(data ?? []);
                      } catch (e) {
                        toast({ title: "Поиск", description: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setPartnerSearchLoading(false);
                      }
                    }}
                    disabled={partnerSearchLoading}
                  >
                    Найти
                  </Button>
                </div>

                <div className="mt-3">
                  <Input
                    value={partnerRequestMessage}
                    onChange={(e) => setPartnerRequestMessage(e.target.value)}
                    placeholder="Сообщение партнёру (опционально)"
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                </div>

                {partnerSearchResults.length ? (
                  <div className="mt-4 grid gap-2">
                    {partnerSearchResults.map((p) => (
                      <div
                        key={p.user_id}
                        className={cn(
                          "flex items-center justify-between gap-3 p-3 rounded-xl border",
                          isDark ? "border-white/10" : "border-white/20",
                        )}
                      >
                        <div className="min-w-0">
                          <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                            {p.display_name ?? p.user_id}
                          </p>
                          <p className={cn("text-xs break-all", isDark ? "text-white/50" : "text-white/60")}>
                            {p.user_id}
                          </p>
                        </div>
                        <Button
                          onClick={async () => {
                            if (!isAuthed) return;
                            try {
                              await createBrandedPartnerRequest(user!.id, p.user_id, partnerRequestMessage.trim() || undefined);
                              toast({ title: "Готово", description: "Запрос отправлен." });
                              setPartnerSearchResults([]);
                              setPartnerQuery("");
                              setPartnerRequestMessage("");
                              await loadPartnerRequests();
                            } catch (e) {
                              toast({ title: "Запрос", description: e instanceof Error ? e.message : String(e) });
                            }
                          }}
                        >
                          Отправить
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : partnerSearchLoading ? (
                  <p className={cn("text-sm mt-3", isDark ? "text-white/60" : "text-white/70")}>Поиск…</p>
                ) : null}
              </div>
            </div>

            {/* Incoming requests */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <div className="px-5 py-4">
                <p className="font-semibold">Входящие</p>
                {requestsLoading ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                ) : incomingRequests.length === 0 ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Нет входящих запросов.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {incomingRequests.map((r) => (
                      <div key={r.id} className={cn("p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                        <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>
                          От: {requestProfiles[r.brand_user_id]?.display_name ?? r.brand_user_id}
                        </p>
                        {r.message ? (
                          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{r.message}</p>
                        ) : null}
                        <p className={cn("text-xs mt-1", isDark ? "text-white/50" : "text-white/60")}>Статус: {r.status}</p>

                        {r.status === "pending" ? (
                          <div className="mt-3 flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={async () => {
                                try {
                                  await decideBrandedPartnerRequest(r.id, "approved");
                                  toast({ title: "Готово", description: "Запрос одобрен." });
                                } catch (e) {
                                  toast({ title: "Решение", description: e instanceof Error ? e.message : String(e) });
                                }
                              }}
                            >
                              Одобрить
                            </Button>
                            <Button
                              className="flex-1"
                              variant="destructive"
                              onClick={async () => {
                                try {
                                  await decideBrandedPartnerRequest(r.id, "rejected");
                                  toast({ title: "Готово", description: "Запрос отклонён." });
                                } catch (e) {
                                  toast({ title: "Решение", description: e instanceof Error ? e.message : String(e) });
                                }
                              }}
                            >
                              Отклонить
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Outgoing requests */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <div className="px-5 py-4">
                <p className="font-semibold">Отправленные</p>
                {requestsLoading ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                ) : outgoingRequests.length === 0 ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Нет отправленных запросов.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {outgoingRequests.map((r) => (
                      <div key={r.id} className={cn("p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                        <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>
                          Кому: {requestProfiles[r.partner_user_id]?.display_name ?? r.partner_user_id}
                        </p>
                        {r.message ? (
                          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{r.message}</p>
                        ) : null}
                        <p className={cn("text-xs mt-1", isDark ? "text-white/50" : "text-white/60")}>Статус: {r.status}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: branded_content_authors
  // -----------------------------------------------------------------------

  if (currentScreen === "branded_content_authors") {
    return (
      <>
        {renderHeader("Одобрение авторов контента")}
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            {/* Add author form */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <div className="px-5 py-4">
                <p className="font-semibold">Добавить автора</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                  Найдите пользователя по имени и одобрите.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={authorQuery}
                    onChange={(e) => setAuthorQuery(e.target.value)}
                    placeholder="Поиск по display name…"
                    className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                  />
                  <Button
                    onClick={async () => {
                      if (!isAuthed) return;
                      const q = authorQuery.trim();
                      if (q.length < 2) {
                        toast({ title: "Поиск", description: "Введите минимум 2 символа." });
                        return;
                      }
                      setAuthorSearchLoading(true);
                      try {
                        const { data, error } = await supabase
                          .from("profiles")
                          .select("user_id, display_name, avatar_url")
                          .ilike("display_name", `%${q}%`)
                          .limit(10);
                        if (error) throw error;
                        setAuthorSearchResults(data ?? []);
                      } catch (e) {
                        toast({ title: "Поиск", description: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setAuthorSearchLoading(false);
                      }
                    }}
                    disabled={authorSearchLoading}
                  >
                    Найти
                  </Button>
                </div>

                {authorSearchResults.length ? (
                  <div className="mt-4 grid gap-2">
                    {authorSearchResults.map((p) => (
                      <div key={p.user_id} className={cn("flex items-center justify-between gap-3 p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                        <div className="min-w-0">
                          <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>{p.display_name ?? p.user_id}</p>
                          <p className={cn("text-xs break-all", isDark ? "text-white/50" : "text-white/60")}>{p.user_id}</p>
                        </div>
                        <Button
                          onClick={async () => {
                            if (!isAuthed) return;
                            try {
                              await approveBrandedAuthor(user!.id, p.user_id);
                              toast({ title: "Готово", description: "Автор одобрен." });
                              setAuthorSearchResults([]);
                              setAuthorQuery("");
                              await loadApprovedAuthors();
                            } catch (e) {
                              toast({ title: "Одобрение", description: e instanceof Error ? e.message : String(e) });
                            }
                          }}
                        >
                          Одобрить
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : authorSearchLoading ? (
                  <p className={cn("text-sm mt-3", isDark ? "text-white/60" : "text-white/70")}>Поиск…</p>
                ) : null}
              </div>
            </div>

            {/* Approved authors list */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <div className="px-5 py-4">
                <p className="font-semibold">Одобренные авторы</p>
                {approvedAuthorsLoading ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                ) : approvedAuthors.length === 0 ? (
                  <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Список пуст.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {approvedAuthors.map((a) => (
                      <div key={a.id} className={cn("flex items-center justify-between gap-3 p-3 rounded-xl border", isDark ? "border-white/10" : "border-white/20")}>
                        <div className="min-w-0">
                          <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                            {approvedAuthorProfiles[a.author_user_id]?.display_name ?? a.author_user_id}
                          </p>
                          <p className={cn("text-xs", isDark ? "text-white/50" : "text-white/60")}>
                            Одобрен: {new Date(a.approved_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            if (!isAuthed) return;
                            try {
                              await revokeBrandedAuthor(user!.id, a.author_user_id);
                              toast({ title: "Готово", description: "Автор удалён из списка." });
                              await loadApprovedAuthors();
                            } catch (e) {
                              toast({ title: "Удаление", description: e instanceof Error ? e.message : String(e) });
                            }
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
