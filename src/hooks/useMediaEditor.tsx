import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type MediaType = "image" | "video";
export type ContentType = "post" | "story" | "reel";

interface EditorConfig {
  aspectRatio?: number; // width / height, e.g., 1 for square, 9/16 for stories
  contentType: ContentType;
  maxDuration?: number; // seconds, for video
}

interface UseMediaEditorReturn {
  isEditorOpen: boolean;
  editingMedia: File | null;
  editedBlob: Blob | null;
  editedPreviewUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  openEditor: (file: File, config: EditorConfig) => void;
  closeEditor: () => void;
  saveEditedMedia: (blob: Blob) => void;
  uploadToStorage: (bucket: string) => Promise<string | null>;
  resetEditor: () => void;
  editorConfig: EditorConfig | null;
}

export function useMediaEditor(): UseMediaEditorReturn {
  const { user } = useAuth();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<File | null>(null);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [editedPreviewUrl, setEditedPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editorConfig, setEditorConfig] = useState<EditorConfig | null>(null);
  
  const previewUrlRef = useRef<string | null>(null);

  const openEditor = useCallback((file: File, config: EditorConfig) => {
    setEditingMedia(file);
    setEditorConfig(config);
    setIsEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const saveEditedMedia = useCallback((blob: Blob) => {
    // Revoke previous preview URL
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    
    setEditedBlob(blob);
    setEditedPreviewUrl(url);
    setIsEditorOpen(false);
    
    toast.success("Изменения применены");
  }, []);

  const uploadToStorage = useCallback(async (bucket: string): Promise<string | null> => {
    if (!user || !editedBlob) {
      toast.error("Нет данных для загрузки");
      return null;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Determine file extension based on blob type
      const mimeType = editedBlob.type;
      const isVideo = mimeType.startsWith("video/");
      const extension = isVideo 
        ? "mp4" 
        : mimeType.includes("png") ? "png" : "jpg";

      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, editedBlob, {
          cacheControl: "3600",
          contentType: mimeType,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(100);

      const { data: publicUrl } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return publicUrl.publicUrl;
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Ошибка загрузки: " + error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [user, editedBlob]);

  const resetEditor = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setEditingMedia(null);
    setEditedBlob(null);
    setEditedPreviewUrl(null);
    setEditorConfig(null);
    setUploadProgress(0);
  }, []);

  return {
    isEditorOpen,
    editingMedia,
    editedBlob,
    editedPreviewUrl,
    isUploading,
    uploadProgress,
    openEditor,
    closeEditor,
    saveEditedMedia,
    uploadToStorage,
    resetEditor,
    editorConfig,
  };
}
