import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Moon, Sun, Bell, Lock, HelpCircle, Info, LogOut, ChevronRight, ChevronLeft, Shield, Heart, Archive, Clock, Bookmark, Eye, UserX, MessageCircle, Share2, Users, Smartphone, Key, Mail, Database, Download, FileText, Video, AlertCircle, BarChart3, Accessibility, Globe, BadgeCheck, Smile, Phone, Volume2 } from "lucide-react";
import { useTheme } from "next-themes";
import { cn, getErrorMessage } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useChatFolders, type ChatFolderItemKind } from "@/hooks/useChatFolders";
import { useConversations, type Conversation } from "@/hooks/useChat";
import { useChannels, type Channel } from "@/hooks/useChannels";
import { useGroupChats, type GroupChat } from "@/hooks/useGroupChats";
import { clearIceServerCache } from "@/lib/webrtc-config";
import {
  approveBrandedAuthor,
  createBrandedPartnerRequest,
  decideBrandedPartnerRequest,
  getCreatorInsights,
  listIncomingBrandedPartnerRequests,
  listBrandedApprovedAuthors,
  listOutgoingBrandedPartnerRequests,
  revokeBrandedAuthor,
  type BrandedPartnerRequest,
  type BrandedApprovedAuthor,
  type CreatorInsights,
} from "@/lib/user-settings";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart, ResponsiveContainer } from "recharts";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { EmojiStickerPicker } from "@/components/chat/EmojiStickerPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sha256Hex } from "@/lib/passcode";
import { revokeOtherSessions, revokeSessionById } from "@/lib/sessions";
import { useUserSessions } from "@/hooks/useUserSessions";
import { useNotificationPreferences, type NotificationCategory } from "@/hooks/useNotificationPreferences";
import { PrivacySecurityCenter } from "@/components/settings/PrivacySecurityCenter";
import { AppearanceAndEnergyCenter } from "@/components/settings/AppearanceAndEnergyCenter";
import { StickersAndReactionsCenter } from "@/components/settings/StickersAndReactionsCenter";

type Screen =
  | "main"
  | "saved"
  | "archive"
  | "activity"
  | "notifications"
  | "calls"
  | "data_storage"
  | "privacy"
  | "privacy_blocked"
  | "security_sites"
  | "security_passcode"
  | "security_cloud_password"
  | "security_account_protection"
  | "security"
  | "security_2fa"
  | "security_sessions"
  | "appearance"
  | "energy_saver"
  | "chat_folders"
  | "chat_folder_edit"
  | "profile_status"
  | "language"
  | "accessibility"
  | "statistics"
  | "stats_recommendations"
  | "stats_overview"
  | "stats_content"
  | "stats_followers"
  | "branded_content"
  | "branded_content_authors"
  | "branded_content_requests"
  | "branded_content_info"
  | "help"
  | "about";

