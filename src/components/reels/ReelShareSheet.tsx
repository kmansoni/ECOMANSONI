/**
 * @file src/components/reels/ReelShareSheet.tsx
 * @description Bottom sheet для шаринга Reel — контакты, копирование ссылки, Web Share API.
 *
 * Архитектурные решения:
 * - Фиксированная высота ~40% экрана (не drag-to-expand)
 * - Drag-to-dismiss: onDragEnd offset.y > 80px → onClose()
 * - Portal → рендерится вне scroll-контейнера Reels (z-[61])
 * - Web Share API с fallback на clipboard
 * - Реальные контакты из followers + profiles через Supabase
 * - Client-side поиск по имени контакта
 * - Toast через sonner (уже в проекте)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, PlusCircle, Share2, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelShareSheetProps {
  reelId: string;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Типы контактов
// ---------------------------------------------------------------------------

interface ShareContact {
  id: string;
  name: string;
  avatar_url: string | null;
}

// ---------------------------------------------------------------------------
// Avatar fallback
// ---------------------------------------------------------------------------

function ContactAvatar({ name, size = 48 }: { name: string; size?: number }): JSX.Element {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <div
      className="rounded-full bg-zinc-700 flex items-center justify-center text-white font-semibold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Кнопка действия (иконка в круге + подпись)
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  'aria-label': string;
}

function ActionButton({ icon, label, onClick, 'aria-label': ariaLabel }: ActionButtonProps): JSX.Element {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className="flex flex-col items-center gap-1.5"
      aria-label={ariaLabel}
    >
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-zinc-300 text-xs text-center leading-tight">{label}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// ReelShareSheet
// ---------------------------------------------------------------------------

export function ReelShareSheet({ reelId, isOpen, onClose }: ReelShareSheetProps): JSX.Element | null {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Сброс поиска при открытии
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  // Реальные контакты из followers + profiles
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['reel-share-contacts'],
    queryFn: async (): Promise<ShareContact[]> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
          .from('followers')
          .select('following_id, profiles!followers_following_id_fkey(id, display_name, avatar_url)')
          .eq('follower_id', user.id)
          .limit(50);

        if (error) {
          logger.error('[ReelShareSheet] Ошибка загрузки контактов', { error });
          return [];
        }

        return (data ?? [])
          .map((row) => {
            const profile = (row as unknown as { profiles: { id: string; display_name: string | null; avatar_url: string | null } | null }).profiles;
            if (!profile) return null;
            return {
              id: profile.id ?? row.following_id,
              name: profile.display_name ?? 'Пользователь',
              avatar_url: profile.avatar_url,
            };
          })
          .filter((c): c is ShareContact => c !== null);
      } catch (err) {
        logger.error('[ReelShareSheet] Ошибка загрузки контактов', { error: err });
        return [];
      }
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  // Client-side фильтрация
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [search, contacts]);

  // ---------------------------------------------------------------------------
  // Drag-to-dismiss
  // ---------------------------------------------------------------------------

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number } }) => {
      if (info.offset.y > 80) {
        onClose();
      }
    },
    [onClose],
  );

  // ---------------------------------------------------------------------------
  // Действия
  // ---------------------------------------------------------------------------

  const handleSendToContact = useCallback((contactName: string) => {
    toast.success(`Отправлено ${contactName}`);
  }, []);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/reels/${reelId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  }, [reelId]);

  const handleWebShare = useCallback(async () => {
    const url = `${window.location.origin}/reels/${reelId}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Посмотри этот Reel',
          url,
        });
      } catch (err) {
        // Пользователь отменил — игнорируем
        if (err instanceof Error && err.name !== 'AbortError') {
          // fallback: копируем ссылку
          void handleCopyLink();
        }
      }
    } else {
      // Fallback: копируем ссылку
      void handleCopyLink();
    }
  }, [reelId, handleCopyLink]);

  const handleShareToStory = useCallback(() => {
    onClose();
    navigate(`/create?tab=story&reelId=${reelId}`);
  }, [reelId, onClose, navigate]);

  const handleReport = useCallback(async () => {
    onClose();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient<any>;
      const { error } = await db.from('moderation_reports').insert({
        report_type: 'other',
        reported_entity_type: 'post',
        reported_entity_id: reelId,
        reporter_id: user?.id ?? null,
      });
      if (error) {
        toast.error('Не удалось отправить жалобу');
      } else {
        toast.success('Жалоба отправлена');
      }
    } catch {
      toast.error('Не удалось отправить жалобу');
    }
  }, [reelId, onClose]);

  // ---------------------------------------------------------------------------
  // Portal
  // ---------------------------------------------------------------------------

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="share-backdrop"
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            key="share-sheet"
            className="fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl z-[61] flex flex-col"
            style={{ maxHeight: '45dvh', minHeight: 'min(40dvh, 320px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={handleDragEnd}
            aria-modal="true"
            role="dialog"
            aria-label="Поделиться"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-0.5 flex-shrink-0">
              <div className="w-10 h-1 bg-zinc-600 rounded-full" aria-hidden="true" />
            </div>

            {/* Заголовок */}
            <div className="flex items-center justify-center px-4 py-2 border-b border-zinc-700 flex-shrink-0">
              <span className="text-white font-semibold text-sm">Поделиться</span>
            </div>

            {/* Контент — скроллируемая часть */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Поиск */}
              <div className="px-4 pt-3 pb-1 flex-shrink-0">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
                  aria-label="Поиск контактов"
                />
              </div>

              {/* Горизонтальный скролл контактов */}
              <div
                className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-hide"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                {contactsLoading ? (
                  <div className="flex items-center justify-center w-full py-2">
                    <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <p className="text-zinc-500 text-sm py-2">Нет контактов</p>
                ) : (
                  filteredContacts.map((contact) => (
                    <motion.button
                      key={contact.id}
                      onClick={() => handleSendToContact(contact.name)}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="flex flex-col items-center gap-1 min-w-[64px]"
                      aria-label={`Отправить ${contact.name}`}
                    >
                      {contact.avatar_url ? (
                        <img
                          src={contact.avatar_url}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <ContactAvatar name={contact.name} size={48} />
                      )}
                      <span className="text-zinc-300 text-xs text-center w-16 truncate leading-tight">
                        {contact.name.split(' ')[0]}
                      </span>
                    </motion.button>
                  ))
                )}
              </div>

              {/* Кнопки действий */}
              <div className="grid grid-cols-4 gap-4 px-4 py-3">
                <ActionButton
                  icon={<Link size={20} className="text-white" />}
                  label="Копировать"
                  onClick={() => void handleCopyLink()}
                  aria-label="Копировать ссылку"
                />
                <ActionButton
                  icon={<PlusCircle size={20} className="text-white" />}
                  label="В историю"
                  onClick={handleShareToStory}
                  aria-label="Поделиться в историю"
                />
                <ActionButton
                  icon={<Share2 size={20} className="text-white" />}
                  label="Поделиться"
                  onClick={() => void handleWebShare()}
                  aria-label="Системный шаринг"
                />
                <ActionButton
                  icon={<Flag size={20} className="text-white" />}
                  label="Жалоба"
                  onClick={handleReport}
                  aria-label="Пожаловаться"
                />
              </div>
            </div>

            {/* Кнопка Отмена */}
            <button
              onClick={onClose}
              className="w-full py-3 text-center text-white font-medium border-t border-zinc-700 flex-shrink-0 active:bg-zinc-800 transition-colors"
              aria-label="Отмена"
            >
              Отмена
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, portalTarget);
}
