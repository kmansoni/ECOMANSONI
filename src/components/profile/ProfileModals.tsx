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
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import { FollowersSheet } from "./FollowersSheet";
import { EditProfileSheet } from "./EditProfileSheet";
import { CreateHighlightSheet } from "./CreateHighlightSheet";
import { ProfileMenu } from "./ProfileMenu";
import { ProfileQRCode } from "./ProfileQRCode";
import type { ContentType } from "@/hooks/useMediaEditor";

interface ProfileModalsProps {
  isOwnProfile: boolean;
  userId?: string;
  targetUserId?: string;
  profile: {
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;

  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onContentCreated: (type: ContentType) => void;

  showFollowers: boolean;
  onCloseFollowers: () => void;
  showFollowing: boolean;
  onCloseFollowing: () => void;

  showEditProfile: boolean;
  onCloseEditProfile: () => void;
  onProfileSaved: (updated: Record<string, unknown>) => void;

  showMenu: boolean;
  onCloseMenu: () => void;
  onBlock: () => void;
  onArchive: () => void;
  onSettings: () => void;

  showCreateHighlight: boolean;
  onCloseCreateHighlight: () => void;
  onHighlightCreated: () => void;

  showQR: boolean;
  onCloseQR: () => void;

  highlightToDelete: string | null;
  onHighlightDeleteConfirm: (id: string) => void;
  onHighlightDeleteCancel: () => void;
}

export function ProfileModals({
  isOwnProfile,
  userId,
  targetUserId,
  profile,
  showCreateModal,
  onCloseCreateModal,
  onContentCreated,
  showFollowers,
  onCloseFollowers,
  showFollowing,
  onCloseFollowing,
  showEditProfile,
  onCloseEditProfile,
  onProfileSaved,
  showMenu,
  onCloseMenu,
  onBlock,
  onArchive,
  onSettings,
  showCreateHighlight,
  onCloseCreateHighlight,
  onHighlightCreated,
  showQR,
  onCloseQR,
  highlightToDelete,
  onHighlightDeleteConfirm,
  onHighlightDeleteCancel,
}: ProfileModalsProps) {
  return (
    <>
      <CreateContentModal
        isOpen={showCreateModal}
        onClose={onCloseCreateModal}
        onSuccess={onContentCreated}
      />

      {targetUserId && (
        <>
          <FollowersSheet
            isOpen={showFollowers}
            onClose={onCloseFollowers}
            userId={targetUserId}
            type="followers"
            title="Подписчики"
          />
          <FollowersSheet
            isOpen={showFollowing}
            onClose={onCloseFollowing}
            userId={targetUserId}
            type="following"
            title="Подписки"
          />
        </>
      )}

      {isOwnProfile && profile && userId && (
        <EditProfileSheet
          isOpen={showEditProfile}
          onClose={onCloseEditProfile}
          profile={profile}
          userId={userId}
          onSaved={onProfileSaved}
        />
      )}

      <ProfileMenu
        isOpen={showMenu}
        onClose={onCloseMenu}
        isOwnProfile={isOwnProfile}
        username={profile?.username || undefined}
        userId={targetUserId}
        onBlock={onBlock}
        onArchive={onArchive}
        onSettings={onSettings}
      />

      {isOwnProfile && userId && (
        <CreateHighlightSheet
          isOpen={showCreateHighlight}
          onClose={onCloseCreateHighlight}
          userId={userId}
          onCreated={onHighlightCreated}
        />
      )}

      {isOwnProfile && userId && profile && (
        <ProfileQRCode
          isOpen={showQR}
          onClose={onCloseQR}
          username={profile.username || userId}
          userId={userId}
          avatarUrl={profile.avatar_url || undefined}
        />
      )}

      <AlertDialog open={!!highlightToDelete} onOpenChange={(open) => !open && onHighlightDeleteCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подборку?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Подборка будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (highlightToDelete) {
                  onHighlightDeleteConfirm(highlightToDelete);
                  onHighlightDeleteCancel();
                }
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
