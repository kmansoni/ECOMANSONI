import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import {
  X, Image, Film, Radio, Camera, Loader2, RotateCw, Upload,
  Zap, ZapOff, Timer, Settings, Sparkles, Music2, FlipHorizontal,
  Wand2, User, ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useChatOpen } from '@/contexts/ChatOpenContext';
import { useAuth } from '@/hooks/useAuth';
import type { ContentType } from '@/hooks/useMediaEditor';
import { useUnifiedContentCreator } from '@/hooks/useUnifiedContentCreator';
import type { UnifiedContent } from '@/hooks/useUnifiedContentCreator';
import { checkHashtagsAllowedForText } from '@/lib/hashtagModeration';
import { useIsMobile } from '@/hooks/use-mobile';
import { CameraHost, type CameraHostHandle, type CaptureMode } from '@/components/camera/CameraHost';
import type { CameraDebugSnapshot } from '@/components/camera/CameraHost';
import { SimpleMediaEditor } from '@/components/editor';
import { editorApi } from '@/features/editor/api';
import { TabContentEditor } from './TabContentEditor';
import {
  getDefaultEditorState,
  editorStateReducer,
  validateEditorState,
  validateMediaFile,
} from './editorStateModel';
import { logger } from '@/lib/logger';
import { applyImageFilter } from '@/lib/applyImageFilter';
import { GalleryEntryButton } from '@/features/create/gallery/GalleryEntryButton';
import type { GalleryMediaKind, GalleryPermissionState } from '@/features/create/gallery/galleryTypes';
import { isNativeGalleryAvailable, pickNativeGalleryMedia } from '@/features/create/gallery/nativeGalleryAdapter';

interface CreateContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (contentType: ContentType) => void;
  initialTab?: TabType;
}

type TabType = 'publications' | 'stories' | 'reels' | 'live';
type CameraMode = 'camera' | 'gallery';
type FlashMode = 'off' | 'on' | 'auto';
type StoryComposeMode = 'camera' | 'text';

const TABS: Array<{ id: TabType; label: string; icon: LucideIcon; contentType: ContentType }> = [
  { id: 'publications', label: 'Публикация', icon: Image, contentType: 'post' },
  { id: 'stories', label: 'История', icon: Camera, contentType: 'story' },
  { id: 'reels', label: 'Видео Reels', icon: Film, contentType: 'reel' },
  { id: 'live', label: 'Прямой эфир', icon: Radio, contentType: 'live' },
];

const ZOOM_LEVELS = [1, 2, 3] as const;

type QuickPanel = 'audio' | 'effects' | null;

type AudioTrackOption = {
  id: string;
  title: string;
  artist?: string | null;
};

const REEL_EFFECT_PRESETS = [
  { id: 'none', label: 'Без эффекта' },
  { id: 'cinematic', label: 'Кино' },
  { id: 'vintage', label: 'Винтаж' },
  { id: 'vivid', label: 'Яркий' },
] as const;

const TEXT_STORY_BACKGROUNDS = [
  { id: 'gradient-aurora', label: 'Аврора', className: 'from-slate-950 via-violet-700 to-cyan-500' },
  { id: 'sunset', label: 'Закат', className: 'from-red-950 via-orange-500 to-yellow-300' },
  { id: 'forest', label: 'Лес', className: 'from-emerald-950 via-green-600 to-lime-300' },
  { id: 'graphite', label: 'Графит', className: 'from-slate-950 via-slate-600 to-gray-900' },
] as const;

const TEXT_STORY_FONTS = [
  { id: 'classic', label: 'Classic', className: 'font-sans' },
  { id: 'serif', label: 'Serif', className: 'font-serif' },
  { id: 'mono', label: 'Mono', className: 'font-mono' },
] as const;

