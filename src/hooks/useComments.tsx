import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  author: {
    display_name: string;
    avatar_url: string | null;
    user_id: string;
    verified: boolean;
  };
  liked_by_user: boolean;
  replies?: Comment[];
}

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
}

interface CommentLikeRow {
  comment_id: string;
  user_id: string;
}

export function useComments(postId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch comments - using type assertion until types.ts is regenerated
      const { data: commentsData, error: commentsError } = await (supabase
        .from("comments" as any)
        .select(`
          id,
          post_id,
          author_id,
          parent_id,
          content,
          likes_count,
          created_at
        `)
        .eq("post_id", postId)
        .order("created_at", { ascending: true }) as any);

      if (commentsError) throw commentsError;

      const typedComments = (commentsData || []) as CommentRow[];

      if (typedComments.length === 0) {
        setComments([]);
        setLoading(false);
        return;
      }

      // Get unique author IDs
      const authorIds = [...new Set(typedComments.map((c) => c.author_id))];
      const briefMap = await fetchUserBriefMap(authorIds, supabase as any);

      // Fetch author verification flags only
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, verified")
        .in("user_id", authorIds);

      if (profilesError) throw profilesError;

      const verifiedMap = new Map(
        profiles?.map((p) => [p.user_id, Boolean(p.verified)]) || []
      );

      // Check which comments the current user has liked
      let likedCommentIds: Set<string> = new Set();
      if (user) {
        const { data: likes, error: likesError } = await (supabase
          .from("comment_likes" as any)
          .select("comment_id")
          .eq("user_id", user.id)
          .in(
            "comment_id",
            typedComments.map((c) => c.id)
          ) as any);

        if (!likesError && likes) {
          const typedLikes = likes as CommentLikeRow[];
          likedCommentIds = new Set(typedLikes.map((l) => l.comment_id));
        }
      }

      // Build comments with author and like info
      const enrichedComments: Comment[] = typedComments.map((comment) => {
        const brief = resolveUserBrief(comment.author_id, briefMap);
        return {
          ...comment,
          author: {
            display_name: brief?.display_name || comment.author_id.slice(0, 8),
            avatar_url: brief?.avatar_url || null,
            user_id: comment.author_id,
            verified: verifiedMap.get(comment.author_id) || false,
          },
          liked_by_user: likedCommentIds.has(comment.id),
        };
      });

      // Organize into tree (top-level + replies)
      const topLevel = enrichedComments.filter((c) => !c.parent_id);
      const repliesMap = new Map<string, Comment[]>();

      enrichedComments
        .filter((c) => c.parent_id)
        .forEach((reply) => {
          const existing = repliesMap.get(reply.parent_id!) || [];
          existing.push(reply);
          repliesMap.set(reply.parent_id!, existing);
        });

      topLevel.forEach((comment) => {
        comment.replies = repliesMap.get(comment.id) || [];
      });

      setComments(topLevel);
    } catch (err: any) {
      logger.error("[useComments] Error fetching comments", { error: err });
      setError("Не удалось загрузить комментарии. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    if (postId) {
      fetchComments();
    }
  }, [postId, fetchComments]);

  // ИСПРАВЛЕНИЕ дефекта #3: оптимистичное добавление без рефетча
  // Ранее: INSERT → fetchComments() (полный рефетч, N+1, мигание списка)
  // Теперь: INSERT → локальное добавление в state (мгновенно, без мигания)
  const addComment = async (content: string, parentId?: string) => {
    if (!user) {
      return { error: "Необходимо войти в систему" };
    }

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(String(content || "").trim());
      if (!hashtagVerdict.ok) {
        return { error: `HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}` };
      }

      const { data, error } = await (supabase
        .from("comments" as any)
        .insert({
          post_id: postId,
          author_id: user.id,
          parent_id: parentId || null,
          content,
        })
        .select()
        .single() as any);

      if (error) throw error;

      // Оптимистичное добавление — строим объект Comment из известных данных
      const newComment: Comment = {
        id: data.id,
        post_id: postId,
        author_id: user.id,
        parent_id: parentId || null,
        content,
        likes_count: 0,
        created_at: data.created_at ?? new Date().toISOString(),
        author: {
          display_name: (user.user_metadata?.display_name as string | undefined)
            || user.email?.split('@')[0]
            || 'Вы',
          avatar_url: (user.user_metadata?.avatar_url as string | undefined) || null,
          user_id: user.id,
          verified: false,
        },
        liked_by_user: false,
        replies: [],
      };

      if (parentId) {
        // Добавляем как reply к родительскому комментарию
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, replies: [...(c.replies || []), newComment] }
            : c
        ));
      } else {
        // Добавляем в конец списка (хронологический порядок)
        setComments(prev => [...prev, newComment]);
      }

      return { error: null, comment: data };
    } catch (err: any) {
      logger.error("[useComments] Error adding comment", { error: err });
      return { error: err.message || "Ошибка добавления комментария" };
    }
  };

  const toggleLike = async (commentId: string, isCurrentlyLiked: boolean) => {
    if (!user) {
      return { error: "Необходимо войти в систему" };
    }

    try {
      if (isCurrentlyLiked) {
        const { error } = await (supabase
          .from("comment_likes" as any)
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id) as any);

        if (error) throw error;
      } else {
        const { error } = await (supabase.from("comment_likes" as any).insert({
          comment_id: commentId,
          user_id: user.id,
        }) as any);

        if (error) throw error;
      }

      // Optimistically update the local state
      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id === commentId) {
            return {
              ...comment,
              liked_by_user: !isCurrentlyLiked,
              likes_count: isCurrentlyLiked
                ? comment.likes_count - 1
                : comment.likes_count + 1,
            };
          }
          // Check replies
          if (comment.replies) {
            return {
              ...comment,
              replies: comment.replies.map((reply) =>
                reply.id === commentId
                  ? {
                      ...reply,
                      liked_by_user: !isCurrentlyLiked,
                      likes_count: isCurrentlyLiked
                        ? reply.likes_count - 1
                        : reply.likes_count + 1,
                    }
                  : reply
              ),
            };
          }
          return comment;
        })
      );

      return { error: null };
    } catch (err: any) {
      logger.error("[useComments] Error toggling like", { error: err });
      return { error: err.message || "Ошибка" };
    }
  };

  // ИСПРАВЛЕНИЕ дефекта #35: оптимистичное удаление без рефетча
  const deleteComment = async (commentId: string) => {
    if (!user) {
      return { error: "Необходимо войти в систему" };
    }

    // Сохраняем предыдущее состояние для отката
    const prevComments = comments;

    // Оптимистичное удаление из state
    setComments(prev => {
      const filtered = prev.filter(c => c.id !== commentId);
      return filtered.map(c => ({
        ...c,
        replies: (c.replies || []).filter(r => r.id !== commentId),
      }));
    });

    try {
      const { error } = await (supabase
        .from("comments" as any)
        .delete()
        .eq("id", commentId)
        .eq("author_id", user.id) as any);

      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      // Откат при ошибке
      setComments(prevComments);
      logger.error("[useComments] Error deleting comment", { error: err });
      return { error: err.message || "Ошибка удаления" };
    }
  };

  return {
    comments,
    loading,
    error,
    addComment,
    toggleLike,
    deleteComment,
    refetch: fetchComments,
  };
}
