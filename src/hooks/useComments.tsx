import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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

      // Fetch author profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, verified")
        .in("user_id", authorIds);

      if (profilesError) throw profilesError;

      const profilesMap = new Map(
        profiles?.map((p) => [p.user_id, p]) || []
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
        const profile = profilesMap.get(comment.author_id);
        return {
          ...comment,
          author: {
            display_name: profile?.display_name || "Пользователь",
            avatar_url: profile?.avatar_url || null,
            user_id: comment.author_id,
            verified: profile?.verified || false,
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
      console.error("Error fetching comments:", err);
      setError(err.message || "Ошибка загрузки комментариев");
    } finally {
      setLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    if (postId) {
      fetchComments();
    }
  }, [postId, fetchComments]);

  const addComment = async (content: string, parentId?: string) => {
    if (!user) {
      return { error: "Необходимо войти в систему" };
    }

    try {
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

      // Refetch to get the updated list with author info
      await fetchComments();
      return { error: null, comment: data };
    } catch (err: any) {
      console.error("Error adding comment:", err);
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
      console.error("Error toggling like:", err);
      return { error: err.message || "Ошибка" };
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user) {
      return { error: "Необходимо войти в систему" };
    }

    try {
      const { error } = await (supabase
        .from("comments" as any)
        .delete()
        .eq("id", commentId)
        .eq("author_id", user.id) as any);

      if (error) throw error;

      await fetchComments();
      return { error: null };
    } catch (err: any) {
      console.error("Error deleting comment:", err);
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
