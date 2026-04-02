/**
 * src/components/chat/GroupDmSettingsSheet.tsx
 *
 * Sheet для редактирования профиля группового DM:
 * изменение названия, аватара, список участников, выход из группы.
 */
import { useState, useRef, useCallback } from "react";
import { Camera, Loader2, LogOut, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { toast } from "sonner";
import { useGroupDmProfile } from "@/hooks/useGroupDmProfile";

// ── Типы ─────────────────────────────────────────────────────────────

interface GroupMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface GroupDmSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  members: GroupMember[];
  onLeaveGroup?: () => void;
}

// ── Компонент ────────────────────────────────────────────────────────

export function GroupDmSettingsSheet({
  open,
  onOpenChange,
  conversationId,
  members,
  onLeaveGroup,
}: GroupDmSettingsSheetProps) {
  const { groupName, groupAvatarUrl, updateGroupName, updateGroupAvatar, loading } =
    useGroupDmProfile(conversationId);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [leaving, setLeaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditName = useCallback(() => {
    setNameInput(groupName ?? "");
    setEditingName(true);
  }, [groupName]);

  const handleSaveName = useCallback(async () => {
    await updateGroupName(nameInput);
    setEditingName(false);
  }, [nameInput, updateGroupName]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSaveName();
      } else if (e.key === "Escape") {
        setEditingName(false);
      }
    },
    [handleSaveName],
  );

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await updateGroupAvatar(file);
      // Сброс input для повторной загрузки
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [updateGroupAvatar],
  );

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    try {
      onLeaveGroup?.();
      onOpenChange(false);
    } finally {
      setLeaving(false);
    }
  }, [onLeaveGroup, onOpenChange]);

  const displayName = groupName || members.map((m) => m.displayName).slice(0, 3).join(", ") || "Группа";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Настройки группы</SheetTitle>
          <SheetDescription>{members.length} участников</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Аватар */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAvatarClick}
              className="relative group min-h-[44px] min-w-[44px]"
              aria-label="Изменить аватар группы"
            >
              <GradientAvatar
                name={displayName}
                avatarUrl={groupAvatarUrl}
                size="lg"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Загрузить аватар"
            />
            <p className="text-xs text-muted-foreground">Нажмите для смены аватара</p>
          </div>

          {/* Название */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Название группы</label>
            {editingName ? (
              <div className="flex gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  maxLength={100}
                  className="flex-1 min-h-[44px]"
                  aria-label="Название группы"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={loading}
                  className="min-h-[44px]"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                </Button>
              </div>
            ) : (
              <button
                onClick={handleStartEditName}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors min-h-[44px]"
                aria-label="Редактировать название"
              >
                <span className="flex-1 text-sm truncate">{displayName}</span>
                <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            )}
          </div>

          {/* Участники */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="w-4 h-4" />
              <span>Участники ({members.length})</span>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Нет участников</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <GradientAvatar
                      name={member.displayName}
                      avatarUrl={member.avatarUrl}
                      size="sm"
                    />
                    <span className="text-sm truncate">{member.displayName}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Покинуть группу */}
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaving}
            className="w-full min-h-[44px]"
            aria-label="Покинуть группу"
          >
            {leaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4 mr-2" />
            )}
            Покинуть группу
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