function formatCompact(num: number) {
  if (!Number.isFinite(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} млн`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)} тыс.`;
  return `${Math.round(num)}`;
}

function dayLabel(iso: string) {
  // iso from SQL: "2026-02-19 00:00:00+00"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}`;
}

function estimateLocalStorageBytes(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      total += (key.length + value.length) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function BlockedUsersPanel({ isDark }: { isDark: boolean }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; blocked_id: string; created_at: string }>>([]);
  const [profilesById, setProfilesById] = useState<Record<string, any>>({});

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
      const list = (data ?? []) as any[];
      setRows(list);

      const ids = list.map((r) => r.blocked_id).filter(Boolean);
      if (ids.length) {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", ids);
        if (profErr) throw profErr;
        const map: Record<string, any> = {};
        for (const p of prof ?? []) map[(p as any).user_id] = p;
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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`blocked-users:${user.id}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "blocked_users",
          filter: `blocker_id=eq.${user.id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

  return (
    <div className={cn(
      "backdrop-blur-xl rounded-2xl border overflow-hidden",
      isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
    )}>
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
              <div
                key={r.id}
                className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-xl border",
                  isDark ? "border-white/10" : "border-white/20",
                )}
              >
                <div className="min-w-0">
                  <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                    {p?.display_name ?? r.blocked_id}
                  </p>
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

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");
  const [mounted, setMounted] = useState(false);

  // Telegram-like: Chat folders (Supabase)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingSelectedKeys, setEditingSelectedKeys] = useState<Set<string>>(new Set());
  const [editingHidden, setEditingHidden] = useState(false);
  const [editingPasscodeEnabled, setEditingPasscodeEnabled] = useState(false);
  const [editingPasscode, setEditingPasscode] = useState("");
  const [editingHasExistingPasscode, setEditingHasExistingPasscode] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);

  // Telegram-like: Data & storage stats
  const [storageTick, setStorageTick] = useState(0);
  const [storageBytes, setStorageBytes] = useState(() => estimateLocalStorageBytes());

  // Notifications (Telegram-like)
  const [notificationSearch, setNotificationSearch] = useState("");
  const [notificationPickerOpen, setNotificationPickerOpen] = useState(false);

  const [creatorInsights, setCreatorInsights] = useState<CreatorInsights | null>(null);
  const [creatorInsightsLoading, setCreatorInsightsLoading] = useState(false);
  const [reels, setReels] = useState<any[]>([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [followersGenderLoading, setFollowersGenderLoading] = useState(false);

  const { folders, itemsByFolderId, loading: foldersLoading, refetch: refetchFolders } = useChatFolders();
  const { conversations } = useConversations();
  const { channels } = useChannels();
  const { groups } = useGroupChats();
  const { rows: deviceSessions, loading: deviceSessionsLoading, refetch: refetchDeviceSessions } = useUserSessions();
  const {
    categoriesByKey,
    exceptions: notificationExceptions,
    loading: notificationLoading,
    upsertCategory,
    upsertException,
    removeException,
  } = useNotificationPreferences();
  const [myProfile, setMyProfile] = useState<any | null>(null);
  const [myProfileLoading, setMyProfileLoading] = useState(false);

  // Branded content approved authors
  const [approvedAuthors, setApprovedAuthors] = useState<BrandedApprovedAuthor[]>([]);
  const [approvedAuthorsLoading, setApprovedAuthorsLoading] = useState(false);
  const [approvedAuthorProfiles, setApprovedAuthorProfiles] = useState<Record<string, any>>({});
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorSearchLoading, setAuthorSearchLoading] = useState(false);
  const [authorSearchResults, setAuthorSearchResults] = useState<any[]>([]);

  // MFA / 2FA (Supabase Auth MFA - TOTP)
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaEnroll, setMfaEnroll] = useState<any | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);

  // Branded content partner requests
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerSearchResults, setPartnerSearchResults] = useState<any[]>([]);
  const [partnerSearchLoading, setPartnerSearchLoading] = useState(false);
  const [partnerRequestMessage, setPartnerRequestMessage] = useState("");
  const [outgoingRequests, setOutgoingRequests] = useState<BrandedPartnerRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<BrandedPartnerRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const isAuthed = !!user?.id;

  useEffect(() => {
    setStorageBytes(estimateLocalStorageBytes());
  }, [storageTick]);

  // Profile status (emoji/sticker)
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const statusStickerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "stats_overview" && currentScreen !== "stats_followers") return;
    if (creatorInsightsLoading) return;

    void (async () => {
      setCreatorInsightsLoading(true);
      try {
        const data = await getCreatorInsights(30);
        setCreatorInsights(data);
      } catch (e) {
        toast({ title: "Статистика", description: e instanceof Error ? e.message : String(e) });
      } finally {
        setCreatorInsightsLoading(false);
      }
    })();
  }, [creatorInsightsLoading, currentScreen, isAuthed]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = (mounted ? theme : "dark") ?? "dark";
  const isDark = currentTheme === "dark";

  const handleBack = () => {
    if (currentScreen === "main") {
      navigate(-1);
      return;
    }

    if (currentScreen === "chat_folder_edit") {
      setCurrentScreen("chat_folders");
      return;
    }

    setCurrentScreen("main");
  };

  const getDmOtherLabel = useCallback(
    (conv: Conversation) => {
      const other = (conv as any).participants?.find((p: any) => p.user_id !== user?.id);
      return other?.profile?.display_name || "Пользователь";
    },
    [user?.id],
  );

  const notificationCategoryMeta: Array<{ key: NotificationCategory; label: string; description: string }> = useMemo(
    () => [
      { key: "dm", label: "Личные чаты", description: "Уведомления из личных чатов" },
      { key: "group", label: "Группы", description: "Уведомления из групп" },
      { key: "channel", label: "Каналы", description: "Уведомления из каналов" },
      { key: "stories", label: "Истории", description: "Истории и упоминания" },
      { key: "reactions", label: "Реакции", description: "Реакции на сообщения" },
    ],
    [],
  );

  const soundOptions = useMemo(
    () => [
      { id: "rebound", label: "Rebound" },
      { id: "pop", label: "Pop" },
      { id: "note", label: "Note" },
      { id: "chime", label: "Chime" },
    ],
    [],
  );

  const notificationTargets = useMemo(() => {
    const list: Array<{ key: string; kind: "dm" | "group" | "channel"; id: string; label: string; hint: string }> = [];
    for (const conv of conversations) {
      list.push({
        key: `dm:${conv.id}`,
        kind: "dm",
        id: conv.id,
        label: getDmOtherLabel(conv),
        hint: "Личный чат",
      });
    }
    for (const group of groups) {
      list.push({
        key: `group:${group.id}`,
        kind: "group",
        id: group.id,
        label: group.name || "Группа",
        hint: "Группа",
      });
    }
    for (const channel of channels) {
      list.push({
        key: `channel:${channel.id}`,
        kind: "channel",
        id: channel.id,
        label: channel.name || "Канал",
        hint: "Канал",
      });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [channels, conversations, getDmOtherLabel, groups]);

  const filteredNotificationTargets = useMemo(() => {
    const q = notificationSearch.trim().toLowerCase();
    if (!q) return notificationTargets;
    return notificationTargets.filter((t) => t.label.toLowerCase().includes(q));
  }, [notificationSearch, notificationTargets]);

  const notificationExceptionMap = useMemo(() => {
    const map = new Map<string, typeof notificationExceptions[number]>();
    for (const ex of notificationExceptions) {
      map.set(`${ex.item_kind}:${ex.item_id}`, ex);
    }
    return map;
  }, [notificationExceptions]);

  const openCreateFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingSelectedKeys(new Set());
    setEditingHidden(false);
    setEditingPasscodeEnabled(false);
    setEditingPasscode("");
    setEditingHasExistingPasscode(false);
    setCurrentScreen("chat_folder_edit");
  };

  const openEditFolder = (folderId: string) => {
    const f = folders.find((x) => x.id === folderId);
    setEditingFolderId(folderId);
    setEditingFolderName(f?.name ?? "");
    setEditingHidden(!!f?.is_hidden);
    setEditingPasscodeEnabled(!!f?.passcode_hash);
    setEditingHasExistingPasscode(!!f?.passcode_hash);
    setEditingPasscode("");
    const sel = new Set<string>();
    for (const it of itemsByFolderId[folderId] ?? []) {
      sel.add(`${it.item_kind}:${it.item_id}`);
    }
    setEditingSelectedKeys(sel);
    setCurrentScreen("chat_folder_edit");
  };

  const saveFolder = async () => {
    if (!user?.id) return;
    const name = (editingFolderName || "Папка").trim() || "Папка";

    setFolderSaving(true);
    try {
      let folderId = editingFolderId;
      const existing = folderId ? folders.find((x) => x.id === folderId) : null;
      const isSystem = !!existing?.system_kind;

      let passcode_hash: string | null = existing?.passcode_hash ?? null;
      if (editingPasscodeEnabled) {
        if (editingPasscode.trim().length > 0) {
          passcode_hash = await sha256Hex(editingPasscode.trim());
        } else if (!editingHasExistingPasscode) {
          // enabled but no existing and no new code
          passcode_hash = null;
        }
      } else {
        passcode_hash = null;
      }

      if (!folderId) {
        const sortOrder = folders.length;
        const ins = await supabase
          .from("chat_folders")
          .insert({ user_id: user.id, name, sort_order: sortOrder, is_hidden: editingHidden, passcode_hash })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        folderId = (ins.data as any).id as string;
      } else {
        const patch: any = { is_hidden: editingHidden, passcode_hash };
        if (!isSystem) patch.name = name;
        const upd = await supabase.from("chat_folders").update(patch).eq("id", folderId);
        if (upd.error) throw upd.error;
      }

      // Only custom folders have explicit items.
      const isCustom = !existing?.system_kind;
      if (isCustom) {
        const del = await supabase.from("chat_folder_items").delete().eq("folder_id", folderId);
        if (del.error) throw del.error;

        const items = Array.from(editingSelectedKeys)
          .map((k) => {
            const [kindRaw, itemId] = k.split(":");
            const item_kind = kindRaw as ChatFolderItemKind;
            if (!itemId) return null;
            return { folder_id: folderId!, item_kind, item_id: itemId };
          })
          .filter(Boolean) as Array<{ folder_id: string; item_kind: ChatFolderItemKind; item_id: string }>;

        if (items.length) {
          const ins2 = await supabase.from("chat_folder_items").insert(items);
          if (ins2.error) throw ins2.error;
        }
      }

      toast({ title: "Готово", description: "Папка сохранена." });
      await refetchFolders();
      setCurrentScreen("chat_folders");
    } catch (e) {
      toast({ title: "Папки", description: getErrorMessage(e) });
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!user?.id) return;
    const ok = window.confirm("Удалить папку?\nЧаты не удалятся — только папка.");
    if (!ok) return;
    try {
      const del = await supabase.from("chat_folders").delete().eq("id", folderId);
      if (del.error) throw del.error;
      toast({ title: "Готово", description: "Папка удалена." });
      await refetchFolders();
      if (editingFolderId === folderId) {
        setCurrentScreen("chat_folders");
        setEditingFolderId(null);
      }
    } catch (e) {
      toast({ title: "Папки", description: getErrorMessage(e) });
    }
  };

  const toggleFolderKey = useCallback((key: string) => {
    setEditingSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const profileVerified = useMemo(() => {
    const v = myProfile?.verified;
    return typeof v === "boolean" ? v : null;
  }, [myProfile?.verified]);

  useEffect(() => {
    if (!isAuthed) return;
    if (myProfile || myProfileLoading) return;
    void (async () => {
      setMyProfileLoading(true);
      try {
        const selectWithStatus = "user_id, display_name, avatar_url, verified, status_emoji, status_sticker_url";
        const selectBase = "user_id, display_name, avatar_url, verified";

        const res = await supabase
          .from("profiles")
          .select(selectWithStatus)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (res.error) {
          const msg = getErrorMessage(res.error).toLowerCase();
          const looksLikeMissingColumn =
            msg.includes("status_emoji") ||
            msg.includes("status_sticker_url") ||
            msg.includes("does not exist") ||
            msg.includes("column");

          if (looksLikeMissingColumn) {
            const res2 = await supabase
              .from("profiles")
              .select(selectBase)
              .eq("user_id", user!.id)
              .maybeSingle();
            if (res2.error) throw res2.error;
            setMyProfile(res2.data ?? null);
          } else {
            throw res.error;
          }
        } else {
          setMyProfile(res.data ?? null);
        }
      } catch (e) {
        toast({ title: "Профиль", description: getErrorMessage(e) });
      } finally {
        setMyProfileLoading(false);
      }
    })();
  }, [isAuthed, myProfile, myProfileLoading, user]);

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
        const map: Record<string, any> = {};
        for (const p of prof ?? []) {
          map[(p as any).user_id] = p;
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

  const loadMfaState = async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await (supabase as any).auth.mfa.listFactors();
      if (error) throw error;
      const all = [...(data?.all ?? [])];
      setMfaFactors(all);
    } catch (e) {
      toast({ title: "2FA", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setMfaLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "security_2fa") return;
    void loadMfaState();
  }, [currentScreen, isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "branded_content_authors") return;
    void loadApprovedAuthors();

    const channel = supabase
      .channel(`branded-approved-authors:${user!.id}`)
      .on(
        "postgres_changes" as any,
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
    } catch (e) {
      toast({ title: "Бренд‑партнёры", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRequestsLoading(false);
    }
  }, [isAuthed, user]);

  useEffect(() => {
    if (!isAuthed) return;
    if (currentScreen !== "branded_content_requests") return;
    void loadPartnerRequests();

    const channel = supabase
      .channel(`branded-partner-requests:${user!.id}`)
      .on(
        "postgres_changes" as any,
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

  const renderHeader = (title: string, showBack: boolean = true) => (
    <div className="flex items-center gap-3 px-5 py-4">
      {showBack && (
        <button 
          onClick={handleBack}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            isDark
              ? "settings-dark-pill hover:opacity-90"
              : "bg-card/80 backdrop-blur-xl border border-border hover:bg-muted/50"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <h2 className={cn("text-xl font-semibold flex-1", !isDark && "text-white")}>{title}</h2>
      {currentScreen === "main" && (
        <button 
          onClick={() => navigate(-1)}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            isDark
              ? "settings-dark-pill hover:opacity-90"
              : "bg-card/80 backdrop-blur-xl border border-border hover:bg-muted/50"
          )}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );

  const renderMenuItem = (icon: React.ReactNode, label: string, onClick?: () => void, value?: string) => (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-5 py-3.5 transition-colors",
        isDark ? "hover:bg-white/5 active:bg-white/10" : "hover:bg-muted/50 active:bg-muted"
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {value && <span className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{value}</span>}
      <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
    </button>
  );

  const renderToggleItem = (icon: React.ReactNode, label: string, description: string, checked: boolean, onCheckedChange: (val: boolean) => void) => (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );

  const renderScreen = () => {
    switch (currentScreen) {
      case "saved":
        return (
          <>
            {renderHeader("Сохранённое")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(<Bookmark className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Все публикации")}
                {renderMenuItem(<Heart className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Понравившиеся")}
              </div>
              <p className={cn("p-5 text-center text-sm", isDark ? "text-white/60" : "text-white/60")}>
                Создавайте коллекции для сохранённых публикаций
              </p>
            </div>
          </>
        );

      case "archive":
        return (
          <>
            {renderHeader("Архив")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Архив историй")}
                {renderMenuItem(<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Архив публикаций")}
                {renderMenuItem(<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Архив прямых эфиров")}
              </div>
            </div>
          </>
        );

      case "activity":
        return (
          <>
            {renderHeader("Ваша активность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(<Clock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Время в приложении", undefined, "1ч 23м")}
                {renderMenuItem(<Heart className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Лайки")}
                {renderMenuItem(<MessageCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Комментарии")}
                {renderMenuItem(<Share2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Репосты")}
                {renderMenuItem(<Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Скачать данные")}
              </div>
            </div>
          </>
        );

      case "notifications":
        return (
          <>
            {renderHeader("Уведомления")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 grid gap-3">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Общие</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Общий звук и предпросмотр уведомлений.
                    </p>
                  </div>

                  <div className={cn("px-5 pb-4", isDark ? "text-white" : "text-white")}>
                    <div className="grid gap-2">
                      <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/70")}>Звук</p>
                      <Select
                        value={settings?.notif_sound_id ?? "rebound"}
                        onValueChange={async (val) => {
                          if (!isAuthed) return;
                          await updateSettings({ notif_sound_id: val });
                        }}
                      >
                        <SelectTrigger className={cn(
                          "w-full",
                          isDark ? "settings-dark-pill" : "bg-card/80 border-white/20",
                        )}>
                          <SelectValue placeholder="Выберите звук" />
                        </SelectTrigger>
                        <SelectContent>
                          {soundOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {renderToggleItem(
                    <Volume2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Вибрация",
                    "Включить вибрацию для уведомлений",
                    !!settings?.notif_vibrate,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ notif_vibrate: val });
                    }
                  )}
                  {renderToggleItem(
                    <Bell className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Показывать текст",
                    "Показывать текст сообщения в уведомлении",
                    settings?.notif_show_text ?? true,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ notif_show_text: val });
                    }
                  )}
                  {renderToggleItem(
                    <MessageCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Показывать отправителя",
                    "Показывать имя отправителя",
                    settings?.notif_show_sender ?? true,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ notif_show_sender: val });
                    }
                  )}
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Категории чатов</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Отдельные настройки для разных типов чатов.
                    </p>
                  </div>
                  <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                    {notificationCategoryMeta.map((meta) => {
                      const row = categoriesByKey.get(meta.key);
                      const enabled = row?.is_enabled ?? true;
                      const icon = meta.key === "dm"
                        ? <MessageCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />
                        : meta.key === "group"
                        ? <Users className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />
                        : meta.key === "channel"
                        ? <Share2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />
                        : meta.key === "stories"
                        ? <Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />
                        : <Smile className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />;

                      return (
                        <div key={meta.key}>
                          {renderToggleItem(
                            icon,
                            meta.label,
                            meta.description,
                            enabled,
                            async (val) => {
                              if (!isAuthed) return;
                              await upsertCategory(meta.key, { is_enabled: val });
                            }
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Исключения</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Исключения перекрывают настройки категорий.
                    </p>
                  </div>

                  <div className="px-5 pb-4">
                    <Button
                      variant="secondary"
                      onClick={() => setNotificationPickerOpen((prev) => !prev)}
                    >
                      {notificationPickerOpen ? "Скрыть список" : "Добавить исключение"}
                    </Button>
                  </div>

                  {notificationPickerOpen && (
                    <div className={cn("px-5 pb-5 border-t", isDark ? "border-white/10" : "border-white/20")}>
                      <Input
                        placeholder="Поиск чатов, групп или каналов"
                        value={notificationSearch}
                        onChange={(e) => setNotificationSearch(e.target.value)}
                        className={cn("mt-4", isDark ? "settings-dark-pill" : "bg-card/80 border-white/20")}
                      />
                      <div className="mt-3 grid gap-2 max-h-72 overflow-y-auto native-scroll">
                        {filteredNotificationTargets.map((target) => {
                          const hasException = notificationExceptionMap.has(target.key);
                          return (
                            <label
                              key={target.key}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-xl border",
                                isDark ? "border-white/10" : "border-white/20",
                              )}
                            >
                              <Checkbox
                                checked={hasException}
                                onCheckedChange={async (val) => {
                                  if (!isAuthed) return;
                                  const next = Boolean(val);
                                  if (next) {
                                    await upsertException(target.kind, target.id, { is_muted: true });
                                  } else {
                                    await removeException(target.kind, target.id);
                                  }
                                }}
                              />
                              <div className="min-w-0">
                                <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>{target.label}</p>
                                <p className={cn("text-xs", isDark ? "text-white/60" : "text-white/70")}>{target.hint}</p>
                              </div>
                            </label>
                          );
                        })}
                        {!filteredNotificationTargets.length && (
                          <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Ничего не найдено.</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                    {notificationLoading ? (
                      <div className="px-5 py-4">
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                      </div>
                    ) : notificationExceptions.length === 0 ? (
                      <div className="px-5 py-4">
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Исключений нет.</p>
                      </div>
                    ) : (
                      notificationExceptions.map((ex) => {
                        const key = `${ex.item_kind}:${ex.item_id}`;
                        const target = notificationTargets.find((t) => t.key === key);
                        const title = target?.label ?? ex.item_id;
                        const hint = target?.hint ?? "Исключение";
                        return (
                          <div
                            key={ex.id}
                            className={cn(
                              "px-5 py-4 flex items-center justify-between gap-3",
                              isDark ? "hover:bg-white/5" : "hover:bg-muted/30",
                              "border-b",
                              isDark ? "border-white/10" : "border-white/20",
                            )}
                          >
                            <div className="min-w-0">
                              <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>{title}</p>
                              <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{hint}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={!ex.is_muted}
                                onCheckedChange={async (val) => {
                                  if (!isAuthed) return;
                                  await upsertException(ex.item_kind, ex.item_id, { is_muted: !val });
                                }}
                              />
                              <Button
                                variant="ghost"
                                onClick={async () => {
                                  if (!isAuthed) return;
                                  await removeException(ex.item_kind, ex.item_id);
                                }}
                              >
                                Удалить
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Активность</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Отдельные уведомления для активности в ленте.
                    </p>
                  </div>
                  {renderToggleItem(
                    <Bell className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Push-уведомления",
                    "Получать уведомления на устройство",
                    !!settings?.push_notifications,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ push_notifications: val });
                    }
                  )}
                  {renderToggleItem(
                    <Heart className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Лайки",
                    "Уведомлять о новых лайках",
                    !!settings?.likes_notifications,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ likes_notifications: val });
                    }
                  )}
                  {renderToggleItem(
                    <MessageCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Комментарии",
                    "Уведомлять о новых комментариях",
                    !!settings?.comments_notifications,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ comments_notifications: val });
                    }
                  )}
                  {renderToggleItem(
                    <Users className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Подписчики",
                    "Уведомлять о новых подписчиках",
                    !!settings?.followers_notifications,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ followers_notifications: val });
                    }
                  )}
                </div>
              </div>
            </div>
          </>
        );

      case "calls":
        return (
          <>
            {renderHeader("Звонки")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 grid gap-3">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  {renderToggleItem(
                    <Phone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Вкладка звонков",
                    "Показывать звонки рядом с чатами",
                    settings?.show_calls_tab ?? true,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ show_calls_tab: val });
                    }
                  )}
                </div>
              </div>
            </div>
          </>
        );

      case "data_storage":
        return (
          <>
            {renderHeader("Данные и память")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 grid gap-3">
                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                  )}
                >
                  <div className="px-5 py-4">
                    <p className="font-semibold">Память на устройстве</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Local cache (localStorage): {formatBytes(storageBytes)}
                    </p>
                  </div>

                  <div className="px-5 pb-5 flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const prefixes = ["chat.hiddenMessages.v1.", "chat.pinnedMessage.v1."];
                        let removed = 0;
                        try {
                          const keys: string[] = [];
                          for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k) keys.push(k);
                          }
                          for (const k of keys) {
                            if (prefixes.some((p) => k.startsWith(p))) {
                              localStorage.removeItem(k);
                              removed++;
                            }
                          }
                        } catch {
                          // ignore
                        }
                        toast({ title: "Готово", description: `Кэш чатов очищен (${removed}).` });
                        setStorageTick((x) => x + 1);
                      }}
                    >
                      Очистить кэш чатов
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!user?.id) {
                          toast({ title: "Папки", description: "Нужно войти в аккаунт." });
                          return;
                        }
                        void (async () => {
                          try {
                            const ok = window.confirm("Удалить все папки чатов?\nЧаты не удалятся — только папки.");
                            if (!ok) return;
                            const { error } = await supabase.from("chat_folders").delete().eq("user_id", user.id);
                            if (error) throw error;
                            toast({ title: "Готово", description: "Папки чатов удалены." });
                            await refetchFolders();
                          } catch (e) {
                            toast({ title: "Папки", description: getErrorMessage(e) });
                          }
                        })();
                      }}
                    >
                      Удалить папки чатов
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => {
                        clearIceServerCache();
                        toast({ title: "Готово", description: "Кэш звонков (ICE/TURN) очищен." });
                      }}
                    >
                      Очистить кэш звонков
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  {renderToggleItem(
                    <Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Автозагрузка медиа",
                    "Автоматически загружать фото/видео в чатах",
                    settings?.media_auto_download_enabled ?? true,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ media_auto_download_enabled: val });
                    },
                  )}

                  {(settings?.media_auto_download_enabled ?? true) && (
                    <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                      {renderToggleItem(
                        <FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                        "Фото",
                        "Загружать изображения автоматически",
                        settings?.media_auto_download_photos ?? true,
                        async (val) => {
                          if (!isAuthed) return;
                          await updateSettings({ media_auto_download_photos: val });
                        },
                      )}
                      {renderToggleItem(
                        <Video className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                        "Видео",
                        "Загружать видео автоматически",
                        settings?.media_auto_download_videos ?? true,
                        async (val) => {
                          if (!isAuthed) return;
                          await updateSettings({ media_auto_download_videos: val });
                        },
                      )}
                      {renderToggleItem(
                        <Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                        "Файлы",
                        "Загружать файлы автоматически",
                        settings?.media_auto_download_files ?? true,
                        async (val) => {
                          if (!isAuthed) return;
                          await updateSettings({ media_auto_download_files: val });
                        },
                      )}

                      <div className={cn(
                        "px-5 py-4",
                        isDark ? "text-white" : "text-white",
                        "border-t",
                        isDark ? "border-white/10" : "border-white/20",
                      )}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">Лимит для файлов</p>
                            <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                              До {(settings?.media_auto_download_files_max_mb ?? 3)} МБ
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <Slider
                            value={[settings?.media_auto_download_files_max_mb ?? 3]}
                            min={1}
                            max={50}
                            step={1}
                            onValueCommit={async (vals) => {
                              const v = Math.max(1, Math.round(vals[0] ?? 3));
                              if (!isAuthed) return;
                              await updateSettings({ media_auto_download_files_max_mb: v });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  <div className="px-5 py-4">
                    <p className="font-semibold">Кэш</p>
                  </div>

                  {renderToggleItem(
                    <Database className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Ограничить размер кэша",
                    "Если выключено — лимит автоматически",
                    settings?.cache_max_size_mb != null,
                    async (val) => {
                      if (!isAuthed) return;
                      await updateSettings({ cache_max_size_mb: val ? 500 : null });
                    },
                  )}

                  {settings?.cache_max_size_mb != null && (
                    <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">Максимум</p>
                          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                            {settings.cache_max_size_mb} МБ
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Slider
                          value={[settings.cache_max_size_mb]}
                          min={100}
                          max={5000}
                          step={50}
                          onValueCommit={async (vals) => {
                            const v = Math.max(100, Math.round(vals[0] ?? 500));
                            if (!isAuthed) return;
                            await updateSettings({ cache_max_size_mb: v });
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">Автоудаление кэша</p>
                        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          {(settings?.cache_auto_delete_days ?? 7) === 0 ? "Никогда" : `Через ${(settings?.cache_auto_delete_days ?? 7)} дн.`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Slider
                        value={[settings?.cache_auto_delete_days ?? 7]}
                        min={0}
                        max={30}
                        step={1}
                        onValueCommit={async (vals) => {
                          const v = Math.max(0, Math.round(vals[0] ?? 7));
                          if (!isAuthed) return;
                          await updateSettings({ cache_auto_delete_days: v });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      case "privacy":
        return (
          <>
            {renderHeader("Конфиденциальность")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <PrivacySecurityCenter mode="privacy" isDark={isDark} onOpenBlocked={() => setCurrentScreen("privacy_blocked")} />
            </div>
          </>
        );
      case "privacy_blocked":
        return (
          <>
            {renderHeader("Заблокированные")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4">
                <BlockedUsersPanel isDark={isDark} />
              </div>
            </div>
          </>
        );
      case "security":
        return (
          <>
            {renderHeader("Безопасность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(
                  <Key className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Код-пароль",
                  () => setCurrentScreen("security_passcode"),
                )}
                {renderMenuItem(
                  <Shield className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Облачный пароль",
                  () => setCurrentScreen("security_cloud_password"),
                )}
                {renderMenuItem(
                  <Shield className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Защита аккаунта",
                  () => setCurrentScreen("security_account_protection"),
                )}
                {renderMenuItem(
                  <Shield className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Двухэтапная аутентификация",
                  () => setCurrentScreen("security_2fa"),
                )}
              </div>
              <div className={cn(
                "mx-4 mt-3 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(
                  <Smartphone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Активные сеансы",
                  () => setCurrentScreen("security_sessions"),
                )}
                {renderMenuItem(
                  <Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Сайты",
                  () => setCurrentScreen("security_sites"),
                )}
                {renderMenuItem(<Mail className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Письма от нас")}
                {renderMenuItem(<Database className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Данные аккаунта")}
              </div>
            </div>
          </>
        );

      case "security_sites":
        return (
          <>
            {renderHeader("Сайты")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <PrivacySecurityCenter mode="sites" isDark={isDark} />
            </div>
          </>
        );

      case "security_passcode":
        return (
          <>
            {renderHeader("Код-пароль")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <PrivacySecurityCenter mode="passcode" isDark={isDark} />
            </div>
          </>
        );

      case "security_cloud_password":
        return (
          <>
            {renderHeader("Облачный пароль")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <PrivacySecurityCenter mode="cloud_password" isDark={isDark} />
            </div>
          </>
        );

      case "security_account_protection":
        return (
          <>
            {renderHeader("Защита аккаунта")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <PrivacySecurityCenter mode="account_protection" isDark={isDark} />
            </div>
          </>
        );
      case "security_sessions":
        return (
          <>
            {renderHeader("Активные сеансы")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Это устройство</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      {navigator.userAgent}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Завершить другие сеансы</p>
                      <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        Выйдет со всех других устройств. Это устройство останется.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          if (!user?.id) return;
                          const { data } = await (supabase as any).auth.getSession();
                          if (!data?.session) return;

                          await revokeOtherSessions({ userId: user.id, session: data.session });
                          const { error } = await (supabase as any).auth.signOut({ scope: "others" });
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
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Если сеанс неактивен
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[7, 30, 90, 180].map((days) => (
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

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
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

      case "profile_status":
        return (
          <>
            {renderHeader("Стикеры и эмодзи")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <StickersAndReactionsCenter userId={user?.id ?? null} isDark={isDark} />
              <div className="px-4 grid gap-3">
                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  <div className="px-5 py-4">
                    <p className="font-semibold">Эмодзи статуса</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Отображается рядом с вашим именем.
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className={cn("text-3xl leading-none", isDark ? "text-white" : "text-white")}>
                        {myProfile?.status_emoji ?? "—"}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setStatusEmojiPickerOpen(true)}
                          disabled={!isAuthed || statusSaving}
                        >
                          Выбрать
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            if (!isAuthed) return;
                            setStatusSaving(true);
                            try {
                              const { error } = await supabase
                                .from("profiles")
                                .update({ status_emoji: null })
                                .eq("user_id", user!.id);
                              if (error) throw error;
                              setMyProfile((prev: any) => ({ ...(prev ?? {}), status_emoji: null }));
                            } catch (e) {
                              toast({ title: "Статус", description: e instanceof Error ? e.message : String(e) });
                            } finally {
                              setStatusSaving(false);
                            }
                          }}
                          disabled={!isAuthed || statusSaving}
                        >
                          Очистить
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  <div className="px-5 py-4">
                    <p className="font-semibold">Стикер статуса</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Показывается рядом с аватаром.
                    </p>

                    {myProfile?.status_sticker_url ? (
                      <div className="mt-3 flex items-center gap-3">
                        <img
                          src={myProfile.status_sticker_url}
                          alt="status sticker"
                          className="w-16 h-16 rounded-2xl object-cover bg-white/10 border border-white/20"
                        />
                        <div className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                          Стикер выбран
                        </div>
                      </div>
                    ) : (
                      <p className={cn("text-sm mt-3", isDark ? "text-white/60" : "text-white/70")}>
                        Стикер не выбран.
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        onClick={() => statusStickerInputRef.current?.click()}
                        disabled={!isAuthed || statusSaving}
                      >
                        Загрузить
                      </Button>
                      {myProfile?.status_sticker_url ? (
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            if (!isAuthed) return;
                            setStatusSaving(true);
                            try {
                              const { error } = await supabase
                                .from("profiles")
                                .update({ status_sticker_url: null })
                                .eq("user_id", user!.id);
                              if (error) throw error;
                              setMyProfile((prev: any) => ({ ...(prev ?? {}), status_sticker_url: null }));
                            } catch (e) {
                              toast({ title: "Статус", description: e instanceof Error ? e.message : String(e) });
                            } finally {
                              setStatusSaving(false);
                            }
                          }}
                          disabled={!isAuthed || statusSaving}
                        >
                          Удалить
                        </Button>
                      ) : null}

                      <input
                        ref={statusStickerInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          if (!isAuthed) return;
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setStatusSaving(true);
                          try {
                            const ext = (file.name.split(".").pop() || "png").toLowerCase();
                            const fileName = `${user!.id}-${Date.now()}.${ext}`;
                            const filePath = `status-stickers/${fileName}`;

                            const { error: uploadError } = await supabase.storage
                              .from("post-media")
                              .upload(filePath, file, { upsert: true });
                            if (uploadError) throw uploadError;

                            const { data: urlData } = supabase.storage
                              .from("post-media")
                              .getPublicUrl(filePath);
                            const publicUrl = urlData.publicUrl;

                            const { error: updError } = await supabase
                              .from("profiles")
                              .update({ status_sticker_url: publicUrl })
                              .eq("user_id", user!.id);
                            if (updError) throw updError;

                            setMyProfile((prev: any) => ({ ...(prev ?? {}), status_sticker_url: publicUrl }));
                          } catch (err) {
                            toast({ title: "Стикер", description: err instanceof Error ? err.message : String(err) });
                          } finally {
                            setStatusSaving(false);
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <EmojiStickerPicker
                open={statusEmojiPickerOpen}
                onOpenChange={setStatusEmojiPickerOpen}
                onEmojiSelect={async (emoji) => {
                  if (!isAuthed) return;
                  setStatusSaving(true);
                  try {
                    const { error } = await supabase
                      .from("profiles")
                      .update({ status_emoji: emoji })
                      .eq("user_id", user!.id);
                    if (error) throw error;
                    setMyProfile((prev: any) => ({ ...(prev ?? {}), status_emoji: emoji }));
                    setStatusEmojiPickerOpen(false);
                  } catch (e) {
                    toast({ title: "Эмодзи", description: e instanceof Error ? e.message : String(e) });
                  } finally {
                    setStatusSaving(false);
                  }
                }}
              />
            </div>
          </>
        );

      case "security_2fa": {
        const verifiedFactors = mfaFactors.filter((f: any) => f.status === "verified");
        const totpFactor = verifiedFactors.find((f: any) => f.factor_type === "totp") ?? null;

        return (
          <>
            {renderHeader("Двухфакторная аутентификация")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <div className="px-5 py-4">
                    <p className="font-semibold">Статус</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      {mfaLoading
                        ? "Загрузка…"
                        : totpFactor
                          ? "Включено (TOTP)"
                          : "Не включено"}
                    </p>
                  </div>
                </div>

                {!totpFactor && !mfaEnroll ? (
                  <div className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}>
                    <div className="px-5 py-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">Включить 2FA (TOTP)</p>
                        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          Используйте Google Authenticator / 1Password / Authy.
                        </p>
                      </div>
                      <Button
                        onClick={async () => {
                          setMfaLoading(true);
                          try {
                            const { data, error } = await (supabase as any).auth.mfa.enroll({ factorType: "totp" });
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
                  <div className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}>
                    <div className="px-5 py-4">
                      <p className="font-semibold">Шаг 1. Сканируйте QR</p>
                      <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        Сканируйте QR код в приложении‑аутентификаторе.
                      </p>

                      <div className="mt-4 flex items-center justify-center">
                        {mfaEnroll?.totp?.qr_code ? (
                          mfaEnroll.totp.qr_code.startsWith("data:") ? (
                            <img
                              src={mfaEnroll.totp.qr_code}
                              alt="2FA QR"
                              className={cn(
                                "rounded-xl border p-3 bg-white",
                                isDark ? "border-white/10" : "border-white/20",
                              )}
                            />
                          ) : (
                            <div
                              className={cn(
                                "rounded-xl border p-3 bg-white",
                                isDark ? "border-white/10" : "border-white/20",
                              )}
                              dangerouslySetInnerHTML={{ __html: mfaEnroll.totp.qr_code }}
                            />
                          )
                        ) : (
                          <div className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                            QR недоступен. Используйте URI ниже.
                          </div>
                        )}
                      </div>

                      {mfaEnroll?.totp?.uri ? (
                        <div className={cn("mt-4 p-3 rounded-xl border text-xs break-all", isDark ? "border-white/10 text-white/70" : "border-white/20 text-white/80")}>
                          {mfaEnroll.totp.uri}
                        </div>
                      ) : null}

                      <div className="mt-6">
                        <p className="font-semibold">Шаг 2. Введите код</p>
                        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          Введите 6‑значный код из приложения.
                        </p>

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
                                const { data: challenge, error: chErr } = await (supabase as any).auth.mfa.challenge({
                                  factorId: mfaEnroll.id,
                                });
                                if (chErr) throw chErr;

                                const challengeId = challenge?.id;
                                setMfaChallengeId(challengeId);

                                const { error: vErr } = await (supabase as any).auth.mfa.verify({
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
                  <div className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden mt-3",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}>
                    <div className="px-5 py-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">Отключить 2FA</p>
                        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          Удалит фактор TOTP и вернёт вход только по паролю/OTP.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          setMfaLoading(true);
                          try {
                            const { error } = await (supabase as any).auth.mfa.unenroll({ factorId: totpFactor.id });
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
      case "appearance":
        return (
          <>
            {renderHeader("Оформление")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <AppearanceAndEnergyCenter
                mode="appearance"
                userId={user?.id ?? null}
                isDark={isDark}
                onOpenEnergy={() => setCurrentScreen("energy_saver")}
              />
            </div>
          </>
        );

      case "energy_saver":
        return (
          <>
            {renderHeader("Энергосбережение")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <AppearanceAndEnergyCenter
                mode="energy"
                userId={user?.id ?? null}
                isDark={isDark}
              />
            </div>
          </>
        );
      case "chat_folders":
        return (
          <>
            {renderHeader("Папки с чатами")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 grid gap-3">
                <div
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  <div className="px-5 py-4">
                    <p className="font-semibold">Папки</p>
                    <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                      Создавайте папки и выбирайте, какие чаты в них показывать.
                    </p>
                  </div>

                  <div className="px-5 pb-5 grid gap-2">
                    <Button
                      variant="secondary"
                      onClick={openCreateFolder}
                    >
                      Создать папку
                    </Button>

                    {foldersLoading ? (
                      <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                    ) : folders.length === 0 ? (
                      <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                        Пока нет папок.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {folders.map((f) => {
                          const count = (itemsByFolderId[f.id]?.length ?? 0);
                          const isSystem = !!f.system_kind;
                          return (
                            <div
                              key={f.id}
                              className={cn(
                                "flex items-center justify-between gap-3 p-3 rounded-xl border",
                                isDark ? "border-white/10" : "border-white/20",
                              )}
                            >
                              <button
                                onClick={() => openEditFolder(f.id)}
                                className="flex-1 min-w-0 text-left"
                              >
                                <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>{f.name}</p>
                                <p className={cn("text-xs mt-0.5", isDark ? "text-white/50" : "text-white/70")}>
                                  {isSystem ? "Системная папка" : `${count} ${count === 1 ? "чат" : count > 1 && count < 5 ? "чата" : "чатов"}`}
                                </p>
                              </button>
                              <div className="flex items-center gap-2">
                                <Button variant="secondary" onClick={() => openEditFolder(f.id)}>
                                  Изм.
                                </Button>
                                {!isSystem && (
                                  <Button variant="secondary" onClick={() => void deleteFolder(f.id)}>
                                    Удалить
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case "chat_folder_edit":
        {
          const f = editingFolderId ? folders.find((x) => x.id === editingFolderId) : null;
          const isSystem = !!f?.system_kind;
          return (
            <>
              {renderHeader(editingFolderId ? "Изменить папку" : "Новая папка")}
              <div className="flex-1 overflow-y-auto native-scroll pb-8">
                <div className="px-4 grid gap-3">
                  <div
                    className={cn(
                      "backdrop-blur-xl rounded-2xl border overflow-hidden",
                      isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                    )}
                  >
                    <div className="px-5 py-4">
                      <p className="font-semibold">Название</p>
                    </div>
                    <div className="px-5 pb-5">
                      <Input
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        placeholder="Например: Работа"
                        disabled={isSystem}
                        className={cn(isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40")}
                      />
                      {isSystem && (
                        <p className={cn("text-xs mt-2", isDark ? "text-white/50" : "text-white/70")}>
                          Это системная папка. Чаты распределяются автоматически.
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "backdrop-blur-xl rounded-2xl border overflow-hidden",
                      isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                    )}
                  >
                    {renderToggleItem(
                      <Eye className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                      "Скрыть папку",
                      "Не показывать вкладку в списке чатов",
                      editingHidden,
                      async (val) => {
                        setEditingHidden(val);
                      },
                    )}

                    {renderToggleItem(
                      <Lock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                      "Доступ по паролю",
                      "Запрашивать пароль при открытии вкладки",
                      editingPasscodeEnabled,
                      async (val) => {
                        setEditingPasscodeEnabled(val);
                        if (!val) {
                          setEditingPasscode("");
                        }
                      },
                    )}

                    {editingPasscodeEnabled && (
                      <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                        <p className="font-medium">Пароль</p>
                        <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          {editingHasExistingPasscode
                            ? "Оставь пустым, чтобы не менять."
                            : "Задай пароль для папки."}
                        </p>
                        <Input
                          value={editingPasscode}
                          onChange={(e) => setEditingPasscode(e.target.value)}
                          placeholder="Пароль"
                          type="password"
                          className={cn(
                            "mt-3",
                            isDark && "bg-white/5 border-white/10 text-white placeholder:text-white/40",
                          )}
                        />
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      "backdrop-blur-xl rounded-2xl border overflow-hidden",
                      isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                    )}
                  >
                    <div className="px-5 py-4">
                      <p className="font-semibold">Чаты</p>
                      <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        Выберите, какие чаты показывать в этой папке.
                      </p>
                    </div>

                    <div className="px-5 pb-5 grid gap-2">
                      {isSystem ? (
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                          В системных папках список формируется автоматически.
                        </p>
                      ) : (
                        <>
                          <div className="grid gap-1">
                            <p className={cn("text-xs font-medium", isDark ? "text-white/50" : "text-white/70")}>
                              Личные
                            </p>
                            {conversations.length === 0 ? (
                              <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                                Нет диалогов.
                              </p>
                            ) : (
                              <div className="grid gap-2">
                                {conversations.map((conv) => {
                                  const key = `dm:${conv.id}`;
                                  const checked = editingSelectedKeys.has(key);
                                  return (
                                    <button
                                      key={conv.id}
                                      onClick={() => toggleFolderKey(key)}
                                      className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl border text-left",
                                        isDark
                                          ? "border-white/10 hover:bg-white/5"
                                          : "border-white/20 hover:bg-muted/40",
                                      )}
                                    >
                                      <Checkbox checked={checked} />
                                      <span className={cn("flex-1 truncate", isDark ? "text-white" : "text-white")}>
                                        {getDmOtherLabel(conv)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="grid gap-1 mt-2">
                            <p className={cn("text-xs font-medium", isDark ? "text-white/50" : "text-white/70")}>
                              Группы
                            </p>
                            {groups.length === 0 ? (
                              <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                                Нет групп.
                              </p>
                            ) : (
                              <div className="grid gap-2">
                                {groups.map((g: GroupChat) => {
                                  const key = `group:${g.id}`;
                                  const checked = editingSelectedKeys.has(key);
                                  return (
                                    <button
                                      key={g.id}
                                      onClick={() => toggleFolderKey(key)}
                                      className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl border text-left",
                                        isDark
                                          ? "border-white/10 hover:bg-white/5"
                                          : "border-white/20 hover:bg-muted/40",
                                      )}
                                    >
                                      <Checkbox checked={checked} />
                                      <span className={cn("flex-1 truncate", isDark ? "text-white" : "text-white")}>
                                        {g.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="grid gap-1 mt-2">
                            <p className={cn("text-xs font-medium", isDark ? "text-white/50" : "text-white/70")}>
                              Каналы
                            </p>
                            {channels.length === 0 ? (
                              <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                                Нет каналов.
                              </p>
                            ) : (
                              <div className="grid gap-2">
                                {channels.map((c: Channel) => {
                                  const key = `channel:${c.id}`;
                                  const checked = editingSelectedKeys.has(key);
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={() => toggleFolderKey(key)}
                                      className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl border text-left",
                                        isDark
                                          ? "border-white/10 hover:bg-white/5"
                                          : "border-white/20 hover:bg-muted/40",
                                      )}
                                    >
                                      <Checkbox checked={checked} />
                                      <span className={cn("flex-1 truncate", isDark ? "text-white" : "text-white")}>
                                        {c.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Button onClick={() => void saveFolder()} disabled={!isAuthed || folderSaving}>
                      {folderSaving ? "Сохраняю…" : "Сохранить"}
                    </Button>

                    {editingFolderId && !isSystem && (
                      <Button
                        variant="secondary"
                        onClick={() => void deleteFolder(editingFolderId)}
                        disabled={folderSaving}
                      >
                        Удалить папку
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        }

      case "accessibility":
        return (
          <>
            {renderHeader("Доступность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
              )}>
                {renderToggleItem(
                  <Accessibility className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Уменьшить анимации",
                  "Respect prefers-reduced-motion",
                  !!settings?.reduce_motion,
                  async (val) => {
                    if (!isAuthed) return;
                    await updateSettings({ reduce_motion: val });
                  },
                )}
                {renderToggleItem(
                  <Eye className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Высокий контраст",
                  "Для лучшей читаемости",
                  !!settings?.high_contrast,
                  async (val) => {
                    if (!isAuthed) return;
                    await updateSettings({ high_contrast: val });
                  },
                )}
              </div>
            </div>
          </>
        );

      case "language":
        return (
          <>
            {renderHeader("Язык")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div
                className={cn(
                  "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}
              >
                {[
                  { code: "ru", label: "Русский" },
                  { code: "en", label: "English" },
                ].map((item) =>
                  renderMenuItem(
                    <Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    item.label,
                    async () => {
                      if (!isAuthed) return;
                      await updateSettings({ language_code: item.code });
                    },
                    settings?.language_code === item.code ? "✓" : undefined,
                  ),
                )}
              </div>
            </div>
          </>
        );

      case "statistics":
        return (
          <>
            {renderHeader("Статистика")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
              )}>
                {renderMenuItem(
                  <BarChart3 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Обзор",
                  async () => {
                    setCurrentScreen("stats_overview");
                    if (!creatorInsights && isAuthed) {
                      setCreatorInsightsLoading(true);
                      try {
                        const data = await getCreatorInsights(30);
                        setCreatorInsights(data);
                      } catch (e) {
                        toast({ title: "Статистика", description: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setCreatorInsightsLoading(false);
                      }
                    }
                  },
                )}
                {renderMenuItem(
                  <Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Рекомендации",
                  () => setCurrentScreen("stats_recommendations"),
                )}
                {renderMenuItem(
                  <FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Контент",
                  async () => {
                    setCurrentScreen("stats_content");
                    if (isAuthed) {
                      setReelsLoading(true);
                      try {
                        const { data, error } = await supabase
                          .from("reels")
                          .select("id, description, thumbnail_url, video_url, created_at, views_count, likes_count, comments_count")
                          .eq("author_id", user!.id)
                          .order("created_at", { ascending: false })
                          .limit(50);
                        if (error) throw error;
                        setReels(data ?? []);
                      } catch (e) {
                        toast({ title: "Контент", description: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setReelsLoading(false);
                      }
                    }
                  },
                )}
                {renderMenuItem(
                  <Users className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Подписчики",
                  async () => {
                    setCurrentScreen("stats_followers");
                    // gender/activity uses the extended RPC via creatorInsights
                    if (!creatorInsights && isAuthed) {
                      setFollowersGenderLoading(true);
                      try {
                        const data = await getCreatorInsights(30);
                        setCreatorInsights(data);
                      } catch (e) {
                        toast({ title: "Подписчики", description: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setFollowersGenderLoading(false);
                      }
                    }
                  },
                )}
                {renderMenuItem(
                  <BadgeCheck className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                  "Брендированный контент",
                  () => setCurrentScreen("branded_content"),
                )}
              </div>
            </div>
          </>
        );

      case "stats_recommendations":
        return (
          <>
            {renderHeader("Рекомендации")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-5 pt-2 pb-4">
                <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                  Посмотрите рекомендации прямо из первоисточника, которые помогут вам творить, развиваться и процветать.
                </p>
              </div>
              <div className="px-4 grid gap-3">
                {[{ title: "Создание", count: "14 видео" }, { title: "Вовлеченность", count: "7 видео" }, { title: "Охват", count: "6 видео" }, { title: "Монетизация", count: "4 видео" }, { title: "Руководство", count: "" }].map((item) => (
                  <div
                    key={item.title}
                    className={cn(
                      "backdrop-blur-xl rounded-2xl border px-5 py-4 flex items-center justify-between",
                      isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                    )}
                  >
                    <div>
                      <p className="text-lg font-semibold">{item.title}</p>
                      {item.count ? <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{item.count}</p> : null}
                    </div>
                    <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
                  </div>
                ))}
              </div>
            </div>
          </>
        );

      case "stats_overview": {
        const viewsByDay = (creatorInsights?.views_by_day ?? []).map((p) => ({
          day: dayLabel(p.day),
          views: p.views,
        }));
        const viewsByHour = (creatorInsights?.views_by_hour ?? []).map((p) => ({
          hour: `${p.hour}`,
          views: p.views,
        }));

        return (
          <>
            {renderHeader("Обзор")}
            <div className="flex-1 overflow-y-auto native-scroll pb-10">
              <div className="px-5 pt-2 pb-4">
                <p className={cn("text-2xl font-semibold", isDark ? "text-white" : "text-white")}>У вас был удачный период!</p>
                <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>
                  Показатели за последние 30 дней.
                </p>
              </div>

              <div className="px-4 grid gap-3">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-5 py-5",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  {creatorInsightsLoading ? (
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>Загрузка…</p>
                  ) : (
                    <div className="grid gap-6">
                      <div>
                        <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.views_total ?? 0)}</p>
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Просмотры</p>
                      </div>
                      <div>
                        <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{Math.round(creatorInsights?.views_non_followers_pct ?? 0)}%</p>
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Просмотры от неподписчиков</p>
                      </div>
                      <div>
                        <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.likes_total ?? 0)}</p>
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Лайки</p>
                      </div>
                      <div>
                        <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.comments_total ?? 0)}</p>
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Комментарии</p>
                      </div>
                      <div>
                        <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.followers_total ?? 0)}</p>
                        <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Подписчики</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-5 py-4",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <p className="font-semibold mb-3">Лучший контент</p>
                  {creatorInsightsLoading ? (
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                  ) : (creatorInsights?.top_reels?.length ?? 0) === 0 ? (
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Пока нет данных.</p>
                  ) : (
                    <div className="grid gap-3">
                      {(creatorInsights?.top_reels ?? []).slice(0, 3).map((t) => (
                        <div key={t.reel_id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                              {(t.description ?? "Reel").toString().slice(0, 60) || "Reel"}
                            </p>
                            <p className={cn("text-xs", isDark ? "text-white/60" : "text-white/70")}>
                              Просмотры: {formatCompact(t.views)} · Лайки: {formatCompact(t.likes_count)} · Комменты: {formatCompact(t.comments_count)}
                            </p>
                          </div>
                          <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-4 py-4",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <p className="font-semibold mb-3">Динамика просмотров</p>
                  <ChartContainer
                    className="h-[220px]"
                    config={{
                      views: {
                        label: "Просмотры",
                        color: "hsl(var(--primary))",
                      },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={viewsByDay} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} width={32} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="views" stroke="var(--color-views)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-4 py-4",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <p className="font-semibold mb-3">Активность (по часам)</p>
                  <ChartContainer
                    className="h-[220px]"
                    config={{
                      views: {
                        label: "Просмотры",
                        color: "hsl(var(--primary))",
                      },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={viewsByHour} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} width={32} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="views" fill="var(--color-views)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </>
        );
      }

      case "stats_content":
        return (
          <>
            {renderHeader("Контент")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 pt-2 pb-3 flex gap-2">
                <div className={cn(
                  "px-4 py-2 rounded-full text-sm",
                  isDark ? "settings-dark-pill settings-dark-pill-active" : "bg-card/80 border border-white/20",
                )}>
                  Все
                </div>
                <div className={cn(
                  "px-4 py-2 rounded-full text-sm",
                  isDark ? "settings-dark-pill" : "bg-card/80 border border-white/20",
                )}>
                  За последние 30 дней
                </div>
              </div>

              {reelsLoading ? (
                <p className={cn("px-5 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
              ) : reels.length === 0 ? (
                <div className="px-4">
                  <div className={cn(
                    "backdrop-blur-xl rounded-2xl border px-5 py-10 text-center",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}>
                    <div className={cn(
                      "w-16 h-16 mx-auto rounded-full border flex items-center justify-center",
                      isDark ? "border-white/20" : "border-white/30",
                    )}>
                      <FileText className={cn("w-7 h-7", isDark ? "text-white/60" : "text-white/70")} />
                    </div>
                    <p className={cn("mt-4 text-lg font-semibold", isDark ? "text-white" : "text-white")}>Контент не найден</p>
                    <p className={cn("mt-1 text-sm", isDark ? "text-white/60" : "text-white/70")}>
                      За это время вы не опубликовали ни одного видео.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-4 grid gap-3">
                  {reels.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "backdrop-blur-xl rounded-2xl border px-5 py-4",
                        isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className={cn("font-semibold truncate", isDark ? "text-white" : "text-white")}>
                            {(r.description ?? "Reel").toString().slice(0, 60) || "Reel"}
                          </p>
                          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                            Просмотры: {formatCompact(r.views_count ?? 0)} · Лайки: {formatCompact(r.likes_count ?? 0)} · Комментарии: {formatCompact(r.comments_count ?? 0)}
                          </p>
                        </div>
                        <ChevronRight className={cn("w-5 h-5 mt-0.5", isDark ? "text-white/40" : "text-muted-foreground")} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case "stats_followers": {
        const gender = creatorInsights?.followers_gender ?? { male: 0, female: 0, unknown: 0 };
        const total = (gender.male ?? 0) + (gender.female ?? 0) + (gender.unknown ?? 0);
        const malePct = total ? Math.round(((gender.male ?? 0) * 100) / total) : 0;
        const femalePct = total ? Math.round(((gender.female ?? 0) * 100) / total) : 0;

        return (
          <>
            {renderHeader("Подписчики")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 pt-2 pb-3 flex items-center justify-between">
                <div className={cn(
                  "px-4 py-2 rounded-full text-sm",
                  isDark ? "settings-dark-pill" : "bg-card/80 border border-white/20",
                )}>
                  Последние 30 дней
                </div>
                <Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-white/70")} />
              </div>

              <div className="px-4 grid gap-3">
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-5 py-4",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <p className="text-lg font-semibold">Пол</p>
                  {followersGenderLoading ? (
                    <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                  ) : (
                    <div className="mt-3 grid gap-3">
                      <div className="flex items-center justify-between">
                        <p>Мужчины</p>
                        <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/80")}>{malePct}%</p>
                      </div>
                      <div className={cn("h-2 rounded-full overflow-hidden", isDark ? "bg-white/10" : "bg-white/15")}>
                        <div className="h-full bg-primary" style={{ width: `${malePct}%` }} />
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <p>Женщины</p>
                        <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/80")}>{femalePct}%</p>
                      </div>
                      <div className={cn("h-2 rounded-full overflow-hidden", isDark ? "bg-white/10" : "bg-white/15")}>
                        <div className="h-full bg-primary" style={{ width: `${femalePct}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border px-5 py-4",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  <p className="text-lg font-semibold">Периоды наибольшей активности</p>
                  <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                    По просмотрам ваших Reels (приближение к активности аудитории).
                  </p>
                  <div className="mt-4">
                    <ChartContainer
                      className="h-[220px]"
                      config={{
                        views: {
                          label: "Просмотры",
                          color: "hsl(var(--primary))",
                        },
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(creatorInsights?.views_by_hour ?? []).map((p) => ({ hour: `${p.hour}`, views: p.views }))}
                          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} width={32} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="views" fill="var(--color-views)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      }

      case "branded_content":
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
                  Вы можете использовать метку “Оплачено спонсором”.
                </p>
              </div>

              <div className="px-4 mt-5">
                <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>
                  Метка “Оплачено спонсором”
                </p>
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}>
                  {renderMenuItem(
                    <Share2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Отправить запрос на одобрение бренд‑партнёрам",
                    () => setCurrentScreen("branded_content_requests"),
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
                    () => setCurrentScreen("branded_content_authors"),
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
                    () => setCurrentScreen("branded_content_info"),
                  )}
                </div>
              </div>
            </div>
          </>
        );

      case "branded_content_info":
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
                    <p>1) Вы включаете метку “Оплачено спонсором” для публикаций.</p>
                    <p>2) Вы можете отправлять запросы бренд‑партнёрам на одобрение сотрудничества.</p>
                    <p>3) Если включено “ручное одобрение авторов”, только одобренные авторы смогут добавлять вас к бренд‑контенту.</p>
                    <p>4) Все решения фиксируются в базе (Supabase) и синхронизируются в реальном времени.</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case "branded_content_requests":
        return (
          <>
            {renderHeader("Запросы бренд‑партнёрам")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4 grid gap-3">
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
                            <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>От: {r.brand_user_id}</p>
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
                            <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>Кому: {r.partner_user_id}</p>
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

      case "branded_content_authors":
        return (
          <>
            {renderHeader("Одобрение авторов контента")}
            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              <div className="px-4">
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

      case "help":
        return (
          <>
            {renderHeader("Помощь")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(<HelpCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Справочный центр")}
                {renderMenuItem(<AlertCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Сообщить о проблеме")}
                {renderMenuItem(<FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Условия использования")}
                {renderMenuItem(<Lock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Политика конфиденциальности")}
              </div>
            </div>
          </>
        );

      case "about":
        return (
          <>
            {renderHeader("О приложении")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="p-8 flex flex-col items-center">
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg",
                  isDark ? "settings-dark-card" : "bg-primary"
                )}>
                  <span className={cn("text-3xl font-bold", isDark ? "text-white" : "text-primary-foreground")}>M</span>
                </div>
                <h3 className="text-xl font-semibold">mansoni</h3>
                <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/60")}>Версия 1.0.0</p>
              </div>
              <div className={cn(
                "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
              )}>
                {renderMenuItem(<FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Лицензии открытого ПО")}
                {renderMenuItem(<Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Информация о разработчике")}
              </div>
            </div>
          </>
        );

      default:
        return (
          <>
            {renderHeader("Настройки", false)}

            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              {/* Theme Toggle */}
              <div className="px-4 py-4">
                <p className={cn("text-sm mb-3 px-1", isDark ? "text-white/60" : "text-white/60")}>Тема оформления</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
                      isDark ? "settings-dark-pill" : "border border-border bg-card",
                      currentTheme === "light"
                        ? (isDark ? "settings-dark-pill-active text-white" : "bg-primary text-primary-foreground border-primary")
                        : (isDark ? "text-white/70" : "text-foreground")
                    )}
                  >
                    <Sun className="w-5 h-5" />
                    <span className="font-medium">Светлая</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
                      isDark ? "settings-dark-pill" : "border border-border bg-card",
                      currentTheme === "dark"
                        ? (isDark ? "settings-dark-pill-active text-white" : "bg-primary text-primary-foreground border-primary")
                        : (isDark ? "text-white/70" : "text-foreground")
                    )}
                  >
                    <Moon className="w-5 h-5" />
                    <span className="font-medium">Тёмная</span>
                  </button>
                </div>
              </div>

              {/* Account */}
              <div className="px-4 mb-3">
                <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Аккаунт</p>
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  {renderMenuItem(<Bookmark className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Сохранённое", () => setCurrentScreen("saved"))}
                  {renderMenuItem(<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Архив", () => setCurrentScreen("archive"))}
                  {renderMenuItem(<Clock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Ваша активность", () => setCurrentScreen("activity"))}
                </div>
              </div>

              {/* Settings */}
              <div className="px-4 mb-3">
                <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Настройки</p>
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  {renderMenuItem(<Bell className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Уведомления и звук", () => setCurrentScreen("notifications"))}
                  {renderMenuItem(<Phone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Звонки", () => setCurrentScreen("calls"))}
                  {renderMenuItem(<AlertCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Энергосбережение", () => setCurrentScreen("energy_saver"))}
                  {renderMenuItem(<Database className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Данные и память", () => setCurrentScreen("data_storage"))}
                  {renderMenuItem(<Lock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Конфиденциальность", () => setCurrentScreen("privacy"))}
                  {renderMenuItem(
                    <Smile className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                    "Стикеры и эмодзи",
                    () => setCurrentScreen("profile_status"),
                    myProfile?.status_emoji ?? undefined,
                  )}
                  {renderMenuItem(<Shield className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Безопасность", () => setCurrentScreen("security"))}
                  {renderMenuItem(<Moon className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Оформление", () => setCurrentScreen("appearance"))}
                  {renderMenuItem(<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Папки с чатами", () => setCurrentScreen("chat_folders"))}
                  {renderMenuItem(<Smartphone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Устройства", () => setCurrentScreen("security_sessions"))}
                  {renderMenuItem(<Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Язык", () => setCurrentScreen("language"), settings?.language_code ?? "ru")}
                  {renderMenuItem(<Accessibility className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Доступность", () => setCurrentScreen("accessibility"))}
                  {renderMenuItem(<BarChart3 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Статистика", () => setCurrentScreen("statistics"))}
                  {renderMenuItem(<BadgeCheck className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Брендированный контент", () => setCurrentScreen("branded_content"))}
                </div>
              </div>

              {/* Support */}
              <div className="px-4 mb-3">
                <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Поддержка</p>
                <div className={cn(
                  "backdrop-blur-xl rounded-2xl border overflow-hidden",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20"
                )}>
                  {renderMenuItem(<HelpCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "Помощь", () => setCurrentScreen("help"))}
                  {renderMenuItem(<Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />, "О приложении", () => setCurrentScreen("about"))}
                </div>
              </div>

              {/* Logout */}
              <div className="px-4 mt-6">
                <button 
                  onClick={handleLogout}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    isDark
                      ? "bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30"
                      : "bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/15"
                  )}
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Выйти</span>
                </button>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex flex-col safe-area-top safe-area-bottom">
        {renderScreen()}
      </div>
    </div>
  );
}
