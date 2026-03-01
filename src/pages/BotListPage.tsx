/**
 * BotListPage - Страница списка ботов
 * 
 * Отображает список всех ботов пользователя с возможностью создания новых.
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Copy, 
  MoreVertical,
  Bot as BotIcon,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { botApi } from '@/lib/bots/api';
import type { Bot as BotType } from '@/lib/bots/types';

interface BotListPageProps {
  className?: string;
}

export function BotListPage({ className }: BotListPageProps) {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    try {
      setLoading(true);
      const result = await botApi.listBots();
      setBots(result.bots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого бота? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await botApi.deleteBot(botId);
      setBots(bots.filter(b => b.id !== botId));
      toast.success('Бот удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete bot');
    }
  };

  const copyBotLink = (username: string) => {
    const link = `${window.location.origin}/bot/${username}`;
    navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована');
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4", className)}>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          Ошибка: {error}
        </div>
        <button 
          onClick={loadBots}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className={cn("max-w-4xl mx-auto p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Мои боты</h1>
          <p className="text-muted-foreground">Управляйте своими ботами</p>
        </div>
        <Link
          to="/bots/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Создать бота
        </Link>
      </div>

      {/* Bot List */}
      {bots.length === 0 ? (
        <div className="text-center py-12">
          <BotIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">У вас пока нет ботов</h2>
          <p className="text-muted-foreground mb-4">
            Создайте своего первого бота, чтобы начать
          </p>
          <Link
            to="/bots/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Создать бота
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="flex items-center gap-4 p-4 bg-card border rounded-xl hover:border-primary/50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                {bot.avatar_url ? (
                  <img 
                    src={bot.avatar_url} 
                    alt={bot.display_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <BotIcon className="w-6 h-6 text-primary" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{bot.display_name}</h3>
                  {bot.is_verified && (
                    <span className="text-primary text-sm">✓</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  @{bot.username}
                </p>
                {bot.description && (
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {bot.description}
                  </p>
                )}
              </div>

              {/* Status Badge */}
              <div className={cn(
                "px-2 py-1 text-xs rounded-full",
                bot.status === 'active' 
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              )}>
                {bot.status === 'active' ? 'Активен' : bot.status}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyBotLink(bot.username)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Копировать ссылку"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <Link
                  to={`/bots/${bot.id}`}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Настройки"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <Link
                  to={`/bot/${bot.username}`}
                  target="_blank"
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Открыть"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => handleDeleteBot(bot.id)}
                  className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BotListPage;