export function CreateContentModal({ isOpen, onClose, onSuccess, initialTab = 'publications' }: CreateContentModalProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { setIsCreatingContent } = useChatOpen();
  const {
    isLoading,
    error,
    setActiveContentType,
    uploadStoryMedia,
    createTextStory,
    uploadPostMedia,
    uploadReelMedia,
    createLiveSession,
  } = useUnifiedContentCreator();

  const [activeTab, setActiveTab] = useState<TabType>('publications');
  const [cameraMode, setCameraMode] = useState<CameraMode>('camera');
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCameraRecording, setIsCameraRecording] = useState(false);
  const [cameraDebug, setCameraDebug] = useState<CameraDebugSnapshot | null>(null);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [storyComposeMode, setStoryComposeMode] = useState<StoryComposeMode>('camera');
  const [textStoryText, setTextStoryText] = useState('');
  const [textStoryBackgroundId, setTextStoryBackgroundId] = useState<(typeof TEXT_STORY_BACKGROUNDS)[number]['id']>('gradient-aurora');
  const [textStoryFontId, setTextStoryFontId] = useState<(typeof TEXT_STORY_FONTS)[number]['id']>('classic');
  const [textStoryAlign, setTextStoryAlign] = useState<'left' | 'center' | 'right'>('center');
  const [zoomIndex, setZoomIndex] = useState(0); // 1x by default
  const [captureTimerSec, setCaptureTimerSec] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);
  const [musicTitle, setMusicTitle] = useState('');
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState<string | null>(null);
  const [audioQuery, setAudioQuery] = useState('');
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null);
  const [galleryPermission, setGalleryPermission] = useState<GalleryPermissionState>('unknown');
  const [lastGalleryThumbnailUrl, setLastGalleryThumbnailUrl] = useState<string | null>(null);
  const [lastGalleryMediaKind, setLastGalleryMediaKind] = useState<GalleryMediaKind | null>(null);
  const [reelEffectPreset, setReelEffectPreset] = useState<(typeof REEL_EFFECT_PRESETS)[number]['id']>('none');
  const [reelFaceEnhance, setReelFaceEnhance] = useState(false);
  const [reelAiEnhance, setReelAiEnhance] = useState(false);
  const [reelMaxDurationSec, setReelMaxDurationSec] = useState<60 | 90>(60);
  const [reelTaggedUsers, setReelTaggedUsers] = useState('');
  const [reelLocationName, setReelLocationName] = useState('');
  const [reelAudience, setReelAudience] = useState<'public' | 'followers' | 'private'>('public');
  const [reelAllowComments, setReelAllowComments] = useState(true);
  const [reelAllowRemix, setReelAllowRemix] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [reelClientPublishId, setReelClientPublishId] = useState<string | null>(null);
  const [showReelEditor, setShowReelEditor] = useState(false);

  // CRITICAL FIX #1: EditorState Management (перемещено из TabEditor)
  const [editorState, dispatchEditor] = useReducer(
    editorStateReducer,
    undefined,
    getDefaultEditorState,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraHostRef = useRef<CameraHostHandle | null>(null);
  const publishInFlightRef = useRef(false);
  const captureTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // CRITICAL FIX #5: URL cleanup - предотвращение утечек памяти
    return () => {
      if (captureTimerRef.current) {
        window.clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      if (previewUrl && previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {
          logger.warn('[CreateContentModal] Не удалось отозвать object URL', { error: e });
        }
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (lastGalleryThumbnailUrl && lastGalleryThumbnailUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(lastGalleryThumbnailUrl);
        } catch (e) {
          logger.warn('[CreateContentModal] Не удалось отозвать thumbnail object URL', { error: e });
        }
      }
    };
  }, [lastGalleryThumbnailUrl]);

  useEffect(() => {
    setIsCreatingContent(isOpen);

    return () => {
      setIsCreatingContent(false);
    };
  }, [isOpen, setIsCreatingContent]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setActiveContentType(TABS.find((t) => t.id === initialTab)?.contentType || 'post');
    setCameraMode(initialTab === 'live' ? 'gallery' : 'camera');
    setShowCaptionEditor(false);
  }, [isOpen, initialTab, setActiveContentType]);

  // Lock body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const getReelsPublishStorageKey = useCallback(() => {
    if (!user?.id) return null;
    return `reels_client_publish_id:${user.id}`;
  }, [user?.id]);

  const clearStoredReelPublishId = useCallback(() => {
    const storageKey = getReelsPublishStorageKey();
    if (!storageKey) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch (e) {
      logger.warn('[CreateContentModal] Не удалось очистить reel publish id из sessionStorage', { error: e });
    }
  }, [getReelsPublishStorageKey]);

  const getStableReelPublishId = useCallback((): string => {
    if (reelClientPublishId) return reelClientPublishId;

    const storageKey = getReelsPublishStorageKey();
    let resolvedId: string | null = null;

    if (storageKey) {
      try {
        resolvedId = sessionStorage.getItem(storageKey);
      } catch (e) {
        logger.warn('[CreateContentModal] Не удалось прочитать reel publish id из sessionStorage', { error: e });
        resolvedId = null;
      }
    }

    if (!resolvedId) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        resolvedId = crypto.randomUUID();
      } else {
        resolvedId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      if (storageKey) {
        try {
          sessionStorage.setItem(storageKey, resolvedId);
        } catch (e) {
          logger.warn('[CreateContentModal] Не удалось сохранить reel publish id в sessionStorage', { error: e });
        }
      }
    }

    setReelClientPublishId(resolvedId);
    return resolvedId;
  }, [getReelsPublishStorageKey, reelClientPublishId]);

  const getVideoDurationSeconds = useCallback((file: File) => {
    return new Promise<number | null>((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      const finalize = (duration: number | null) => {
        URL.revokeObjectURL(objectUrl);
        resolve(duration);
      };

      video.onloadedmetadata = () => {
        const d = Number(video.duration);
        finalize(Number.isFinite(d) ? d : null);
      };

      video.onerror = () => finalize(null);
      video.src = objectUrl;
    });
  }, []);

  const loadAudioTracks = useCallback(async (queryText?: string) => {
    setIsAudioLoading(true);
    try {
      const response = await editorApi.searchMusic({
        page: 1,
        limit: 20,
        query: (queryText ?? '').trim() || undefined,
      });

      setAudioTracks(
        response.data
          .filter((row) => row?.id && row?.title)
          .map((row) => ({
            id: String(row.id),
            title: String(row.title),
            artist: row.artist ? String(row.artist) : null,
          })),
      );
    } catch (err) {
      logger.error('[CreateContentModal] Не удалось загрузить аудио-треки', { error: err });
      toast.error('Не удалось загрузить аудио-треки');
    } finally {
      setIsAudioLoading(false);
    }
  }, []);

  const setPreviewFromCapture = (file: File, url: string) => {
    // CRITICAL FIX #1: Reset editor state on new capture
    dispatchEditor({ type: 'CLEAR_ALL' });

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(url);
    setCameraMode('gallery');
    setShowCaptionEditor(true);
    setReelClientPublishId(null);
    clearStoredReelPublishId();
  };

  const handleTabChange = useCallback((tabId: TabType) => {
    if (isCameraRecording) {
      toast.error('Остановите запись перед переключением режима');
      return;
    }
    setActiveTab(tabId);
    setStoryComposeMode('camera');
    setQuickPanel(null);
    setShowCameraSettings(false);
    setActiveContentType(TABS.find(t => t.id === tabId)?.contentType || 'post');
    setCameraMode(tabId === 'live' ? 'gallery' : 'camera');
    setShowCaptionEditor(false);
  }, [isCameraRecording, setActiveContentType]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    const minSwipeDistance = 50;
    const tabIndex = TABS.findIndex(t => t.id === activeTab);
    if (diff > minSwipeDistance && tabIndex < TABS.length - 1) {
      handleTabChange(TABS[tabIndex + 1].id);
    } else if (diff < -minSwipeDistance && tabIndex > 0) {
      handleTabChange(TABS[tabIndex - 1].id);
    }
    setTouchStart(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tabIndex = TABS.findIndex(t => t.id === activeTab);
    // Fixed: ArrowRight = next tab, ArrowLeft = previous tab
    if (e.key === 'ArrowRight' && tabIndex < TABS.length - 1) {
      handleTabChange(TABS[tabIndex + 1].id);
    } else if (e.key === 'ArrowLeft' && tabIndex > 0) {
      handleTabChange(TABS[tabIndex - 1].id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey && tabIndex > 0) {
        handleTabChange(TABS[tabIndex - 1].id);
      } else if (!e.shiftKey && tabIndex < TABS.length - 1) {
        handleTabChange(TABS[tabIndex + 1].id);
      }
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const applyGalleryFile = useCallback(async (file: File, providedPreviewUrl?: string) => {
    dispatchEditor({ type: 'CLEAR_ALL' });

    if (activeTab === 'reels' && file.type.startsWith('video/')) {
      const duration = await getVideoDurationSeconds(file);
      if (duration != null && duration > 90) {
        toast.error('Выберите видео короче 90 секунд.');
        if (providedPreviewUrl) URL.revokeObjectURL(providedPreviewUrl);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setSelectedFile(file);
    const url = providedPreviewUrl ?? URL.createObjectURL(file);
    setPreviewUrl(url);
    setGalleryPermission('granted');
    setLastGalleryMediaKind(file.type.startsWith('video/') ? 'video' : 'image');
    setLastGalleryThumbnailUrl(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
    setCameraMode('gallery');
    setShowCaptionEditor(true);
    setReelClientPublishId(null);
    clearStoredReelPublishId();
  }, [activeTab, clearStoredReelPublishId, getVideoDurationSeconds]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void applyGalleryFile(file);
    }
  };

  const handlePublish = async () => {
    if (publishInFlightRef.current) return;
    publishInFlightRef.current = true;
    setIsPublishing(true);

    try {
      // CRITICAL FIX #3 & #4 & #6: Валидация + Schedule передача + Форма валидация
      const currentTab = TABS.find((t) => t.id === activeTab);

      // Валидация состояния редактора
      const validation = validateEditorState(editorState, activeTab);
      if (!validation.valid) {
        toast.error(validation.error || 'Ошибка валидации');
        return;
      }

      // Показываем предупреждения если есть
      if (validation.warnings) {
        validation.warnings.forEach((w) => toast.warning(w));
      }

      if (activeTab === 'live') {
        if (!title.trim()) {
          toast.error('Укажите название трансляции');
          return;
        }
        await createLiveSession(title, category, previewUrl || undefined);
        toast.success('Трансляция готова к началу!');
        onSuccess?.('live');
        resetForm();
        onClose();
      } else {
        if (activeTab === 'stories' && storyComposeMode === 'text') {
          const text = textStoryText.trim();
          if (!text) {
            toast.error('Введите текст истории');
            return;
          }

          const result = await createTextStory({
            text,
            backgroundId: textStoryBackgroundId,
            fontId: textStoryFontId,
            align: textStoryAlign,
            color: '#ffffff',
          });

          if (result) {
            toast.success('История успешно загружена!');
            onSuccess?.(result.content_type);
            resetForm();
            onClose();
          }
          return;
        }

        if (!selectedFile) {
          toast.error('Выберите медиа-файл');
          return;
        }

        // CRITICAL FIX #6: Валидация файла перед загрузкой
        const fileValidation = validateMediaFile(selectedFile, activeTab);
        if (!fileValidation.valid) {
          toast.error(fileValidation.error || 'Некорректный файл');
          return;
        }

        if (activeTab === 'reels') {
          if (selectedFile.type.startsWith('video/')) {
            const duration = await getVideoDurationSeconds(selectedFile);
            if (duration != null && duration > reelMaxDurationSec) {
              toast.error(`Максимальная длительность в текущем режиме: ${reelMaxDurationSec}с`);
              return;
            }
          }

          const hashtagVerdict = await checkHashtagsAllowedForText(caption.trim());
          if (!hashtagVerdict.ok) {
            const blockedTags = 'blockedTags' in hashtagVerdict ? hashtagVerdict.blockedTags : [];
            toast.error('Некоторые хештеги недоступны', {
              description: blockedTags.join(', '),
            });
            return;
          }
        }

        // Создаем metadata с scheduling информацией
        const metadata = {
          scheduledAt: editorState.scheduledDate?.toISOString() || null,
          filters: {
            selectedIdx: editorState.selectedFilterIdx,
            intensity: editorState.filterIntensity,
          },
          adjustments: editorState.adjustments,
          peopleTags: editorState.peopleTags,
          location: editorState.location,
          draftId: editorState.draftId,
        };

        let result: UnifiedContent | null = null;

        // Применяем фильтры к изображению перед загрузкой (для publications)
        let processedFile = selectedFile;
        if (activeTab === 'publications' && selectedFile.type.startsWith('image/')) {
          processedFile = await applyImageFilter(selectedFile, {
            filterIdx: editorState.selectedFilterIdx,
            filterIntensity: editorState.filterIntensity,
            adjustments: editorState.adjustments,
          });
        }

        // CRITICAL FIX #4: передаем scheduling metadata к backend
        switch (activeTab) {
          case 'publications':
            result = await uploadPostMedia(processedFile, caption, metadata.scheduledAt, {
              hideLikes: editorState.hideLikes,
              commentsDisabled: editorState.commentsDisabled,
            });
            if (result && metadata.scheduledAt) {
              toast.info(`Публикация запланирована на ${new Date(metadata.scheduledAt).toLocaleString('ru')}`);
            }
            break;
          case 'stories':
            result = await uploadStoryMedia(selectedFile, caption);
            if (result && metadata.scheduledAt) {
              toast.info(`История запланирована на ${new Date(metadata.scheduledAt).toLocaleString('ru')}`);
            }
            break;
          case 'reels':
            result = await uploadReelMedia(selectedFile, caption, {
              clientPublishId: getStableReelPublishId(),
              musicTitle,
              musicTrackId: selectedMusicTrackId,
              effectPreset: reelEffectPreset,
              faceEnhance: reelFaceEnhance,
              aiEnhance: reelAiEnhance,
              maxDurationSec: reelMaxDurationSec,
              taggedUsers: reelTaggedUsers
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
              locationName: reelLocationName.trim() || null,
              visibility: reelAudience,
              allowComments: reelAllowComments,
              allowRemix: reelAllowRemix,
            });
            if (result && metadata.scheduledAt) {
              toast.info(`Видео запланировано на ${new Date(metadata.scheduledAt).toLocaleString('ru')}`);
            }
            break;
        }

        if (result) {
          toast.success(`${currentTab?.label} успешно загружена!`);
          onSuccess?.(result.content_type);
          resetForm();
          onClose();
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : error;
      toast.error(errorMsg || 'Ошибка при публикации');
      logger.error('[CreateContentModal] Ошибка публикации', { error: err });
    } finally {
      publishInFlightRef.current = false;
      setIsPublishing(false);
    }
  };

  const resetForm = () => {
    setCaption('');
    setTitle('');
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCategory('other');
    setMusicTitle('');
    setSelectedMusicTrackId(null);
    setAudioQuery('');
    setAudioTracks([]);
    setQuickPanel(null);
    setShowCameraSettings(false);
    setReelEffectPreset('none');
    setReelFaceEnhance(false);
    setReelAiEnhance(false);
    setReelMaxDurationSec(60);
    setReelTaggedUsers('');
    setReelLocationName('');
    setReelAudience('public');
    setReelAllowComments(true);
    setReelAllowRemix(true);
    setCameraMode('camera');
    setShowCaptionEditor(false);
    setCaptureTimerSec(0);
    setTimerCountdown(null);
    setFlashMode('off');
    setStoryComposeMode('camera');
    setTextStoryText('');
    setTextStoryBackgroundId('gradient-aurora');
    setTextStoryFontId('classic');
    setTextStoryAlign('center');
    setZoomIndex(0);
    setReelClientPublishId(null);
    clearStoredReelPublishId();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isCameraRecording) { toast.error('Остановите запись перед закрытием'); return; }
    if (!isLoading) { resetForm(); onClose(); }
  };

  const cycleFlash = () => {
    void (async () => {
      const nextMode: FlashMode = flashMode === 'off' ? 'on' : 'off';
      if (nextMode === 'on') {
        const enabled = await cameraHostRef.current?.setTorchEnabled(true);
        if (!enabled) {
          toast.error('Вспышка недоступна на этой камере');
          setFlashMode('off');
          return;
        }
      } else {
        await cameraHostRef.current?.setTorchEnabled(false);
      }
      setFlashMode(nextMode);
    })();
  };

  const cycleZoom = () => {
    setZoomIndex(prev => {
      const nextIndex = (prev + 1) % ZOOM_LEVELS.length;
      void cameraHostRef.current?.setZoomLevel(ZOOM_LEVELS[nextIndex]);
      return nextIndex;
    });
  };

  const setZoomLevelIndex = (nextIndex: number) => {
    setZoomIndex(nextIndex);
    void cameraHostRef.current?.setZoomLevel(ZOOM_LEVELS[nextIndex]);
  };

  const cycleTimer = () => {
    setCaptureTimerSec(prev => (prev === 0 ? 3 : prev === 3 ? 10 : 0));
  };

  const runCapture = useCallback(() => {
    if (activeTab === 'reels') {
      void cameraHostRef.current?.recordVideo();
    } else {
      void cameraHostRef.current?.capturePhoto();
    }
  }, [activeTab]);

  const handleCapture = useCallback(() => {
    if (timerCountdown != null) return;

    if (activeTab === 'reels' && isCameraRecording) {
      cameraHostRef.current?.stopRecording();
      return;
    }

    if (captureTimerSec <= 0) {
      runCapture();
      return;
    }

    setTimerCountdown(captureTimerSec);
    captureTimerRef.current = window.setInterval(() => {
      setTimerCountdown(prev => {
        if (prev == null) return prev;
        if (prev <= 1) {
          if (captureTimerRef.current) {
            window.clearInterval(captureTimerRef.current);
            captureTimerRef.current = null;
          }
          window.setTimeout(runCapture, 0);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [activeTab, captureTimerSec, isCameraRecording, runCapture, timerCountdown]);

  const handleCameraReadyChange = useCallback((ready: boolean) => {
    setIsCameraReady(ready);
    if (ready) {
      void cameraHostRef.current?.setZoomLevel(ZOOM_LEVELS[zoomIndex]);
      if (flashMode === 'on') {
        void cameraHostRef.current?.setTorchEnabled(true);
      }
    }
  }, [flashMode, zoomIndex]);

  const handleCameraDebugChange = useCallback((snapshot: CameraDebugSnapshot) => {
    setCameraDebug(snapshot);
  }, []);

  const galleryAccept = activeTab === 'live' ? 'image/*' : activeTab === 'reels' ? 'video/*' : 'image/*,video/*';

  const openGalleryPicker = () => {
    setQuickPanel(null);
    setShowCameraSettings(false);
    void (async () => {
      try {
        if (activeTab !== 'reels' && await isNativeGalleryAvailable()) {
          const picked = await pickNativeGalleryMedia();
          if (picked) {
            setGalleryPermission(picked.permission);
            if (picked.permission === 'denied') {
              toast.error('Доступ к галерее запрещен в настройках устройства');
              return;
            }
            if (picked.file) {
              await applyGalleryFile(picked.file, picked.previewUrl);
            }
          }
          return;
        }

        if (!fileInputRef.current) {
          setGalleryPermission('unavailable');
          toast.error('Галерея недоступна в этом окружении');
          return;
        }

        fileInputRef.current?.click();
      } catch (error) {
        logger.error('[CreateContentModal] Ошибка выбора медиа из галереи', { error });
        toast.error('Не удалось открыть галерею');
      }
    })();
  };

  const flipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  if (!isOpen) return null;

  const currentTab = TABS.find((t) => t.id === activeTab);
  const isCameraAvailable = activeTab !== 'live';
  const captureMode: CaptureMode = activeTab === 'reels' ? 'reel' : 'story';
  const isPreviewVideo = selectedFile ? selectedFile.type.startsWith('video/') : activeTab === 'reels';
  const zoomLabel = `${ZOOM_LEVELS[zoomIndex]}x`;
  const isTextStoryMode = activeTab === 'stories' && storyComposeMode === 'text';
  const textStoryBackground = TEXT_STORY_BACKGROUNDS.find((item) => item.id === textStoryBackgroundId) ?? TEXT_STORY_BACKGROUNDS[0];
  const textStoryFont = TEXT_STORY_FONTS.find((item) => item.id === textStoryFontId) ?? TEXT_STORY_FONTS[0];

  const FlashIcon = flashMode === 'off' ? ZapOff : Zap;
  const flashColor = flashMode === 'on' ? 'text-yellow-400' : flashMode === 'auto' ? 'text-blue-400' : 'text-white/70';

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-[999] bg-black flex flex-col',
        isMobile ? 'left-0' : 'left-[84px]',
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Full-screen camera / preview ─────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">

        {/* Camera feed */}
        {isCameraAvailable && (
          <CameraHost
            ref={cameraHostRef}
            isActive={isOpen && isCameraAvailable && cameraMode === 'camera' && !isTextStoryMode}
            mode={captureMode}
            facingMode={facingMode}
            previewZoom={ZOOM_LEVELS[zoomIndex]}
            className={cn(
              'absolute inset-0 transition-opacity duration-150',
              cameraMode === 'camera' && !previewUrl && !isTextStoryMode ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            videoClassName="w-full h-full object-cover"
            onReadyChange={handleCameraReadyChange}
            onRecordingChange={setIsCameraRecording}
            onPhotoCaptured={(file, url) => {
              setPreviewFromCapture(file, url);
              toast.success('Фото сохранено');
            }}
            onVideoRecorded={(file, url) => {
              setPreviewFromCapture(file, url);
              toast.success('Видео сохранено');
            }}
            onError={(err) => {
              logger.error('[CreateContentModal] Ошибка доступа к камере', { error: err });
              toast.error('Не удалось открыть камеру');
              setCameraMode('gallery');
            }}
            onDebugChange={handleCameraDebugChange}
          />
        )}

        {/* Preview (photo/video after capture or gallery pick) */}
        {previewUrl && (
          <div className="absolute inset-0">
            {isPreviewVideo ? (
              <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
            ) : (
              <img loading="lazy" src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            )}
          </div>
        )}

        {/* Empty gallery state */}
        {cameraMode === 'gallery' && !previewUrl && activeTab !== 'live' && !isTextStoryMode && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer text-white/50 hover:text-white/80 transition-colors"
          >
            <Upload className="w-20 h-20 opacity-40" />
            <p className="text-base font-medium">Нажмите чтобы выбрать медиа</p>
          </div>
        )}

        {isTextStoryMode && !previewUrl && (
          <div className={cn('absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br px-6', textStoryBackground.className)}>
            <Textarea
              value={textStoryText}
              onChange={(event) => setTextStoryText(event.target.value)}
              maxLength={280}
              placeholder="Напишите историю..."
              className={cn(
                'min-h-40 w-full max-w-xl resize-none border-0 bg-transparent text-4xl font-extrabold leading-tight text-white placeholder:text-white/55 shadow-none focus-visible:ring-0',
                textStoryFont.className,
                textStoryAlign === 'left' ? 'text-left' : textStoryAlign === 'right' ? 'text-right' : 'text-center',
              )}
            />
            <div className="mt-5 text-xs font-medium text-white/65">{textStoryText.length}/280</div>
          </div>
        )}

        {/* Live – cover/title area */}
        {activeTab === 'live' && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-40 h-40 rounded-full border-2 border-dashed border-white/30 flex flex-col items-center justify-center cursor-pointer hover:border-white/60 transition-colors"
            >
              <Image className="w-10 h-10 text-white/40 mb-2" />
              <span className="text-xs text-white/40">Обложка</span>
            </div>
            <Input
              placeholder="Название трансляции..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-center text-lg h-12 rounded-2xl"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white/10 border border-white/20 text-white rounded-2xl px-4 py-3 text-sm appearance-none"
            >
              <option value="other">Другое</option>
              <option value="music">Музыка</option>
              <option value="gaming">Игры</option>
              <option value="chat">Разговор</option>
              <option value="performance">Перформанс</option>
            </select>
          </div>
        )}

        {/* ── TOP BAR ──────────────────────────────────────────────── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe pt-3 pb-2 z-20">
          {/* Close */}
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Center controls – only in camera mode */}
          {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
            <div className="flex items-center gap-4">
              {/* Flash */}
              <button onClick={cycleFlash} className="flex flex-col items-center gap-0.5" aria-label="Вспышка">
                <FlashIcon className={cn('w-6 h-6', flashColor)} />
              </button>

              {/* Zoom */}
              <button
                onClick={cycleZoom}
                className="min-w-[36px] h-8 px-2 rounded-full bg-black/40 backdrop-blur-sm text-white text-sm font-bold flex items-center justify-center"
                aria-label="Зум"
              >
                {zoomLabel}
              </button>

              {/* Timer */}
              <button
                onClick={cycleTimer}
                className={cn('flex flex-col items-center', captureTimerSec > 0 ? 'text-yellow-400' : 'text-white/70')}
                aria-label="Таймер"
              >
                <Timer className="w-6 h-6" />
                {captureTimerSec > 0 && (
                  <span className="text-[10px] font-bold leading-none">{captureTimerSec}с</span>
                )}
              </button>
            </div>
          )}

          {/* Settings / Done */}
          {previewUrl || isTextStoryMode ? (
            <button
              onClick={handlePublish}
              disabled={isLoading || isPublishing || (isTextStoryMode && !textStoryText.trim())}
              className="px-4 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isLoading || isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : isTextStoryMode ? 'Опубликовать' : 'Далее →'}
            </button>
          ) : (
            <button
              onClick={() => {
                setShowCameraSettings(prev => !prev);
                setQuickPanel(null);
              }}
              className={cn(
                'w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-sm text-white',
                showCameraSettings ? 'bg-blue-600/70' : 'bg-black/30',
              )}
              aria-label="Настройки"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        {cameraMode === 'camera' && isCameraAvailable && showCameraSettings && !previewUrl && !isTextStoryMode && (
          <div className="absolute right-4 top-16 z-30 w-72 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-md p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Настройки камеры</span>
              <button
                onClick={() => setShowCameraSettings(false)}
                className="text-xs text-white/70 hover:text-white"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="mb-2 flex items-center justify-between text-white/80">
                  <span>Зум</span>
                  <span>{zoomLabel}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ZOOM_LEVELS.map((level, index) => (
                    <button
                      key={level}
                      onClick={() => setZoomLevelIndex(index)}
                      className={cn(
                        'rounded-full border px-2 py-1.5 font-semibold transition-colors',
                        zoomIndex === index
                          ? 'border-blue-300 bg-blue-600/70 text-white'
                          : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
                      )}
                    >
                      {level}x
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-white/50">
                  {cameraDebug?.supportsZoom ? 'Используется аппаратный зум камеры.' : 'Используется цифровой зум предпросмотра.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={cycleFlash}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    flashMode === 'on'
                      ? 'border-yellow-300/70 bg-yellow-500/20 text-yellow-100'
                      : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
                  )}
                >
                  <div className="font-semibold">Вспышка</div>
                  <div className="text-[11px] opacity-70">{flashMode === 'on' ? 'Вкл' : 'Выкл'}</div>
                </button>
                <button
                  onClick={cycleTimer}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    captureTimerSec > 0
                      ? 'border-yellow-300/70 bg-yellow-500/20 text-yellow-100'
                      : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
                  )}
                >
                  <div className="font-semibold">Таймер</div>
                  <div className="text-[11px] opacity-70">{captureTimerSec > 0 ? `${captureTimerSec}с` : 'Выкл'}</div>
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/70">
                <div>Камера: {facingMode === 'environment' ? 'задняя' : 'фронтальная'}</div>
                <div>Torch: {cameraDebug?.supportsTorch ? 'доступен' : 'недоступен'}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── ADD AUDIO label (camera mode, non-live) ─────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
            <button
              onClick={() => {
                setQuickPanel('audio');
                void loadAudioTracks(audioQuery);
              }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-sm"
            >
              <Music2 className="w-4 h-4" />
              <span>{musicTitle ? `Аудио: ${musicTitle}` : 'Добавить аудио'}</span>
            </button>
          </div>
        )}

        {/* ── LEFT SIDEBAR TOOLS (camera mode only) ─────────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-5">
            {[
              {
                icon: Music2,
                label: 'Аудио',
                active: quickPanel === 'audio',
                onClick: () => {
                  setQuickPanel('audio');
                  void loadAudioTracks(audioQuery);
                },
              },
              {
                icon: Sparkles,
                label: 'Эффекты',
                active: quickPanel === 'effects' || reelEffectPreset !== 'none',
                onClick: () => setQuickPanel('effects'),
              },
              {
                icon: Timer,
                label: `${reelMaxDurationSec}с`,
                active: reelMaxDurationSec === 90,
                onClick: () => {
                  setReelMaxDurationSec((prev) => (prev === 60 ? 90 : 60));
                  toast.success(`Ограничение длительности: ${reelMaxDurationSec === 60 ? 90 : 60}с`);
                },
              },
              {
                icon: User,
                label: 'Лицо',
                active: reelFaceEnhance,
                onClick: () => {
                  setReelFaceEnhance((prev) => !prev);
                  toast.success(`Режим лица: ${!reelFaceEnhance ? 'включен' : 'выключен'}`);
                },
              },
              {
                icon: Wand2,
                label: 'AI',
                active: reelAiEnhance,
                onClick: () => {
                  setReelAiEnhance((prev) => !prev);
                  toast.success(`AI-режим: ${!reelAiEnhance ? 'включен' : 'выключен'}`);
                },
              },
            ].map(({ icon: Icon, label, active, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-center gap-0.5"
                aria-label={label}
              >
                <div className={cn(
                  'w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center border',
                  active ? 'bg-blue-600/70 border-blue-300/60' : 'bg-black/30 border-transparent',
                )}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] text-white/80 font-medium">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── QUICK PANELS (backend-backed) ─────────────────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && quickPanel === 'audio' && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-72 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/90">Выбор аудио</span>
              <button
                onClick={() => setQuickPanel(null)}
                className="text-white/70 hover:text-white text-xs"
              >
                Закрыть
              </button>
            </div>
            <Input
              value={audioQuery}
              onChange={(e) => setAudioQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void loadAudioTracks(audioQuery);
                }
              }}
              placeholder="Поиск по трекам"
              className="h-8 bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {isAudioLoading ? (
                <div className="flex items-center gap-2 text-white/70 text-xs py-3 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загрузка...
                </div>
              ) : audioTracks.length === 0 ? (
                <p className="text-xs text-white/60 py-2 text-center">Нет результатов</p>
              ) : (
                audioTracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      setSelectedMusicTrackId(track.id);
                      setMusicTitle([track.artist, track.title].filter(Boolean).join(' — '));
                      setQuickPanel(null);
                      toast.success('Аудио добавлено');
                    }}
                    className={cn(
                      'w-full text-left rounded-lg px-2 py-1.5 text-xs border transition-colors',
                      selectedMusicTrackId === track.id
                        ? 'bg-blue-600/50 border-blue-300/50 text-white'
                        : 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10',
                    )}
                  >
                    <div className="font-medium truncate">{track.title}</div>
                    <div className="text-white/60 truncate">{track.artist || 'Неизвестный артист'}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && quickPanel === 'effects' && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-56 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white/90">Эффекты</span>
              <button
                onClick={() => setQuickPanel(null)}
                className="text-white/70 hover:text-white text-xs"
              >
                Закрыть
              </button>
            </div>
            {REEL_EFFECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  setReelEffectPreset(preset.id);
                  setQuickPanel(null);
                  toast.success(`Эффект: ${preset.label}`);
                }}
                className={cn(
                  'w-full rounded-lg px-2 py-2 text-left text-xs border transition-colors',
                  reelEffectPreset === preset.id
                    ? 'bg-blue-600/50 border-blue-300/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'stories' && !previewUrl && (
          <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/45 p-1 text-xs font-semibold text-white backdrop-blur-md">
            <button
              type="button"
              onClick={() => setStoryComposeMode('camera')}
              className={cn('rounded-full px-4 py-2 transition-colors', storyComposeMode === 'camera' ? 'bg-white text-black' : 'text-white/70 hover:text-white')}
            >
              Камера
            </button>
            <button
              type="button"
              onClick={() => {
                setStoryComposeMode('text');
                setQuickPanel(null);
                setShowCameraSettings(false);
              }}
              className={cn('rounded-full px-4 py-2 transition-colors', storyComposeMode === 'text' ? 'bg-white text-black' : 'text-white/70 hover:text-white')}
            >
              Текст
            </button>
          </div>
        )}

        {isTextStoryMode && !previewUrl && (
          <div className="absolute bottom-24 left-0 right-0 z-20 space-y-3 px-4">
            <div className="flex justify-center gap-2">
              {TEXT_STORY_BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  type="button"
                  onClick={() => setTextStoryBackgroundId(background.id)}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 bg-gradient-to-br transition-transform active:scale-95',
                    background.className,
                    textStoryBackgroundId === background.id ? 'border-white' : 'border-white/25',
                  )}
                  aria-label={`Фон: ${background.label}`}
                />
              ))}
            </div>
            <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 backdrop-blur-md">
              {TEXT_STORY_FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setTextStoryFontId(font.id)}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                    font.className,
                    textStoryFontId === font.id ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {font.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTextStoryAlign((prev) => prev === 'center' ? 'left' : prev === 'left' ? 'right' : 'center')}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                {textStoryAlign === 'left' ? 'Слева' : textStoryAlign === 'right' ? 'Справа' : 'Центр'}
              </button>
            </div>
          </div>
        )}

        {/* ── CAPTION EDITOR OVERLAY (after capture) ─────────────── */}
        {showCaptionEditor && previewUrl && activeTab !== 'live' && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-10 max-h-96 overflow-y-auto">
            <TabContentEditor
              activeTab={activeTab}
              previewUrl={previewUrl}
              caption={caption}
              onCaptionChange={setCaption}
              musicTitle={musicTitle}
              onMusicTitleChange={setMusicTitle}
              reelTaggedUsers={reelTaggedUsers}
              onReelTaggedUsersChange={setReelTaggedUsers}
              reelLocationName={reelLocationName}
              onReelLocationNameChange={setReelLocationName}
              reelAudience={reelAudience}
              onReelAudienceChange={setReelAudience}
              reelAllowComments={reelAllowComments}
              onReelAllowCommentsChange={setReelAllowComments}
              reelAllowRemix={reelAllowRemix}
              onReelAllowRemixChange={setReelAllowRemix}
              onClose={handleClose}
              editorState={editorState}
              dispatchEditor={dispatchEditor}
            />
          </div>
        )}

        {/* ── SIMPLE CAPTION FOR LIVE ──────────────────────────────── */}
        {showCaptionEditor && activeTab === 'live' && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
            <Textarea
              placeholder="Добавьте описание трансляции..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={300}
              rows={2}
              className="w-full bg-white/10 backdrop-blur border-white/20 text-white placeholder:text-white/50 text-sm rounded-2xl resize-none"
            />
            <p className="text-right text-xs text-white/40 mt-1">{caption.length}/300</p>
          </div>
        )}

        {/* ── BOTTOM CAMERA CONTROLS (camera mode) ─────────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
          <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-between px-8">
            <GalleryEntryButton
              thumbnailUrl={lastGalleryThumbnailUrl}
              mediaKind={lastGalleryMediaKind}
              permission={galleryPermission}
              disabled={isCameraRecording}
              onClick={openGalleryPicker}
            />

            {/* Main capture button */}
            <div className="flex flex-col items-center gap-2">
              {!isCameraReady && (
                <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
              )}
              <button
                onClick={handleCapture}
                disabled={!isCameraReady || timerCountdown != null}
                className={cn(
                  'w-[72px] h-[72px] rounded-full border-4 transition-all active:scale-95',
                  isCameraRecording
                    ? 'border-red-500 bg-red-500/30 scale-90'
                    : 'border-white bg-white/20 hover:bg-white/30',
                  (!isCameraReady || timerCountdown != null) && 'opacity-40',
                )}
                aria-label={activeTab === 'reels' ? (isCameraRecording ? 'Стоп' : 'Запись') : 'Снимок'}
              >
                {timerCountdown != null ? (
                  <span className="text-2xl font-bold text-white">{timerCountdown}</span>
                ) : isCameraRecording && (
                  <span className="block w-6 h-6 rounded bg-red-500 mx-auto" />
                )}
              </button>
              {timerCountdown != null && (
                <span className="text-xs text-white/80 font-medium">Таймер: {timerCountdown}</span>
              )}
              {isCameraRecording && (
                <span className="text-xs text-red-400 font-medium animate-pulse">● Запись</span>
              )}
            </div>

            {/* Flip camera */}
            <button
              onClick={flipCamera}
              className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
              aria-label="Перевернуть камеру"
              disabled={isCameraRecording}
            >
              <FlipHorizontal className="w-5 h-5 text-white" />
            </button>
          </div>
        )}

        {/* Controls when preview shown */}
        {previewUrl && (
          <div className="absolute top-16 right-4 z-20 flex items-center gap-2">
            {activeTab === 'reels' && selectedFile?.type.startsWith('video/') && (
              <button
                onClick={() => setShowReelEditor(true)}
                className="w-10 h-10 rounded-full bg-blue-600/90 backdrop-blur-sm flex items-center justify-center text-white"
                aria-label="Редактировать видео"
              >
                <Wand2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setSelectedFile(null);
                setCameraMode('camera');
                setShowCaptionEditor(false);
              }}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
              aria-label="Переснять"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={galleryAccept}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* ── BOTTOM TAB BAR (Instagram-style) ─────────────────────── */}
      <div className="flex-shrink-0 bg-black border-t border-white/10 pb-safe">
        <div className="flex items-stretch">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                disabled={isCameraRecording}
                className={cn(
                  'flex-1 py-3 flex flex-col items-center justify-center gap-0.5 transition-all',
                  isActive ? 'text-white' : 'text-white/40',
                  isCameraRecording && 'opacity-40 cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] tracking-wide transition-all',
                    isActive ? 'font-bold text-white' : 'font-normal',
                  )}
                >
                  {tab.label.toUpperCase()}
                </span>
                {isActive && (
                  <span className="block w-1 h-1 rounded-full bg-white mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── PUBLISH FOOTER — Live only ────────────────────────────── */}
      {activeTab === 'live' && (
        <div className="flex-shrink-0 bg-black px-4 pb-6 pb-safe border-t border-white/10 pt-3 flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 border-white/20 text-white bg-white/5 h-11 rounded-2xl"
          >
            Отмена
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isLoading || isPublishing || !title.trim()}
            className="flex-1 bg-red-600 hover:bg-red-500 h-11 rounded-2xl font-semibold text-white"
          >
            {isLoading || isPublishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Начать эфир
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute top-20 left-4 right-4 z-30 p-3 bg-red-900/80 backdrop-blur border border-red-500/50 rounded-2xl text-red-200 text-sm text-center">
          {error}
        </div>
      )}

      <SimpleMediaEditor
        open={showReelEditor}
        onOpenChange={setShowReelEditor}
        mediaFile={activeTab === 'reels' ? selectedFile : null}
        contentType="reel"
        onSave={(blob) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          const editedFile = new File([blob], selectedFile?.name || 'reel.mp4', { type: blob.type });
          const editedPreview = URL.createObjectURL(blob);
          setSelectedFile(editedFile);
          setPreviewUrl(editedPreview);
          toast.success('Видео отредактировано');
          setShowReelEditor(false);
        }}
        onCancel={() => setShowReelEditor(false)}
      />
    </div>
  );
}
