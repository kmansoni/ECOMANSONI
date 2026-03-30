/**
 * src/pages/settings/SettingsChatFoldersSection.tsx
 *
 * Extracted from SettingsPage.tsx — handles "chat_folders" and "chat_folder_edit" screens.
 * Fully self-contained: owns all editing state, CRUD callbacks, confirmation dialogs,
 * and data hooks (useChatFolders, useConversations, useChannels, useGroupChats).
 */
import { useCallback, useState } from "react";
import { Eye, Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatFolders, type ChatFolderItemKind } from "@/hooks/useChatFolders";
import { useConversations, type Conversation } from "@/hooks/useChat";
import { useChannels, type Channel } from "@/hooks/useChannels";
import { useGroupChats, type GroupChat } from "@/hooks/useGroupChats";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { pbkdf2Hash } from "@/lib/passcode";
import type { Screen, SectionProps } from "./types";
import { SettingsHeader, SettingsToggleItem } from "./helpers";

type ConversationParticipantLike = {
  user_id?: string;
  profile?: { display_name?: string | null } | null;
};

export interface SettingsChatFoldersProps extends SectionProps {
  currentScreen: Screen;
}

export function SettingsChatFoldersSection({
  isDark,
  onNavigate,
  onBack,
  currentScreen,
}: SettingsChatFoldersProps) {
  const { user } = useAuth();
  const { folders, itemsByFolderId, loading: foldersLoading, refetch: refetchFolders } = useChatFolders();
  const { conversations } = useConversations();
  const { channels } = useChannels();
  const { groups } = useGroupChats();

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingSelectedKeys, setEditingSelectedKeys] = useState<Set<string>>(new Set());
  const [editingHidden, setEditingHidden] = useState(false);
  const [editingPasscodeEnabled, setEditingPasscodeEnabled] = useState(false);
  const [editingPasscode, setEditingPasscode] = useState("");
  const [editingHasExistingPasscode, setEditingHasExistingPasscode] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{ open: boolean; folderId: string | null }>({ open: false, folderId: null });

  const isAuthed = !!user?.id;

  const getDmOtherLabel = useCallback(
    (conv: Conversation) => {
      const participants = (conv as Conversation & { participants?: ConversationParticipantLike[] }).participants ?? [];
      const other = participants.find((p) => p.user_id !== user?.id);
      return other?.profile?.display_name || "Пользователь";
    },
    [user?.id],
  );

  const openCreateFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingSelectedKeys(new Set());
    setEditingHidden(false);
    setEditingPasscodeEnabled(false);
    setEditingPasscode("");
    setEditingHasExistingPasscode(false);
    onNavigate("chat_folder_edit");
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
    onNavigate("chat_folder_edit");
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
          passcode_hash = await pbkdf2Hash(editingPasscode.trim());
        } else if (!editingHasExistingPasscode) {
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
        const inserted = ins.data as { id: string } | null;
        if (!inserted?.id) throw new Error("Не удалось получить id папки.");
        folderId = inserted.id;
      } else {
        const patch: { is_hidden: boolean; passcode_hash: string | null; name?: string } = { is_hidden: editingHidden, passcode_hash };
        if (!isSystem) patch.name = name;
        const upd = await supabase.from("chat_folders").update(patch).eq("id", folderId);
        if (upd.error) throw upd.error;
      }

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
      onNavigate("chat_folders");
    } catch (e) {
      toast({ title: "Папки", description: getErrorMessage(e) });
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolderConfirmed = async (folderId: string) => {
    if (!user?.id) return;
    try {
      const del = await supabase.from("chat_folders").delete().eq("id", folderId);
      if (del.error) throw del.error;
      toast({ title: "Готово", description: "Папка удалена." });
      await refetchFolders();
      if (editingFolderId === folderId) {
        onNavigate("chat_folders");
        setEditingFolderId(null);
      }
    } catch (e) {
      toast({ title: "Папки", description: getErrorMessage(e) });
    }
  };

  const deleteFolder = (folderId: string) => {
    setDeleteFolderDialog({ open: true, folderId });
  };

  const toggleFolderKey = useCallback((key: string) => {
    setEditingSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const renderToggleItem = (
    icon: React.ReactNode,
    label: string,
    desc: string,
    value: boolean,
    onToggle: (v: boolean) => void | Promise<void>,
  ) => (
    <SettingsToggleItem icon={icon} label={label} description={desc} checked={value} onCheckedChange={onToggle} isDark={isDark} />
  );

  if (currentScreen === "chat_folder_edit") {
    const f = editingFolderId ? folders.find((x) => x.id === editingFolderId) : null;
    const isSystem = !!f?.system_kind;
    return (
      <>
        <SettingsHeader title={editingFolderId ? "Изменить папку" : "Новая папка"} onBack={onBack} onClose={onBack} isDark={isDark} currentScreen={currentScreen} />
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
                (val) => setEditingHidden(val),
              )}

              {renderToggleItem(
                <Lock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
                "Доступ по паролю",
                "Запрашивать пароль при открытии вкладки",
                editingPasscodeEnabled,
                (val) => {
                  setEditingPasscodeEnabled(val);
                  if (!val) setEditingPasscode("");
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

        <AlertDialog
          open={deleteFolderDialog.open}
          onOpenChange={(open) => !open && setDeleteFolderDialog({ open: false, folderId: null })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить папку?</AlertDialogTitle>
              <AlertDialogDescription>
                Чаты не удалятся — только папка. Это действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (deleteFolderDialog.folderId) {
                    await deleteFolderConfirmed(deleteFolderDialog.folderId);
                  }
                  setDeleteFolderDialog({ open: false, folderId: null });
                }}
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // chat_folders screen
  return (
    <>
      <SettingsHeader title="Папки с чатами" onBack={onBack} onClose={onBack} isDark={isDark} currentScreen={currentScreen} />
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

      <AlertDialog
        open={deleteFolderDialog.open}
        onOpenChange={(open) => !open && setDeleteFolderDialog({ open: false, folderId: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить папку?</AlertDialogTitle>
            <AlertDialogDescription>
              Чаты не удалятся — только папка. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteFolderDialog.folderId) {
                  await deleteFolderConfirmed(deleteFolderDialog.folderId);
                }
                setDeleteFolderDialog({ open: false, folderId: null });
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
