import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface PublishFooterProps {
  activeTab: string;
  isPublishing: boolean;
  isLoading: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onCancel: () => void;
  title?: string;
}

export function PublishFooter({
  activeTab,
  isPublishing,
  isLoading,
  canPublish,
  onPublish,
  onCancel,
  title,
}: PublishFooterProps) {
  // Live mode footer
  if (activeTab === 'live') {
    return (
      <div className="flex-shrink-0 bg-black px-4 pb-6 pb-safe border-t border-white/10 pt-3 flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 border-white/20 text-white bg-white/5 h-11 rounded-2xl"
        >
          Отмена
        </Button>
        <Button
          onClick={onPublish}
          disabled={isLoading || isPublishing || !title?.trim()}
          className="flex-1 bg-red-600 hover:bg-red-500 h-11 rounded-2xl font-semibold text-white"
        >
          {isLoading || isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Начать эфир
        </Button>
      </div>
    );
  }

  // Default publish button
  if (canPublish) {
    return (
      <div className="flex-shrink-0 px-4 pb-6 pb-safe pt-3">
        <Button
          onClick={onPublish}
          disabled={isLoading || isPublishing}
          className="w-full bg-blue-600 hover:bg-blue-500 h-11 rounded-2xl font-semibold text-white"
        >
          {isLoading || isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Далее →'}
        </Button>
      </div>
    );
  }

  return null;
}
