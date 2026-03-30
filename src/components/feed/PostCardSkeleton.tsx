/**
 * @file src/components/feed/PostCardSkeleton.tsx
 * @description Skeleton-placeholder для PostCard во время загрузки ленты.
 *
 * Воспроизводит структуру PostCard:
 * - Header: аватар + имя + время
 * - Медиа: прямоугольник 4:5
 * - Footer: иконки действий + счётчики
 * - Caption: 2 строки текста
 *
 * Используется в HomePage вместо Loader2 spinner при первоначальной загрузке.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { memo } from "react";

export const PostCardSkeleton = memo(function PostCardSkeleton() {
  return (
    <div className="bg-card border-b border-border/40 pb-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <Skeleton className="w-6 h-6 rounded-full" />
      </div>

      {/* Media — 4:5 aspect ratio */}
      <Skeleton className="w-full aspect-[4/5]" />

      {/* Action buttons */}
      <div className="flex items-center gap-4 px-4 pt-3 pb-1">
        <Skeleton className="w-6 h-6 rounded-full" />
        <Skeleton className="w-6 h-6 rounded-full" />
        <Skeleton className="w-6 h-6 rounded-full" />
        <div className="flex-1" />
        <Skeleton className="w-6 h-6 rounded-full" />
      </div>

      {/* Likes count */}
      <div className="px-4 pb-1">
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Caption */}
      <div className="px-4 space-y-1.5 pb-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
});
