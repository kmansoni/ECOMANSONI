import {
  Settings, Plus, User, TrendingUp, Link,
  ChevronDown, MoreHorizontal, QrCode, Volume2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { BusinessActionButtons } from "./BusinessActionButtons";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buildProfileUrl } from "@/lib/users/profileLinks";
import { toast } from "sonner";
import { useState, useRef } from "react";

export type ProfileMetaExtras = {
  status_emoji?: string | null;
  category?: string | null;
  account_type?: string | null;
  action_email?: string | null;
  action_phone?: string | null;
  action_address?: string | null;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatBioForDisplay(rawBio: string): string {
  return rawBio
    .split(/\r?\n/)
    .map((line) => line.replace(/^(\s*\d+)\.(\S)/, "$1. $2"))
    .join("\n")
    .trim();
}

interface ProfileHeaderProps {
  profile: {
    display_name?: string | null;
    avatar_url?: string | null;
    verified?: boolean;
    bio?: string | null;
    website?: string | null;
    username?: string | null;
    name_pronunciation_url?: string | null;
    stats?: {
      postsCount?: number;
      followersCount?: number;
      followingCount?: number;
    };
  } | null;
  profileMeta: ProfileMetaExtras | null;
  isOwnProfile: boolean;
  userId?: string;
  targetUserId?: string;
  postsCount: number;
  displayFollowersCount: number;
  displayIsFollowing: boolean;
  isFollowedBy: boolean;
  hasActiveStories: boolean;
  followPending: boolean;
  onFollowToggle: () => void;
  onNavigate: (path: string) => void;
  onNavigateBack: () => void;
  onEditProfile: () => void;
  onCreateContent: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onMenu: () => void;
  onQR: () => void;
}

export function ProfileHeader({
  profile,
  profileMeta,
  isOwnProfile,
  userId,
  targetUserId,
  postsCount,
  displayFollowersCount,
  displayIsFollowing,
  isFollowedBy,
  hasActiveStories,
  followPending,
  onFollowToggle,
  onNavigate,
  onNavigateBack,
  onEditProfile,
  onCreateContent,
  onFollowers,
  onFollowing,
  onMenu,
  onQR,
}: ProfileHeaderProps) {
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const pronunciationAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingPronunciation, setPlayingPronunciation] = useState(false);

  const handlePlayPronunciation = () => {
    const url = profile?.name_pronunciation_url;
    if (!url) return;
    if (playingPronunciation && pronunciationAudioRef.current) {
      pronunciationAudioRef.current.pause();
      pronunciationAudioRef.current.currentTime = 0;
      setPlayingPronunciation(false);
      return;
    }
    const audio = new Audio(url);
    pronunciationAudioRef.current = audio;
    audio.onended = () => setPlayingPronunciation(false);
    audio.play().catch(() => setPlayingPronunciation(false));
    setPlayingPronunciation(true);
  };

  const handleFollowClick = () => {
    if (displayIsFollowing) {
      setShowUnfollowConfirm(true);
    } else {
      onFollowToggle();
    }
  };

  const getFollowButtonText = () => {
    if (displayIsFollowing) return "Подписки";
    if (isFollowedBy) return "Подписаться в ответ";
    return "Подписаться";
  };

  return (
    <>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 safe-area-top">
        <div className="flex items-center gap-1.5">
          {!isOwnProfile && (
            <button onClick={onNavigateBack} className="mr-2">
              <ChevronDown className="w-6 h-6 rotate-90" />
            </button>
          )}
          <h1 className="font-semibold text-lg text-foreground">
            {profile?.display_name || "Профиль"}
          </h1>
          {profile?.verified && <VerifiedBadge size="md" />}
        </div>
        <div className="flex items-center gap-2">
          {isOwnProfile && (
            <>
              <button
                onClick={() => onNavigate("/analytics")}
                className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
                aria-label="Аналитика"
              >
                <TrendingUp className="w-5 h-5" />
              </button>
              <button
                onClick={onQR}
                className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
                aria-label="QR-код"
              >
                <QrCode className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={onMenu}
            className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
          >
            {isOwnProfile ? <Settings className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Profile info ── */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => isOwnProfile && onEditProfile()}
              className="relative block"
            >
              <div
                className={cn(
                  "w-20 h-20 rounded-full p-0.5",
                  hasActiveStories
                    ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600"
                    : "ring-2 ring-muted"
                )}
              >
                <Avatar className="w-full h-full">
                  <AvatarImage
                    src={profile?.avatar_url || undefined}
                    alt={profile?.display_name || "Профиль"}
                    loading="eager"
                    decoding="async"
                  />
                  <AvatarFallback className="bg-violet-500 text-white text-2xl font-semibold">
                    {profile?.display_name?.charAt(0)?.toUpperCase() || <User className="w-8 h-8" />}
                  </AvatarFallback>
                </Avatar>
              </div>
            </button>
            {isOwnProfile && (
              <button
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow"
                onClick={onCreateContent}
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-1 mb-2">
              <span className="font-semibold text-foreground text-base">
                {profile?.display_name || "Пользователь"}
              </span>
              {profile?.name_pronunciation_url && (
                <button
                  onClick={handlePlayPronunciation}
                  className="w-5 h-5 flex items-center justify-center text-primary"
                  aria-label="Произношение имени"
                >
                  <Volume2 className={cn("w-3.5 h-3.5", playingPronunciation && "text-green-500")} />
                </button>
              )}
              {profileMeta?.status_emoji && <span>{profileMeta.status_emoji}</span>}
              {profile?.verified && <VerifiedBadge size="sm" />}
            </div>
            {profileMeta?.category && (
              <p className="text-xs text-muted-foreground mb-2">{profileMeta.category}</p>
            )}
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="font-bold text-foreground text-sm">
                  {profile?.stats?.postsCount ?? postsCount}
                </p>
                <p className="text-xs text-muted-foreground">публикации</p>
              </div>
              <button onClick={onFollowers} className="text-center">
                <p className="font-bold text-foreground text-sm">{formatNumber(displayFollowersCount)}</p>
                <p className="text-xs text-muted-foreground">подписчики</p>
              </button>
              <button onClick={onFollowing} className="text-center">
                <p className="font-bold text-foreground text-sm">{formatNumber(profile?.stats?.followingCount ?? 0)}</p>
                <p className="text-xs text-muted-foreground">подписки</p>
              </button>
            </div>
          </div>
        </div>

        {/* Bio */}
        {(profile?.bio || profile?.website) && (
          <div className="mt-3 space-y-0.5">
            {profile?.bio && (
              <p className="text-sm text-foreground whitespace-pre-line">{formatBioForDisplay(profile.bio)}</p>
            )}
            {profile?.website && (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#6ab3f3] font-medium flex items-center gap-1"
              >
                <Link className="w-3 h-3" />
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        )}

        {/* Business action buttons */}
        {!isOwnProfile && profileMeta?.account_type === "business" && (
          <BusinessActionButtons
            email={profileMeta?.action_email ?? undefined}
            phone={profileMeta?.action_phone ?? undefined}
            address={profileMeta?.action_address ?? undefined}
          />
        )}

        {/* Professional Dashboard link */}
        {isOwnProfile && ["creator", "business"].includes(profileMeta?.account_type ?? "") && (
          <button
            onClick={() => onNavigate("/professional-dashboard")}
            className="w-full mt-2 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-sm font-semibold text-white"
          >
            Профессиональный дашборд
          </button>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          {isOwnProfile ? (
            <>
              <button
                onClick={onEditProfile}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Редактировать профиль
              </button>
              <button
                onClick={() => {
                  const url = buildProfileUrl({ username: profile?.username, userId });
                  navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
                }}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Поделиться профилем
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollowClick}
                disabled={followPending}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                  displayIsFollowing
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:bg-primary/80",
                  followPending && "opacity-70 cursor-not-allowed"
                )}
              >
                {getFollowButtonText()}
              </button>
              <button
                onClick={() => onNavigate(`/chat?userId=${targetUserId}`)}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Сообщение
              </button>
              <button
                onClick={onMenu}
                className="w-10 py-2 bg-muted rounded-xl flex items-center justify-center"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Unfollow confirmation ── */}
      <AlertDialog open={showUnfollowConfirm} onOpenChange={setShowUnfollowConfirm}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader className="items-center">
            <Avatar className="w-16 h-16 mb-2">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{profile?.display_name?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <AlertDialogTitle className="text-center">
              Отписаться от {profile?.display_name || profile?.username || "пользователя"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Вы перестанете видеть публикации этого пользователя в ленте
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={onFollowToggle}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Отписаться
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Отмена</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
