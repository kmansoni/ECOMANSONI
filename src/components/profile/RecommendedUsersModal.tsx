import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Loader2, ContactRound } from "lucide-react";
import { useRecommendedUsers } from "@/hooks/useRecommendedUsers";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { VerifiedBadge } from "@/components/ui/verified-badge";

interface RecommendedUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecommendedUsersModal({ isOpen, onClose }: RecommendedUsersModalProps) {
  const { users, loading, saveContacts } = useRecommendedUsers(15);
  const { user } = useAuth();
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
    if (!user) return;

    setProcessing(userId);
    try {
      if (following.has(userId)) {
        // Отписаться
        await supabase
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        setFollowing(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else {
        // Подписаться
        await supabase
          .from('followers')
          .insert({
            follower_id: user.id,
            following_id: userId
          });

        setFollowing(prev => new Set(prev).add(userId));
      }
    } catch (error) {
      logger.error('[RecommendedUsersModal] Follow error', { error });
      toast.error('Не удалось выполнить действие');
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
      <DialogContent className="glass-window max-w-md max-h-[80dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/15">
          <DialogTitle className="glass-title text-3xl">Добро пожаловать!</DialogTitle>
          <DialogDescription className="glass-muted text-base pt-2">
            {hasFromContacts 
              ? "Вот ваши друзья из контактов. Подпишитесь, чтобы видеть их контент"
              : "Подпишитесь на интересные аккаунты, чтобы видеть их контент в ленте"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Разрешение на доступ к контактам */}
        {showContactsPermission && !hasFromContacts && (
          <div className="px-6 py-4 bg-white/10 border-b border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ContactRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Найти друзей из контактов</h3>
                <p className="glass-muted text-sm mb-3">
                  Разрешите доступ к контактам, чтобы найти знакомых на платформе
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleAllowContacts}
                    className="glass-primary-btn flex-1"
                  >
                    Разрешить
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleSkipContacts}
                    className="glass-secondary-btn flex-1"
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
            <div className="glass-muted text-center py-12">
              Рекомендации пока недоступны
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((recommendedUser) => (
                <div
                  key={recommendedUser.user_id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={recommendedUser.avatar_url || undefined} />
                    <AvatarFallback>
                      <User className="w-6 h-6" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold truncate">
                        {recommendedUser.display_name || 'Пользователь'}
                      </p>
                      {recommendedUser.verified && <VerifiedBadge size="sm" />}
                      {recommendedUser.is_from_contacts && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Контакт
                        </span>
                      )}
                    </div>
                    <p className="glass-muted text-sm">
                      {recommendedUser.followers_count} {formatFollowers(recommendedUser.followers_count)}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={following.has(recommendedUser.user_id) ? "outline" : "default"}
                    onClick={() => handleFollow(recommendedUser.user_id)}
                    disabled={processing === recommendedUser.user_id}
                    className={following.has(recommendedUser.user_id) ? "glass-secondary-btn shrink-0" : "glass-primary-btn shrink-0"}
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

        <div className="px-6 pb-6 pt-4 border-t border-white/15">
          <Button
            onClick={handleContinue}
            className="glass-primary-btn w-full h-12 text-base font-semibold"
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
