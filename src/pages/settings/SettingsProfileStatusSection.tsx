/**
 * src/pages/settings/SettingsProfileStatusSection.tsx
 *
 * Extracted from SettingsPage.tsx — manages the "Стикеры и эмодзи" screen
 * (profile status emoji + status sticker upload).
 */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { EmojiStickerPicker } from "@/components/chat/EmojiStickerPicker";
import { StickersAndReactionsCenter } from "@/components/settings/StickersAndReactionsCenter";
import { uploadMedia } from "@/lib/mediaUpload";
import { SettingsHeader } from "./helpers";
import type { SectionProps } from "./types";

type ProfileStatusState = {
  status_emoji?: string | null;
  status_sticker_url?: string | null;
};

interface SettingsProfileStatusSectionProps extends SectionProps {
  /** Initial profile snapshot from orchestrator (emoji + sticker). */
  initialProfile: ProfileStatusState | null;
  /** Propagate profile mutation back to orchestrator so main menu stays fresh. */
  onProfileChange: (patch: Partial<ProfileStatusState>) => void;
}

export function SettingsProfileStatusSection({
  isDark,
  onBack,
}: SettingsProfileStatusSectionProps) {
  const { user } = useAuth();
  const isAuthed = !!user?.id;

  const [profile, setProfile] = useState<ProfileStatusState | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);

  // Lazy-load profile on mount (self-contained — no prop dependency)
  // We fetch fresh each time the screen opens so the user always sees current state.
  if (!profileLoaded && isAuthed) {
    setProfileLoaded(true);
    void (async () => {
      try {
        const res = await supabase
          .from("profiles")
          .select("status_emoji, status_sticker_url")
          .eq("user_id", user!.id)
          .maybeSingle();

        if (res.error) {
          // status_emoji / status_sticker_url columns may not exist yet
          const msg = (res.error.message ?? "").toLowerCase();
          if (msg.includes("does not exist") || msg.includes("column")) {
            setProfile({});
            return;
          }
          throw res.error;
        }
        setProfile(res.data ?? {});
      } catch {
        setProfile({});
      }
    })();
  }

  const updateField = async (field: "status_emoji" | "status_sticker_url", value: string | null) => {
    if (!isAuthed) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("user_id", user!.id);
      if (error) throw error;
      setProfile((prev) => ({ ...(prev ?? {}), [field]: value }));
    } catch (e) {
      toast({ title: "Статус", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsHeader
        title="Стикеры и эмодзи"
        isDark={isDark}
        currentScreen="profile_status"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <StickersAndReactionsCenter userId={user?.id ?? null} isDark={isDark} />
        <div className="px-4 grid gap-3">
          {/* Status emoji */}
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
                  {profile?.status_emoji ?? "—"}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEmojiPickerOpen(true)}
                    disabled={!isAuthed || saving}
                  >
                    Выбрать
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void updateField("status_emoji", null)}
                    disabled={!isAuthed || saving}
                  >
                    Очистить
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Status sticker */}
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

              {profile?.status_sticker_url ? (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={profile.status_sticker_url}
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
                  onClick={() => stickerInputRef.current?.click()}
                  disabled={!isAuthed || saving}
                >
                  Загрузить
                </Button>
                {profile?.status_sticker_url && (
                  <Button
                    variant="destructive"
                    onClick={() => void updateField("status_sticker_url", null)}
                    disabled={!isAuthed || saving}
                  >
                    Удалить
                  </Button>
                )}

                <input
                  ref={stickerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    if (!isAuthed) return;
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setSaving(true);
                    try {
                      const uploadResult = await uploadMedia(file, { bucket: "post-media" });
                      const publicUrl = uploadResult.url;

                      const { error: updError } = await supabase
                        .from("profiles")
                        .update({ status_sticker_url: publicUrl })
                        .eq("user_id", user!.id);
                      if (updError) throw updError;

                      setProfile((prev) => ({ ...(prev ?? {}), status_sticker_url: publicUrl }));
                    } catch {
                      toast({ title: "Стикер", description: "Не удалось загрузить стикер. Попробуйте снова." });
                    } finally {
                      setSaving(false);
                      e.currentTarget.value = "";
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <EmojiStickerPicker
          open={emojiPickerOpen}
          onOpenChange={setEmojiPickerOpen}
          onEmojiSelect={async (emoji) => {
            if (!isAuthed) return;
            setSaving(true);
            try {
              const { error } = await supabase
                .from("profiles")
                .update({ status_emoji: emoji })
                .eq("user_id", user!.id);
              if (error) throw error;
              setProfile((prev) => ({ ...(prev ?? {}), status_emoji: emoji }));
              setEmojiPickerOpen(false);
            } catch (e) {
              toast({ title: "Эмодзи", description: e instanceof Error ? e.message : String(e) });
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    </>
  );
}
