import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User, Loader2, X } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { VerifiedBadge } from "@/components/ui/verified-badge";

interface FollowUser {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  isFollowing: boolean;
}

interface FollowersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  type: "followers" | "following";
  title: string;
}

export function FollowersSheet({ isOpen, onClose, userId, type, title }: FollowersSheetProps) {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingInProgress, setFollowingInProgress] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      let userIds: string[] = [];

      if (type === "followers") {
        // Get users who follow this profile
        const { data: followersData, error } = await (supabase as any)
          .from("followers")
          .select("follower_id")
          .eq("following_id", userId);

        if (error) throw error;
        userIds = (followersData || []).map((f: any) => f.follower_id);
      } else {
        // Get users this profile follows
        const { data: followingData, error } = await (supabase as any)
          .from("followers")
          .select("following_id")
          .eq("follower_id", userId);

        if (error) throw error;
        userIds = (followingData || []).map((f: any) => f.following_id);
      }

      if (userIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, avatar_url, verified")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Check which users the current user follows
      let currentUserFollowing: string[] = [];
      if (currentUser) {
        const { data: followingData } = await (supabase as any)
          .from("followers")
          .select("following_id")
          .eq("follower_id", currentUser.id);
        
        currentUserFollowing = (followingData || []).map((f: any) => f.following_id);
      }

      const usersWithStatus = (profiles || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        verified: p.verified || false,
        isFollowing: currentUserFollowing.includes(p.user_id),
      }));

      setUsers(usersWithStatus);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Не удалось загрузить список");
    } finally {
      setLoading(false);
    }
  }, [userId, type, currentUser]);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, fetchUsers]);

  const handleFollowToggle = async (targetUserId: string, isCurrentlyFollowing: boolean) => {
    if (!currentUser) {
      toast.error("Войдите, чтобы подписаться");
      return;
    }

    if (targetUserId === currentUser.id) {
      return;
    }

    setFollowingInProgress(targetUserId);

    try {
      if (isCurrentlyFollowing) {
        await (supabase as any)
          .from("followers")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", targetUserId);

        setUsers(prev => prev.map(u => 
          u.user_id === targetUserId ? { ...u, isFollowing: false } : u
        ));
        toast.success("Вы отписались");
      } else {
        await (supabase as any)
          .from("followers")
          .insert({ follower_id: currentUser.id, following_id: targetUserId });

        setUsers(prev => prev.map(u => 
          u.user_id === targetUserId ? { ...u, isFollowing: true } : u
        ));
        toast.success("Вы подписались");
      }
    } catch (error) {
      console.error("Follow toggle error:", error);
      toast.error("Не удалось выполнить действие");
    } finally {
      setFollowingInProgress(null);
    }
  };

  const handleUserClick = (userId: string) => {
    onClose();
    navigate(`/user/${userId}`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[100dvh] rounded-none p-0" hideCloseButton>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="w-8" /> {/* Spacer */}
          <SheetTitle className="text-center font-semibold">{title}</SheetTitle>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 px-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <User className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                {type === "followers" ? "Нет подписчиков" : "Нет подписок"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between px-1">
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => handleUserClick(user.user_id)}
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.display_name || "User"} />
                      <AvatarFallback className="bg-muted">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="font-semibold text-sm truncate">
                          {user.display_name || "Пользователь"}
                        </p>
                        {user.verified && <VerifiedBadge size="xs" />}
                      </div>
                    </div>
                  </div>

                  {currentUser && user.user_id !== currentUser.id && (
                    <Button
                      variant={user.isFollowing ? "secondary" : "default"}
                      size="sm"
                      className="rounded-lg text-xs font-semibold h-8 px-4"
                      onClick={() => handleFollowToggle(user.user_id, user.isFollowing)}
                      disabled={followingInProgress === user.user_id}
                    >
                      {followingInProgress === user.user_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : user.isFollowing ? (
                        "Отписаться"
                      ) : (
                        "Подписаться"
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
