import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { uploadMedia, type MediaBucket } from "@/lib/mediaUpload";

export interface MediaItem {
  url: string;
  type: "image" | "video";
  width?: number;
  height?: number;
}

async function uploadFile(
  file: File,
  bucket: string,
  _path: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(10);
  const result = await uploadMedia(file, { bucket: bucket as MediaBucket });
  onProgress?.(100);
  return result.url;
}

export function usePublish() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  /** Публикация поста */
  async function publishPost(
    content: string,
    files: File[],
    location?: string,
    taggedUsers?: string[],
    hashtags?: string[],
    visibility: "public" | "followers" | "close_friends" = "public",
  ) {
    setUploading(true);
    setProgress(0);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const mediaItems: MediaItem[] = [];
      const step = files.length > 0 ? 70 / files.length : 70;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `posts/${user.id}/${Date.now()}_${i}.${ext}`;
        const url = await uploadFile(file, "media", path, (p) => {
          setProgress(Math.round(i * step + p * step / 100));
        });
        mediaItems.push({
          url,
          type: file.type.startsWith("video/") ? "video" : "image",
        });
      }

      setProgress(80);

      const tags = hashtags ?? extractHashtags(content);

      const { data, error } = await (supabase as any).from("posts").insert({
        author_id: user.id,
        content,
        media: mediaItems,
        location: location ?? null,
        tagged_users: taggedUsers ?? [],
        hashtags: tags,
        visibility,
      }).select().single();

      if (error) throw error;
      setProgress(100);
      return { post: data, error: null };
    } catch (err: any) {
      return { post: null, error: err?.message ?? String(err) };
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /** Публикация истории */
  async function publishStory(
    file: File,
    closeFriendsOnly = false,
  ) {
    setUploading(true);
    setProgress(0);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `stories/${user.id}/${Date.now()}.${ext}`;
      const url = await uploadFile(file, "media", path, setProgress);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: url,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        expires_at: expiresAt,
        close_friends_only: closeFriendsOnly,
      }).select().single();

      if (error) throw error;
      return { story: data, error: null };
    } catch (err: any) {
      return { story: null, error: err?.message ?? String(err) };
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /** Публикация Reel */
  async function publishReel(
    videoFile: File,
    description: string,
    hashtags?: string[],
    coverTimestamp?: number,
  ) {
    setUploading(true);
    setProgress(0);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const ext = videoFile.name.split(".").pop() ?? "mp4";
      const path = `reels/${user.id}/${Date.now()}.${ext}`;
      const videoUrl = await uploadFile(videoFile, "media", path, (p) => {
        setProgress(Math.round(p * 0.9));
      });

      const tags = hashtags ?? extractHashtags(description);

      const { data, error } = await (supabase as any).from("reels").insert({
        author_id: user.id,
        video_url: videoUrl,
        description,
        hashtags: tags,
        cover_timestamp: coverTimestamp ?? 0,
      }).select().single();

      if (error) throw error;
      setProgress(100);
      return { reel: data, error: null };
    } catch (err: any) {
      return { reel: null, error: err?.message ?? String(err) };
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /** Запуск прямого эфира */
  async function startLive(title: string, category: string) {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await (supabase as any).from("live_sessions").insert({
        creator_id: user.id,
        title,
        category,
        status: "active",
        started_at: new Date().toISOString(),
        viewer_count_current: 0,
      }).select().single();

      if (error) throw error;

      navigate(`/live/broadcast/${data.id}`);
      return { session: data, error: null };
    } catch (err: any) {
      return { session: null, error: err?.message ?? String(err) };
    } finally {
      setUploading(false);
    }
  }

  return {
    publishPost,
    publishStory,
    publishReel,
    startLive,
    uploading,
    progress,
  };
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\wа-яё]+/gi) ?? [];
  return matches.map((t) => t.slice(1).toLowerCase());
}
