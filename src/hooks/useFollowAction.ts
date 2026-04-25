/**
 * useFollowAction — единое follow-действие для списков рекомендаций.
 *
 * Зачем:
 *   - Карусель и модалка рекомендаций выполняют follow для произвольного
 *     пользователя из списка. Нужен общий guard от повторных кликов,
 *     оптимистичное обновление и откат при ошибке.
 *
 * Контракт:
 *   - `followedIds` — множество id пользователей, на которых подписан текущий
 *     пользователь (инициализируется извне через `setInitialFollowing`).
 *   - `pendingIds` — множество id, для которых запрос в полёте.
 *   - `follow(targetId)` — идемпотентный follow с in-flight guard.
 *     Повторный вызов для того же `targetId` пока идёт запрос — no-op.
 *     Возвращает `true` при успехе, `false` при ошибке / игноре.
 *   - `isFollowed(id)` / `isPending(id)` — стабильные геттеры для UI.
 *
 * Безопасность:
 *   - Само действие выполняет `followRepository.follow`, которое использует
 *     upsert с `ignoreDuplicates`, поэтому повтор безопасен на сервере.
 *   - Guard здесь — UX-оптимизация против двойного клика и гонок в UI.
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { follow as repoFollow } from '@/repositories/followRepository';
import { logger } from '@/lib/logger';

interface UseFollowActionOptions {
  /** id текущего пользователя. Если отсутствует — follow не выполняется. */
  currentUserId: string | null | undefined;
  /** Колбэк на успешный follow. Вызывается после применения состояния. */
  onFollowed?: (targetUserId: string) => void;
  /** Текст toast при ошибке. По умолчанию: "Не удалось подписаться". */
  errorMessage?: string;
}

interface UseFollowActionReturn {
  followedIds: Set<string>;
  setInitialFollowing: (ids: Set<string> | Iterable<string>) => void;
  isFollowed: (targetUserId: string) => boolean;
  isPending: (targetUserId: string) => boolean;
  follow: (targetUserId: string) => Promise<boolean>;
}

export function useFollowAction(options: UseFollowActionOptions): UseFollowActionReturn {
  const { currentUserId, onFollowed, errorMessage = 'Не удалось подписаться' } = options;

  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [pendingVersion, setPendingVersion] = useState(0);
  const pendingRef = useRef<Set<string>>(new Set());

  const bumpPending = useCallback(() => {
    setPendingVersion((v) => v + 1);
  }, []);

  const setInitialFollowing = useCallback((ids: Set<string> | Iterable<string>) => {
    setFollowedIds(ids instanceof Set ? new Set(ids) : new Set(ids));
  }, []);

  const isFollowed = useCallback(
    (targetUserId: string) => followedIds.has(targetUserId),
    [followedIds],
  );

  const isPending = useCallback(
    (targetUserId: string) => pendingRef.current.has(targetUserId),
    // pendingVersion заставляет перерисовку при изменении pendingRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingVersion],
  );

  const follow = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      if (!currentUserId) return false;
      if (targetUserId === currentUserId) return false;
      if (pendingRef.current.has(targetUserId)) return false;
      if (followedIds.has(targetUserId)) return false;

      pendingRef.current.add(targetUserId);
      bumpPending();

      // Оптимистично помечаем подписку.
      setFollowedIds((prev) => {
        if (prev.has(targetUserId)) return prev;
        const next = new Set(prev);
        next.add(targetUserId);
        return next;
      });

      try {
        await repoFollow(currentUserId, targetUserId);
        onFollowed?.(targetUserId);
        return true;
      } catch (error) {
        // Откат оптимистичного состояния.
        setFollowedIds((prev) => {
          if (!prev.has(targetUserId)) return prev;
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        logger.error('[useFollowAction] Follow failed', {
          error,
          targetUserId,
          currentUserId,
        });
        toast.error(errorMessage);
        return false;
      } finally {
        pendingRef.current.delete(targetUserId);
        bumpPending();
      }
    },
    [currentUserId, followedIds, onFollowed, errorMessage, bumpPending],
  );

  return {
    followedIds,
    setInitialFollowing,
    isFollowed,
    isPending,
    follow,
  };
}
