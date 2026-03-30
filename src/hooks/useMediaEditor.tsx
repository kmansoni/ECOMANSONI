import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { uploadMedia, type MediaBucket } from "@/lib/mediaUpload";
import { logger } from "@/lib/logger";

export type MediaType = "image" | "video";
export type ContentType = "post" | "story" | "reel" | "live";

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
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await uploadMedia(editedBlob, { bucket: bucket as MediaBucket });

      clearInterval(progressInterval);
      setUploadProgress(100);

      return result.url;
    } catch (error: any) {
      logger.error("[useMediaEditor] Upload error", { error });
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
