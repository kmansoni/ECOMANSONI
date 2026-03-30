/**
 * src/pages/SettingsPage.tsx
 *
 * Thin orchestrator — routes `currentScreen` to the correct section component.
 * All section UI lives in src/pages/settings/<SectionName>.tsx.
 *
 * Extracted sections:
 *   SettingsHelpSection, SettingsAboutSection, SettingsSavedSection,
 *   SettingsArchiveSection, SettingsActivitySection, SettingsPrivacySection,
 *   SettingsAppearanceSection, SettingsCallsSection, SettingsDataStorageSection,
 *   SettingsNotificationsSection, SettingsSecuritySection, SettingsStatisticsSection,
 *   SettingsBrandedContentSection, SettingsChatFoldersSection,
 *   SettingsProfileStatusSection, SettingsAccessibilitySection,
 *   SettingsLanguageSection, SettingsMainSection
 *
 * Shared utilities:
 *   src/pages/settings/types.ts   — Screen type, data types, SectionProps
 *   src/pages/settings/helpers.tsx — rendering helpers
 *   src/pages/settings/index.ts   — barrel exports
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useTheme } from "next-themes";
import { getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useChatFolders } from "@/hooks/useChatFolders";
import { pingScreenTime } from "@/lib/user-settings";
import { toast } from "@/hooks/use-toast";
import type { Screen } from "./settings/types";

import { SettingsSavedSection } from "./settings/SettingsSavedSection";
import { SettingsArchiveSection } from "./settings/SettingsArchiveSection";
import { SettingsActivitySection } from "./settings/SettingsActivitySection";
import { SettingsCallsSection } from "./settings/SettingsCallsSection";
import { SettingsDataStorageSection } from "./settings/SettingsDataStorageSection";
import { SettingsPrivacySection } from "./settings/SettingsPrivacySection";
import { SettingsAppearanceSection } from "./settings/SettingsAppearanceSection";
import { SettingsHelpSection } from "./settings/SettingsHelpSection";
import { SettingsAboutSection } from "./settings/SettingsAboutSection";
import { SettingsNotificationsSection } from "./settings/SettingsNotificationsSection";
import { SettingsSecuritySection } from "./settings/SettingsSecuritySection";
import { SettingsStatisticsSection } from "./settings/SettingsStatisticsSection";
import { SettingsBrandedContentSection } from "./settings/SettingsBrandedContentSection";
import { SettingsChatFoldersSection } from "./settings/SettingsChatFoldersSection";
import { SettingsProfileStatusSection } from "./settings/SettingsProfileStatusSection";
import { SettingsAccessibilitySection } from "./settings/SettingsAccessibilitySection";
import { SettingsLanguageSection } from "./settings/SettingsLanguageSection";
import { SettingsMainSection } from "./settings/SettingsMainSection";

type ProfileState = {
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  verified?: boolean | null;
  status_emoji?: string | null;
  status_sticker_url?: string | null;
};

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const { settings } = useUserSettings();
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");
  const [mounted, setMounted] = useState(false);

  const [deleteAllFoldersDialog, setDeleteAllFoldersDialog] = useState(false);
  const [logoutDialog, setLogoutDialog] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const { refetch: refetchFolders } = useChatFolders();
  const [myProfile, setMyProfile] = useState<ProfileState | null>(null);
  const [myProfileLoading, setMyProfileLoading] = useState(false);

  const isAuthed = !!user?.id;

  useEffect(() => { setMounted(true); }, []);

  // Screen time — ping every 60s while app is open
  useEffect(() => {
    if (!isAuthed) return;
    void pingScreenTime(0);
    const timer = setInterval(() => { void pingScreenTime(60); }, 60_000);
    return () => clearInterval(timer);
  }, [isAuthed]);

  const currentTheme = (mounted ? theme : "dark") ?? "dark";
  const isDark = currentTheme === "dark";

  // ── Navigation ──────────────────────────────────────────────────────

  const handleBack = () => {
    switch (currentScreen) {
      case "main":
        navigate(-1);
        return;
      case "saved_all_posts":
      case "saved_liked_posts":
        setCurrentScreen("saved");
        return;
      case "archive_stories":
      case "archive_posts":
      case "archive_live":
        setCurrentScreen("archive");
        return;
      case "activity_likes":
      case "activity_comments":
      case "activity_reposts":
        setCurrentScreen("activity");
        return;
      case "stats_recommendations":
      case "stats_overview":
      case "stats_content":
      case "stats_followers":
        setCurrentScreen("statistics");
        return;
      case "branded_content_authors":
      case "branded_content_requests":
      case "branded_content_info":
        setCurrentScreen("branded_content");
        return;
      default:
        setCurrentScreen("main");
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await signOut();
      setLogoutDialog(false);
      navigate("/auth", { replace: true });
    } catch (e) {
      toast({ title: "Выход", description: getErrorMessage(e) });
    } finally {
      setLogoutLoading(false);
    }
  };

  // ── Profile fetch (needed for main menu emoji + BrandedContent) ────

  const profileVerified = useMemo(() => {
    const v = myProfile?.verified;
    return typeof v === "boolean" ? v : null;
  }, [myProfile?.verified]);

  useEffect(() => {
    if (!isAuthed || myProfile || myProfileLoading) return;
    void (async () => {
      setMyProfileLoading(true);
      try {
        const selectFull = "user_id, display_name, avatar_url, verified, status_emoji, status_sticker_url";
        const selectBase = "user_id, display_name, avatar_url, verified";

        const res = await supabase
          .from("profiles")
          .select(selectFull)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (res.error) {
          const msg = getErrorMessage(res.error).toLowerCase();
          const missingColumn =
            msg.includes("status_emoji") ||
            msg.includes("status_sticker_url") ||
            msg.includes("does not exist") ||
            msg.includes("column");

          if (missingColumn) {
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

  // ── Shared section props ────────────────────────────────────────────

  const sectionProps = { isDark, onNavigate: setCurrentScreen, onBack: handleBack } as const;

  // ── Screen router ───────────────────────────────────────────────────

  const renderScreen = () => {
    switch (currentScreen) {
      case "saved":
      case "saved_all_posts":
      case "saved_liked_posts":
        return <SettingsSavedSection {...sectionProps} currentScreen={currentScreen} />;

      case "archive":
      case "archive_stories":
      case "archive_posts":
      case "archive_live":
        return <SettingsArchiveSection {...sectionProps} currentScreen={currentScreen} />;

      case "activity":
      case "activity_likes":
      case "activity_comments":
      case "activity_reposts":
        return <SettingsActivitySection {...sectionProps} currentScreen={currentScreen} />;

      case "calls":
        return <SettingsCallsSection {...sectionProps} />;

      case "data_storage":
        return (
          <SettingsDataStorageSection
            {...sectionProps}
            onDeleteAllFolders={() => setDeleteAllFoldersDialog(true)}
          />
        );

      case "privacy":
      case "privacy_blocked":
        return <SettingsPrivacySection {...sectionProps} currentScreen={currentScreen} />;

      case "appearance":
      case "energy_saver":
        return <SettingsAppearanceSection {...sectionProps} currentScreen={currentScreen} />;

      case "help":
        return <SettingsHelpSection {...sectionProps} />;

      case "about":
        return <SettingsAboutSection {...sectionProps} />;

      case "notifications":
        return <SettingsNotificationsSection {...sectionProps} />;

      case "security":
      case "security_sites":
      case "security_passcode":
      case "security_cloud_password":
      case "security_account_protection":
      case "security_sessions":
      case "security_2fa":
        return <SettingsSecuritySection {...sectionProps} currentScreen={currentScreen} />;

      case "profile_status":
        return (
          <SettingsProfileStatusSection
            {...sectionProps}
            initialProfile={myProfile}
            onProfileChange={(patch) => setMyProfile((prev) => ({ ...(prev ?? {}), ...patch }))}
          />
        );

      case "chat_folders":
      case "chat_folder_edit":
        return <SettingsChatFoldersSection {...sectionProps} currentScreen={currentScreen} />;

      case "accessibility":
        return <SettingsAccessibilitySection {...sectionProps} />;

      case "language":
        return <SettingsLanguageSection {...sectionProps} />;

      case "statistics":
      case "stats_recommendations":
      case "stats_overview":
      case "stats_content":
      case "stats_followers":
        return <SettingsStatisticsSection {...sectionProps} currentScreen={currentScreen} />;

      case "branded_content":
      case "branded_content_info":
      case "branded_content_requests":
      case "branded_content_authors":
        return (
          <SettingsBrandedContentSection
            {...sectionProps}
            currentScreen={currentScreen}
            profileVerified={profileVerified}
          />
        );

      // close_friends — stub, navigates back to main
      case "close_friends":
      default:
        return (
          <SettingsMainSection
            isDark={isDark}
            onNavigate={setCurrentScreen}
            onBack={handleBack}
            onClose={() => navigate(-1)}
            onLogout={() => setLogoutDialog(true)}
            languageCode={settings?.language_code}
            statusEmoji={myProfile?.status_emoji}
          />
        );
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex flex-col safe-area-top safe-area-bottom">
        {renderScreen()}
      </div>

      {/* AlertDialog — delete all chat folders */}
      <AlertDialog open={deleteAllFoldersDialog} onOpenChange={setDeleteAllFoldersDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить все папки чатов?</AlertDialogTitle>
            <AlertDialogDescription>
              Чаты не удалятся — только папки. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!user?.id) return;
                try {
                  const { error } = await supabase.from("chat_folders").delete().eq("user_id", user.id);
                  if (error) throw error;
                  toast({ title: "Готово", description: "Папки чатов удалены." });
                  await refetchFolders();
                } catch (e) {
                  toast({ title: "Папки", description: getErrorMessage(e) });
                } finally {
                  setDeleteAllFoldersDialog(false);
                }
              }}
            >
              Удалить всё
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog — logout confirmation */}
      <AlertDialog open={logoutDialog} onOpenChange={setLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы будете перенаправлены на страницу входа.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={logoutLoading}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={logoutLoading}
              onClick={() => void handleLogout()}
            >
              {logoutLoading ? "Выход..." : "Выйти"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}