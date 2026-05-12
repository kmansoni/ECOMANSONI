import React from 'react';
import { useTeenMode } from '@/hooks/useTeenMode';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const TeenModeBanner: React.FC = () => {
  const { isTeen, parentalSettings, contentFilter } = useTeenMode();

  if (!isTeen) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Teen Mode активен</strong> — контент фильтруется до PG-13
            {parentalSettings?.strictLimitedContent && (
              <Badge variant="destructive" className="ml-2">
                Strict Limited Content
              </Badge>
            )}
          </span>
        </div>
        <div className="text-xs text-amber-600">
          Макс. рейтинг: {contentFilter.maxRating}
        </div>
      </div>
    </div>
  );
};
