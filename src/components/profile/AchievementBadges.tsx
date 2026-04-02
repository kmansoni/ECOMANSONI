import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAchievements } from '@/hooks/useAchievements';
import type { Achievement } from '@/hooks/useAchievements';

interface AchievementBadgesProps {
  userId: string;
  isOwnProfile?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: 'Контент',
  social: 'Социальные',
  commerce: 'Коммерция',
  engagement: 'Активность',
  milestone: 'Достижения',
};

function BadgeIcon({ badge, size = 'md' }: { badge: Achievement; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-base' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-10 h-10 text-xl';
  const earned = badge.earned_at !== null;

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 transition-all ${
        earned
          ? 'bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/30'
          : 'bg-muted/50 grayscale opacity-40'
      }`}
      role="img"
      aria-label={`${badge.name}${earned ? ' (получен)' : ' (не получен)'}`}
    >
      {badge.icon_emoji}
    </div>
  );
}

function BadgeListItem({ badge }: { badge: Achievement }) {
  const earned = badge.earned_at !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 p-3 rounded-lg ${
        earned ? 'bg-card' : 'bg-muted/30'
      }`}
    >
      <BadgeIcon badge={badge} size="lg" />
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${earned ? 'text-foreground' : 'text-muted-foreground'}`}>
          {badge.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">{badge.description}</p>
        {earned && badge.earned_at && (
          <p className="text-xs text-primary mt-0.5">
            Получен {new Date(badge.earned_at).toLocaleDateString('ru-RU')}
          </p>
        )}
      </div>
      {earned && (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-xs text-primary">✓</span>
        </div>
      )}
    </motion.div>
  );
}

export function AchievementBadges({ userId, isOwnProfile }: AchievementBadgesProps) {
  const { badges, earnedCount, checkAndGrant, loading } = useAchievements(userId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const earnedBadges = badges.filter((b) => b.earned_at !== null);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      await checkAndGrant();
    } finally {
      setChecking(false);
    }
  }, [checkAndGrant]);

  const groupedBadges = badges.reduce<Record<string, Achievement[]>>((acc, badge) => {
    const cat = badge.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(badge);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex gap-2 px-4 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (earnedBadges.length === 0 && !isOwnProfile) return null;

  return (
    <>
      {/* Горизонтальный скролл earned badges */}
      <div className="px-4 py-2">
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-2 w-full min-h-[44px]"
          aria-label={`Достижения: ${earnedCount} из ${badges.length}`}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
            {earnedBadges.length > 0 ? (
              earnedBadges.map((badge) => (
                <motion.div
                  key={badge.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <BadgeIcon badge={badge} size="sm" />
                </motion.div>
              ))
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Award className="w-4 h-4" />
                <span className="text-xs">Нет достижений</span>
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
        </button>
      </div>

      {/* Sheet со всеми достижениями */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center justify-between">
              <span>Достижения ({earnedCount}/{badges.length})</span>
              {isOwnProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCheck}
                  disabled={checking}
                  className="min-h-[44px]"
                  aria-label="Проверить новые достижения"
                >
                  {checking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 pb-safe">
            {Object.entries(groupedBadges).map(([category, catBadges]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                <div className="space-y-1.5">
                  {catBadges.map((badge) => (
                    <BadgeListItem key={badge.id} badge={badge} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
