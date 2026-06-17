import { useCallback, useEffect, useState } from 'react';
import { GalleryEntryButton } from '@/features/create/gallery/GalleryEntryButton';
import { MediaPickerModal } from '@/features/create/gallery/MediaPickerModal';
import { isNativeGalleryAvailable, pickNativeGalleryMedia } from '@/features/create/gallery/nativeGalleryAdapter';
import type { GalleryMediaKind, GalleryPermissionState } from '@/features/create/gallery/galleryTypes';
import type { PickerSelection } from '@/features/create/gallery/mediaPickerTypes';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Upload } from 'lucide-react';

interface GalleryPickerProps {
  activeTab: string;
  isCarouselMode: boolean;
  thumbnailUrl: string | null;
  mediaKind: GalleryMediaKind | null;
  permission: GalleryPermissionState;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelected: (file: File, url: string) => void;
  onCarouselFilesAdded: (files: File[]) => void;
  onPermissionChange: (permission: GalleryPermissionState) => void;
  onThumbnailChange: (url: string | null, kind: GalleryMediaKind | null) => void;
  currentSlideCount: number;
}

export function GalleryPicker({
  activeTab,
  isCarouselMode,
  thumbnailUrl,
  mediaKind,
  permission,
  fileInputRef,
  onFileSelected,
  onCarouselFilesAdded,
  onPermissionChange,
  onThumbnailChange,
  currentSlideCount,
}: GalleryPickerProps) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const galleryAccept = activeTab === 'live' ? 'image/*' : activeTab === 'reels' ? 'video/*' : 'image/*,video/*';

  const handleOpenGallery = useCallback(async () => {
    if (isCarouselMode) {
      setShowMediaPicker(true);
      return;
    }

    try {
      if (activeTab !== 'reels' && await isNativeGalleryAvailable()) {
        const picked = await pickNativeGalleryMedia();
        if (picked) {
          onPermissionChange(picked.permission);
          if (picked.permission === 'denied') {
            toast.error('Доступ к галерее запрещен');
            return;
          }
          if (picked.file) {
          const previewUrl = picked.previewUrl || '';
          onFileSelected(picked.file, previewUrl);
          onThumbnailChange(
            picked.file.type.startsWith('image/') ? previewUrl : null,
            picked.file.type.startsWith('video/') ? 'video' : 'image'
          );
        }
        }
        return;
      }

      if (!fileInputRef.current) {
        toast.error('Галерея недоступна');
        return;
      }

      fileInputRef.current.click();
    } catch (error) {
      logger.error('[GalleryPicker] Ошибка', { error });
      toast.error('Не удалось открыть галерею');
    }
  }, [activeTab, isCarouselMode, fileInputRef, onFileSelected, onPermissionChange, onThumbnailChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (isCarouselMode) {
      const remaining = 20 - currentSlideCount;
      const toProcess = files.slice(0, remaining);

      for (const file of toProcess) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} превышает 50 МБ`);
          continue;
        }
      }

      if (files.length > remaining) {
        toast.warning(`Добавлено ${remaining} из ${files.length}`);
      }

      onCarouselFilesAdded(toProcess);
    } else {
      const file = files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        onFileSelected(file, url);
      }
    }
  }, [isCarouselMode, currentSlideCount, onFileSelected, onCarouselFilesAdded]);

  const handleMediaPickerSelect = useCallback(async (selection: PickerSelection) => {
    try {
      const files: File[] = [];
      for (const item of selection.items) {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const file = new File([blob], item.name, {
          type: blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg')
        });
        files.push(file);
      }
      onCarouselFilesAdded(files);
      setShowMediaPicker(false);
    } catch (error) {
      logger.error('[GalleryPicker] Импорт', { error });
      toast.error('Не удалось загрузить файлы');
    }
  }, [onCarouselFilesAdded]);

  return (
    <>
      <GalleryEntryButton
        thumbnailUrl={thumbnailUrl}
        mediaKind={mediaKind}
        permission={permission}
        disabled={false}
        onClick={handleOpenGallery}
      />

      <input
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept={galleryAccept}
        onChange={handleFileSelect}
        className="hidden"
      />

      <MediaPickerModal
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleMediaPickerSelect}
        maxFiles={20}
        accept={galleryAccept}
      />
    </>
  );
}

// Empty gallery state component
interface EmptyGalleryStateProps {
  onClick: () => void;
}

export function EmptyGalleryState({ onClick }: EmptyGalleryStateProps) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer text-white/50 hover:text-white/80 transition-colors"
    >
      <Upload className="w-20 h-20 opacity-40" />
      <p className="text-base font-medium">Нажмите чтобы выбрать медиа</p>
    </div>
  );
}
