/**
 * BotListPage - Страница списка ботов (Marketplace)
 *
 * Отображает список всех ботов с поиском, фильтрацией по категориям
 * и карточками. Позволяет создавать новых ботов.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import {
  Plus,
  Settings,
  Trash2,
  Copy,
  Bot as BotIcon,
  ExternalLink,
  Loader2,
  Search,
  Zap,
  Star,
  MessageCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { botApi } from '@/lib/bots/api';
import type { Bot as BotType } from '@/lib/bots/types';

interface BotListPageProps {
  className?: string;
}

const CATEGORIES = [
  { key: 'all', label: 'Все', icon: Zap },
  { key: 'productivity', label: 'Продуктивность', icon: Star },
  { key: 'entertainment', label: 'Развлечения', icon: MessageCircle },
  { key: 'education', label: 'Образование', icon: BotIcon },
  { key: 'business', label: 'Бизнес', icon: Zap },
  { key: 'utility', label: 'Утилиты', icon: Settings },
  { key: 'social', label: 'Социальные', icon: MessageCircle },
  { key: 'games', label: 'Игры', icon: BotIcon },
  { key: 'ai', label: 'AI', icon: Zap },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-500/20 text-blue-400',
  entertainment: 'bg-purple-500/20 text-purple-400',
  education: 'bg-green-500/20 text-green-400',
  business: 'bg-yellow-500/20 text-yellow-400',
  utility: 'bg-cyan-500/20 text-cyan-400',
  social: 'bg-pink-500/20 text-pink-400',
  games: 'bg-red-500/20 text-red-400',
  ai: 'bg-indigo-500/20 text-indigo-400',
  all: 'bg-border text-foreground',
};

export function BotListPage({ className }: BotListPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ref: loadMoreRef, inView } = useInView();

  const [bots, setBots] = useState<BotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  useEffect(() => {
    const state = location.state as
      | { createdBotId?: string; createdBotToken?: string; createdBotName?: string }
      | null;

    if (!state?.createdBotToken) return;

    void navigator.clipboard.writeText(state.createdBotToken).then(
      () => toast.success(`Бот «${state.createdBotName ?? 'Новый бот'}» создан. Токен скопирован.`),
      () => toast.success(`Бот «${state.createdBotName ?? 'Новый бот'}» создан. Сохраните токен.`),
    );

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

const loadBots = useCallback(async () => {
     try {
       setLoading(true);
       const result = await botApi.listBots({
         limit: 20,
       });
       setBots(result.bots);
       setNextCursor(result.nextCursor);
     } catch (err) {
       setError(err instanceof Error ? err.message : 'Не удалось загрузить ботов');
     } finally {
       setLoading(false);
     }
   }, [activeCategory]);

   const loadMoreBots = useCallback(async () => {
     if (!nextCursor || loading) return;
     try {
       setLoading(true);
       const result = await botApi.listBots({
         limit: 20,
         cursor: nextCursor,
       });
      setBots((prev) => [...prev, ...result.bots]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, activeCategory]);

  useEffect(() => {
    void loadBots();
  }, [loadBots]);

  // Infinite scroll: load more when sentinel is visible
  useEffect(() => {
    if (inView && nextCursor) {
      void loadMoreBots();
    }
  }, [inView, nextCursor, loadMoreBots]);

  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого бота? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await botApi.deleteBot(botId);
      setBots(bots.filter(b => b.id !== botId));
      toast.success('Бот удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить бота');
    }
  };

  const copyBotLink = (username: string) => {
    const link = `${window.location.origin}/bot/${username}`;
    navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована');
  };

  // Фильтрация ботов по поиску
  const filteredBots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return bots.filter((b) => {
      const category = (b.category || '').toLowerCase();
      const matchesCategory = activeCategory === 'all' || category === activeCategory;
      if (!matchesCategory) return false;

      if (!q) return true;

      return (
        b.display_name.toLowerCase().includes(q) ||
        b.username.toLowerCase().includes(q) ||
        (b.description?.toLowerCase() || '').includes(q)
      );
    });
  }, [bots, searchQuery, activeCategory]);

  if (loading && bots.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && bots.length === 0) {
    return (
      <div className={cn("p-4", className)}>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          Ошибка: {error}
        </div>
        <button
          onClick={() => void loadBots()}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className={cn("max-w-5xl mx-auto p-4 sm:p-6", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Мои боты</h1>
          <p className="text-muted-foreground">Управляйте своими ботами</p>
        </div>
        <Link
          to="/bots/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Создать бота
        </Link>
      </div>

      {/* Search + Filter bar */}
      <div className="mb-5 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск ботов по имени или описанию..."
            className="w-full pl-9 pr-4 h-10 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category pills — только если нет поиска */}
        {!searchQuery && (
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-4">
        {filteredBots.length} из {bots.length} ботов
        {searchQuery && ` · "${searchQuery}"`}
      </p>

      {/* Bot List */}
      {filteredBots.length === 0 ? (
        <div className="text-center py-16 bg-card border rounded-2xl">
          <BotIcon className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Ничего не найдено</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            {bots.length === 0
              ? 'У вас пока нет ботов.'
              : 'Попробуйте изменить поисковый запрос.'}
          </p>
          <Link
            to="/bots/new"
            className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Создать бота
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredBots.map((bot) => (
              <div
                key={bot.id}
                className="flex items-center gap-4 p-4 bg-card border rounded-2xl hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 group"
              >
                {/* Avatar */}
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
                  {bot.avatar_url ? (
                    <img
                      loading="lazy"
                      src={bot.avatar_url}
                      alt={bot.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BotIcon className="w-6 h-6 text-primary" />
                  )}
                  {bot.is_verified && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Zap className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                      {bot.display_name}
                    </h3>
                    {bot.is_verified && (
                      <span className="text-[10px] text-primary font-bold">✓</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    @{bot.username}
                  </p>
                  {bot.description && (
                    <p className="text-xs text-muted-foreground/80 truncate mt-0.5">
                      {bot.description}
                    </p>
)}
                </div>

                {/* Sidebar info */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {bot.category && (
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                      CATEGORY_COLORS[bot.category] || 'bg-border text-foreground'
                    )}>
                      {CATEGORIES.find(c => c.key === bot.category)?.label || bot.category}
                    </span>
                  )}
                  <div className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                    bot.status === 'active'
                      ? "bg-green-500/15 text-green-500"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {bot.status === 'active' ? 'Онлайн' : bot.status}
                  </div>
                  {bot.rating != null && (
                    <div className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-primary text-primary" />
                      <span className="text-[10px] text-foreground">{bot.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 ml-2">
                  <button
                    onClick={() => copyBotLink(bot.username)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Копировать ссылку"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    to={`/bots/${bot.id}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Настройки"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`/bot/${bot.username}`}
                    target="_blank"
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Открыть"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDeleteBot(bot.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {nextCursor && (
            <div ref={loadMoreRef} className="flex justify-center py-6">
              {loading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
              {!loading && <span className="text-xs text-muted-foreground">Прокрутите для загрузки</span>}
            </div>
          )}

          {!nextCursor && bots.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              Все боты загружены
            </p>
          )}
        </>
      )}

      {/* Create bot CTA when empty */}
      {filteredBots.length === 0 && bots.length > 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Нет ботов, соответствующих запросу</p>
        </div>
      )}
    </div>
  );
}

export default BotListPage;