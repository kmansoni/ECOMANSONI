import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { sendStaticLocation, getCurrentPosition, geoErrorToKey } from "@/lib/chat/sendLocation";

interface ChatMediaDeps {
  conversationId: string;
  sendMediaMessage: (
    file: File,
    mediaType: string,
    duration?: number,
    opts?: { albumId?: string; caption?: string },
  ) => Promise<unknown>;
  isSending: boolean;
  setIsSending: (v: boolean) => void;
}

export function useChatMedia(deps: ChatMediaDeps) {
  const { conversationId, sendMediaMessage, isSending, setIsSending } = deps;

  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showAlbumPreview, setShowAlbumPreview] = useState(false);
  const [showCameraSheet, setShowCameraSheet] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [albumFiles, setAlbumFiles] = useState<File[]>([]);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const handleVideoRecord = useCallback(async (videoBlob: Blob, duration: number) => {
    const file = new File([videoBlob], `video_circle_${Date.now()}.webm`, { type: 'video/webm' });
    try {
      await sendMediaMessage(file, 'video_circle', duration);
    } catch (err) {
      logger.error("chat: video circle send failed", { conversationId, error: err });
      toast.error("Не удалось отправить видеокружок");
    }
    setShowVideoRecorder(false);
  }, [conversationId, sendMediaMessage]);

  const handleAttachment = useCallback(async (file: File, type: "image" | "video" | "document") => {
    try {
      if (type === "image") await sendMediaMessage(file, 'image');
      else if (type === "document") await sendMediaMessage(file, 'document');
      else await sendMediaMessage(file, 'video');
    } catch (err) {
      logger.error("chat: attachment send failed", { conversationId, type, error: err });
      toast.error("Не удалось прикрепить файл");
    }
  }, [conversationId, sendMediaMessage]);

  const handleAlbumFiles = useCallback((files: File[], _types: ("image" | "video")[]) => {
    setAlbumFiles(files);
    setShowAlbumPreview(true);
  }, []);

  const handleAlbumAddMore = useCallback(() => {
    albumInputRef.current?.click();
  }, []);

  const handleAlbumAddMoreChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl) return;
    const remaining = 10 - albumFiles.length;
    const toAdd = Array.from(fl).slice(0, remaining);
    if (fl.length > remaining) toast.error(`Можно добавить ещё ${remaining}`);
    setAlbumFiles((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  }, [albumFiles.length]);

  const handleAlbumSend = useCallback(async (caption: string) => {
    setShowAlbumPreview(false);
    const albumId = crypto.randomUUID();
    for (let i = 0; i < albumFiles.length; i++) {
      const f = albumFiles[i];
      const mediaType = f.type.startsWith("video/") ? "video" as const : "image" as const;
      const opts: { albumId: string; caption?: string } = { albumId };
      if (i === 0 && caption) opts.caption = caption;
      try {
        await sendMediaMessage(f, mediaType, undefined, opts);
      } catch (err) {
        logger.error("chat: album item send failed", { conversationId, idx: i, error: err });
        toast.error(`Не удалось отправить файл ${i + 1}`);
      }
    }
    setAlbumFiles([]);
  }, [albumFiles, conversationId, sendMediaMessage]);

  const handleLocationSelect = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      const coords = await getCurrentPosition();
      const clientMsgId = crypto.randomUUID();
      await sendStaticLocation({ conversationId, clientMsgId, coords });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const key = geoErrorToKey(err as GeolocationPositionError);
        toast.error(
          key === "geo_permission_denied"
            ? "Доступ к геолокации запрещён. Разрешите в настройках браузера."
            : key === "geo_timeout"
            ? "Геолокация не получена: истек таймаут."
            : "Не удалось определить местоположение.",
        );
      } else {
        toast.error("Не удалось отправить геолокацию.");
      }
    } finally {
      setIsSending(false);
    }
  }, [isSending, setIsSending, conversationId]);

  return {
    showVideoRecorder, setShowVideoRecorder,
    showAlbumPreview, setShowAlbumPreview,
    showCameraSheet, setShowCameraSheet,
    viewingImage, setViewingImage,
    viewingVideo, setViewingVideo,
    albumFiles, setAlbumFiles,
    albumInputRef,
    handleVideoRecord,
    handleAttachment,
    handleAlbumFiles,
    handleAlbumAddMore,
    handleAlbumAddMoreChange,
    handleAlbumSend,
    handleLocationSelect,
  };
}
