import { X } from 'lucide-react';
import { useNotInterested } from '@/hooks/useNotInterested';
import { toast } from 'sonner';

interface DismissedSuggestionProps {
  userId: string;
  onDismiss: (userId: string) => void;
  className?: string;
}

export function DismissedSuggestion({ userId, onDismiss, className = '' }: DismissedSuggestionProps) {
  const { markNotInterested } = useNotInterested();

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markNotInterested('user', userId, 'dont_suggest');
    onDismiss(userId);
    toast('Аккаунт скрыт', {
      description: 'Мы больше не будем рекомендовать этого пользователя',
    });
  };

  return (
    <button
      onClick={handleDismiss}
      className={`flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors ${className}`}
      aria-label="Не рекомендовать этот аккаунт"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}
