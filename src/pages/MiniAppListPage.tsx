/**
 * MiniAppListPage - Страница списка мини-приложений
 * 
 * Отображает список всех мини-приложений пользователя.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Copy, 
  ExternalLink,
  Loader2,
  AppWindow
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { miniAppApi } from '@/lib/bots/api';
import type { MiniApp } from '@/lib/bots/types';

interface MiniAppListPageProps {
  className?: string;
}

export function MiniAppListPage({ className }: MiniAppListPageProps) {
  const [miniApps, setMiniApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMiniApps();
  }, []);

  const loadMiniApps = async () => {
    try {
      setLoading(true);
      const result = await miniAppApi.listMiniApps();
      setMiniApps(result.mini_apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mini apps');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMiniApp = async (appId: string) => {
    if (!confirm('Вы уверены, что хотите удалить это мини-приложение?')) {
      return;
    }

    try {
      await miniAppApi.deleteMiniApp(appId);
      setMiniApps(miniApps.filter(app => app.id !== appId));
      toast.success('Мини-приложение удалено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const copyAppLink = (slug: string) => {
    const link = `${window.location.origin}/app/${slug}`;
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
          onClick={loadMiniApps}
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
          <h1 className="text-2xl font-bold">Мини-приложения</h1>
          <p className="text-muted-foreground">Управляйте мини-приложениями</p>
        </div>
        <Link
          to="/mini-apps/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Создать
        </Link>
      </div>

      {/* Mini App List */}
      {miniApps.length === 0 ? (
        <div className="text-center py-12">
          <AppWindow className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">У вас пока нет мини-приложений</h2>
          <p className="text-muted-foreground mb-4">
            Создайте мини-приложение для расширения функциональности
          </p>
          <Link
            to="/mini-apps/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Создать
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {miniApps.map((app) => (
            <div
              key={app.id}
              className="flex items-center gap-4 p-4 bg-card border rounded-xl hover:border-primary/50 transition-colors"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                {app.icon_url ? (
                  <img 
                    src={app.icon_url} 
                    alt={app.title}
                    className="w-12 h-12 object-cover"
                  />
                ) : (
                  <AppWindow className="w-6 h-6 text-primary" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{app.title}</h3>
                <p className="text-sm text-muted-foreground">
                  /app/{app.slug}
                </p>
                {app.description && (
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {app.description}
                  </p>
                )}
              </div>

              {/* Status Badge */}
              <div className={cn(
                "px-2 py-1 text-xs rounded-full",
                app.is_active 
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-gray-100 text-gray-700"
              )}>
                {app.is_active ? 'Активно' : 'Неактивно'}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyAppLink(app.slug)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Копировать ссылку"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <Link
                  to={`/app/${app.slug}`}
                  target="_blank"
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Открыть"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <Link
                  to={`/mini-apps/${app.id}`}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Настройки"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => handleDeleteMiniApp(app.id)}
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

export default MiniAppListPage;
