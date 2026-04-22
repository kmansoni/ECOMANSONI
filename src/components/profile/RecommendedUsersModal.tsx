import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Loader2, ContactRound } from "lucide-react";
import { useRecommendedUsers } from "@/hooks/useRecommendedUsers";
import { supabase } from "@/lib/supabase";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { buildProfilePath } from "@/lib/users/profileLinks";

interface RecommendedUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecommendedUsersModal({ isOpen, onClose }: RecommendedUsersModalProps) {
  const { users, loading, saveContacts } = useRecommendedUsers(15);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [showContactsPermission, setShowContactsPermission] = useState(true);
  const [hasFromContacts, setHasFromContacts] = useState(false);

  const loadCurrentFollowing = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id);

    if (data) {
      setFollowing(new Set(data.map(f => f.following_id)));
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      // Загружаем текущие подписки
      void loadCurrentFollowing();
    }
  }, [isOpen, loadCurrentFollowing, user]);

  useEffect(() => {
    // Проверяем есть ли пользователи из контактов
    const fromContacts = users.some(u => u.is_from_contacts);
    setHasFromContacts(fromContacts);
    if (fromContacts) {
      setShowContactsPermission(false);
    }
  }, [users]);

  const handleFollow = async (userId: string) => {
    if (!user) {
      toast.error('Пожалуйста, войдите в аккаунт');
      return;
    }

    setProcessing(userId);
    try {
      if (following.has(userId)) {
        // Отписаться
        const { error: deleteError } = await dbLoose
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        if (deleteError) {
          logger.error('[RecommendedUsersModal] Unfollow error', { error: deleteError });
          toast.error('Не удалось отписаться: ' + (deleteError.message || 'неизвестная ошибка'));
          return;
        }

        setFollowing(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        toast.success('Вы отписались');
      } else {
        // Подписаться (используем upsert вместо insert)
        const { data, error: upsertError } = await dbLoose
          .from('followers')
          .upsert({ follower_id: user.id, following_id: userId })
          .select();

        if (upsertError) {
          logger.error('[RecommendedUsersModal] Follow error', { error: upsertError, userId, currentUserId: user.id });
          toast.error('Не удалось подписаться: ' + (upsertError.message || 'неизвестная ошибка'));
          return;
        }

        logger.info('[RecommendedUsersModal] Follow success', { data, userId, currentUserId: user.id });
        setFollowing(prev => new Set(prev).add(userId));
        toast.success('Вы подписались');
      }
    } catch (error) {
      logger.error('[RecommendedUsersModal] Follow error', { error, userId, currentUserId: user.id });
      const msg = error instanceof Error ? error.message : String(error);
      toast.error('Ошибка: ' + msg);
    } finally {
      setProcessing(null);
    }
  };

  const handleContinue = () => {
    onClose();
  };

  const handleAllowContacts = async () => {
    try {
      // Здесь должен быть код для получения контактов с устройства
      // В веб-версии можно попросить пользователя импортировать CSV
      // Для примера просто закрываем окно разрешения
      toast.info("Функция доступа к контактам будет доступна в мобильном приложении");
      setShowContactsPermission(false);
    } catch (error) {
      logger.error('[RecommendedUsersModal] Contacts error', { error });
      toast.error('Не удалось получить доступ к контактам');
    }
  };

  const handleSkipContacts = () => {
    setShowContactsPermission(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-2xl font-bold">Добро пожаловать!</DialogTitle>
          <DialogDescription className="text-base pt-2">
            {hasFromContacts 
              ? "Вот ваши друзья из контактов. Подпишитесь, чтобы видеть их контент"
              : "Подпишитесь на интересные аккаунты, чтобы видеть их контент в ленте"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Разрешение на доступ к контактам */}
        {showContactsPermission && !hasFromContacts && (
          <div className="px-6 py-4 bg-muted/50 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ContactRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1 text-foreground">Найти друзей из контактов</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Разрешите доступ к контактам, чтобы найти знакомых на платформе
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleAllowContacts}
                    className="flex-1"
                  >
                    Разрешить
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleSkipContacts}
                    className="flex-1"
                  >
                    Пропустить
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Рекомендации пока недоступны
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((recommendedUser) => (
                <div
                  key={recommendedUser.user_id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 transition-colors"
                >
                  <button
                    type="button"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                    onClick={() => { onClose(); navigate(buildProfilePath({ username: recommendedUser.username ?? undefined })); }}
                    aria-label={`Перейти в профиль ${recommendedUser.display_name || 'пользователя'}`}
                  >
                    <Avatar className="w-14 h-14">
                      <AvatarImage src={recommendedUser.avatar_url || undefined} />
                      <AvatarFallback>
                        <User className="w-6 h-6" />
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    onClick={() => { onClose(); navigate(buildProfilePath({ username: recommendedUser.username ?? undefined })); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold truncate text-foreground">
                        {recommendedUser.display_name || 'Пользователь'}
                      </p>
                      {recommendedUser.verified && <VerifiedBadge size="sm" />}
                      {recommendedUser.is_from_contacts && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Контакт
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {recommendedUser.followers_count} {formatFollowers(recommendedUser.followers_count)}
                    </p>
                  </button>

                  <Button
                    size="sm"
                    variant={following.has(recommendedUser.user_id) ? "outline" : "default"}
                    onClick={() => handleFollow(recommendedUser.user_id)}
                    disabled={processing === recommendedUser.user_id}
                    className="shrink-0"
                  >
                    {processing === recommendedUser.user_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : following.has(recommendedUser.user_id) ? (
                      'Отписаться'
                    ) : (
                      'Подписаться'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-border">
          <Button
            onClick={handleContinue}
            className="w-full h-12 text-base font-semibold"
          >
            Продолжить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatFollowers(count: number): string {
  if (count === 1) return 'подписчик';
  if (count >= 2 && count <= 4) return 'подписчика';
  return 'подписчиков';
}
