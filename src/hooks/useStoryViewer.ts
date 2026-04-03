/**
 * @file src/hooks/useStoryViewer.ts
 * @description Хук навигации между stories и пользователями.
 * Управляет прогрессом, паузой, preload, записью просмотров и реакций.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStoryViews } from "@/hooks/useStoryViews";
import { logger } from "@/lib/logger";
import type { UserWithStories, Story } from "@/hooks/useStories";

const STORY_DURATION = 5000;
const PROGRESS_INTERVAL = 50;

interface UseStoryViewerOptions {
  usersWithStories: UserWithStories[];
  initialUserIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function useStoryViewer({
  usersWithStories,
  initialUserIndex,
  isOpen,
  onClose,
}: UseStoryViewerOptions) {
  const { user } = useAuth();

  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);

  // Refs для стабильных значений внутри интервала
  const currentStoryIndexRef = useRef(0);
  const totalStoriesRef = useRef(0);
  const currentUserIndexRef = useRef(0);
  const usersLengthRef = useRef(0);
  const durationRef = useRef(STORY_DURATION);
  const onCloseRef = useRef(onClose);

  const activeUsers = useMemo(
    () => usersWithStories.filter((u) => u.stories.length > 0),
    [usersWithStories],
  );

  const currentUser = activeUsers[currentUserIndex] ?? null;
  const currentStories = currentUser?.stories ?? [];
  const currentStory = currentStories[currentStoryIndex] ?? null;
  const effectiveDuration = videoDurationMs ?? STORY_DURATION;

  // Сброс при открытии
  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      const target = usersWithStories[initialUserIndex];
      const idx = activeUsers.findIndex((u) => u.user_id === target?.user_id);
      setCurrentUserIndex(idx >= 0 ? idx : 0);
      setCurrentStoryIndex(0);
      setProgress(0);
    }
    if (!isOpen) {
      hasInitialized.current = false;
    }
  }, [isOpen, initialUserIndex, usersWithStories, activeUsers]);

  // Сброс длительности видео при смене story
  useEffect(() => {
    setVideoDurationMs(null);
  }, [currentStory?.id]);

  // Запись просмотра
  const { views, viewers, recordView, isAuthor } = useStoryViews(
    currentStory?.id,
    currentStory?.author_id,
  );

  useEffect(() => {
    if (isOpen && currentStory?.id) {
      recordView(currentStory.id);
    }
  }, [isOpen, currentStory?.id, recordView]);

  // Синхронизация refs
  useEffect(() => { currentStoryIndexRef.current = currentStoryIndex; }, [currentStoryIndex]);
  useEffect(() => { totalStoriesRef.current = currentStories.length; }, [currentStories.length]);
  useEffect(() => { currentUserIndexRef.current = currentUserIndex; }, [currentUserIndex]);
  useEffect(() => { usersLengthRef.current = activeUsers.length; }, [activeUsers.length]);
  useEffect(() => { durationRef.current = effectiveDuration; }, [effectiveDuration]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Прогресс-таймер
  useEffect(() => {
    if (!isOpen || isPaused) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      return;
    }

    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        const delta = 100 / (durationRef.current / PROGRESS_INTERVAL);
        const next = prev + delta;

        if (next >= 100) {
          if (currentStoryIndexRef.current < totalStoriesRef.current - 1) {
            setCurrentStoryIndex((c) => c + 1);
            return 0;
          }
          if (currentUserIndexRef.current < usersLengthRef.current - 1) {
            setCurrentUserIndex((c) => c + 1);
            setCurrentStoryIndex(0);
            return 0;
          }
          onCloseRef.current();
          return 100;
        }
        return next;
      });
    }, PROGRESS_INTERVAL);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
    };
  }, [isOpen, isPaused]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const goNext = useCallback(() => {
    if (currentStoryIndex < currentStories.length - 1) {
      setCurrentStoryIndex((c) => c + 1);
      setProgress(0);
    } else if (currentUserIndex < activeUsers.length - 1) {
      setCurrentUserIndex((c) => c + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentStoryIndex, currentStories.length, currentUserIndex, activeUsers.length, onClose]);

  const goPrev = useCallback(() => {
    if (progress > 20 || currentStoryIndex > 0) {
      if (currentStoryIndex > 0 && progress <= 20) {
        setCurrentStoryIndex((c) => c - 1);
      }
      setProgress(0);
    } else if (currentUserIndex > 0) {
      const prevUser = activeUsers[currentUserIndex - 1];
      setCurrentUserIndex(currentUserIndex - 1);
      setCurrentStoryIndex(prevUser.stories.length - 1);
      setProgress(0);
    }
  }, [currentUserIndex, currentStoryIndex, progress, activeUsers]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  const setVideoLoaded = useCallback((durationSec: number) => {
    if (Number.isFinite(durationSec) && durationSec > 0) {
      setVideoDurationMs(Math.round(durationSec * 1000));
    }
  }, []);

  // Preload следующих stories
  useEffect(() => {
    if (!isOpen || !currentStory) return;

    const nextStories: Story[] = [];
    // Следующая в текущей серии
    if (currentStoryIndex < currentStories.length - 1) {
      nextStories.push(currentStories[currentStoryIndex + 1]);
    }
    // Первая у следующего пользователя
    if (currentUserIndex < activeUsers.length - 1) {
      const nextUser = activeUsers[currentUserIndex + 1];
      if (nextUser.stories[0]) {
        nextStories.push(nextUser.stories[0]);
      }
    }

    nextStories.forEach((story) => {
      if (story.media_type === "image") {
        const img = new Image();
        img.src = story.media_url;
      } else if (story.media_type === "video") {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "video";
        link.href = story.media_url;
        document.head.appendChild(link);
      }
    });
  }, [isOpen, currentStory?.id, currentStoryIndex, currentUserIndex, currentStories, activeUsers]);

  // Ответ на story (DM reply)
  const sendReply = useCallback(
    async (text: string) => {
      if (!user || !currentStory) return;
      try {
        const { error } = await (supabase as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> } }).from("story_replies").insert({
          story_id: currentStory.id,
          sender_id: user.id,
          recipient_id: currentStory.author_id,
          message: text.trim(),
        });
        if (error) {
          logger.error("[useStoryViewer] Ошибка отправки ответа", { error });
        }
      } catch (err) {
        logger.error("[useStoryViewer] Ошибка отправки ответа", { error: err });
      }
    },
    [user, currentStory],
  );

  return {
    // Состояние
    activeUsers,
    currentUser,
    currentStory,
    currentStories,
    currentStoryIndex,
    progress,
    isPaused,
    effectiveDuration,
    // Просмотры
    views,
    viewers,
    isAuthor,
    // Навигация
    goNext,
    goPrev,
    pause,
    resume,
    setVideoLoaded,
    sendReply,
  } as const;
}
