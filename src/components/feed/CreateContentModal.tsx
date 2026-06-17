import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import {
  X, Image, Film, Radio, Camera, Loader2, RotateCw, Upload,
  Zap, ZapOff, Timer, Settings, Sparkles, Music2, FlipHorizontal,
  Wand2, User,
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
  type CarouselSlide,
} from './editorStateModel';
import { logger } from '@/lib/logger';
import { applyImageFilter } from '@/lib/applyImageFilter';
import { GalleryEntryButton } from '@/features/create/gallery/GalleryEntryButton';
import type { GalleryMediaKind, GalleryPermissionState } from '@/features/create/gallery/galleryTypes';
import { isNativeGalleryAvailable, pickNativeGalleryMedia } from '@/features/create/gallery/nativeGalleryAdapter';
import { MediaPickerModal } from '@/features/create/gallery/MediaPickerModal';
import type { PickerSelection } from '@/features/create/gallery/mediaPickerTypes';

interface CreateContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (contentType: ContentType) => void;
  initialTab?: TabType;
}

type TabType = 'publications' | 'stories' | 'reels' | 'live';
type CameraMode = 'camera' | 'gallery';
type FlashMode = 'off' | 'on' | 'auto' | 'screen';
type StoryComposeMode = 'camera' | 'text';

const TABS: Array<{ id: TabType; label: string; icon: LucideIcon; contentType: ContentType }> = [
  { id: 'publications', label: 'Публикация', icon: Image, contentType: 'post' },
  { id: 'stories', label: 'История', icon: Camera, contentType: 'story' },
  { id: 'reels', label: 'Видео Reels', icon: Film, contentType: 'reel' },
  { id: 'live', label: 'Прямой эфир', icon: Radio, contentType: 'live' },
];

// Динамические уровни зума: 0.5x → 1x → 2x → 3x → 5x → 8x → 15x
// iPhone: до 15x (Pro Max), Samsung Galaxy S24 Ultra: до 100x (Space Zoom)
// clamp к возможностям камеры в CameraHost
const BASE_ZOOM_LEVELS = [0.5, 1, 2, 3, 5, 8, 15] as const;
const ZOOM_LEVELS_LABELS: Record<number, string> = {
  0.5: '0.5x', 1: '1x', 2: '2x', 3: '3x', 5: '5x', 8: '8x', 15: '15x',
};

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
    uploadCarouselPost,
  } = useUnifiedContentCreator();

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialTab === 'live' ? 'gallery' : 'camera');
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
  const [screenFlashActive, setScreenFlashActive] = useState(false);
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
  const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);
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
  const [reelRecordingElapsedMs, setReelRecordingElapsedMs] = useState(0);
  const reelRecordingStartRef = useRef(0);
  // Recording timer durations: 0-30s, 0-1m, 0-3m, 0-10m, 0-15m
  const RECORDING_DURATIONS = [
    { label: '30с', ms: 30_000 },
    { label: '1м', ms: 60_000 },
    { label: '3м', ms: 180_000 },
    { label: '10м', ms: 600_000 },
    { label: '15м', ms: 900_000 },
  ] as const;
  const [reelMaxRecordingMs, setReelMaxRecordingMs] = useState<number>(RECORDING_DURATIONS[0].ms);

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
  // Fix #5: guard publish button on unmount during in-flight publish
  const unmountRef = useRef(false);
  // Fix #7: prevent camera restart during bootstrap until tab switch is committed
  const isTabSwitchBootstrapping = useRef(false);
  // Fix #11: version counter for loadAudioTracks stale request cancellation
  const loadAudioTracksVersionRef = useRef(0);
  // Fix B: guard от двойного тапа — preventDefault на capturePhoto/recordVideo
  const captureInFlightRef = useRef(false);

  // Mount/unmount guard + ChatOpen sync
  useEffect(() => {
    unmountRef.current = false;
    setIsCreatingContent(isOpen);
    return () => {
      unmountRef.current = true;
      setIsCreatingContent(false);
      if (publishInFlightRef.current) {
        publishInFlightRef.current = false;
        logger.warn('[CreateContentModal] Unmounted during publish');
      }
    };
  }, [isOpen, setIsCreatingContent]);

  // Blob URL cleanup + timer cleanup (no deps — guaranteed on unmount regardless of React bail-out)
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) { window.clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
      if (previewUrl?.startsWith('blob:')) { try { URL.revokeObjectURL(previewUrl); } catch {} }
      if (lastGalleryThumbnailUrl?.startsWith('blob:')) { try { URL.revokeObjectURL(lastGalleryThumbnailUrl); } catch {} }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Tab switch bootstrap guard
  useEffect(() => {
    if (isTabSwitchBootstrapping.current) {
      const t = setTimeout(() => { isTabSwitchBootstrapping.current = false; }, 100);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

  // Reels recording timer
  useEffect(() => {
    if (isCameraRecording && activeTab === 'reels') {
      reelRecordingStartRef.current = Date.now();
      setReelRecordingElapsedMs(0);
      const id = window.setInterval(() => { setReelRecordingElapsedMs(Date.now() - reelRecordingStartRef.current); }, 200);
      return () => window.clearInterval(id);
    } else {
      setReelRecordingElapsedMs(0);
    }
  }, [isCameraRecording, activeTab]);

  const getReelsPublishStorageKey = useCallback(() => {
    if (!user?.id) return null;
    return `reels_client_publish_id:${user.id}`;
  }, [user?.id]);

  const clearStoredReelPublishId = useCallback(() => {
    const storageKey = getReelsPublishStorageKey();
    if (!storageKey) return;
    // Fix #4: очищаем оба storage
    try { sessionStorage.removeItem(storageKey); } catch {}
    try { localStorage.removeItem(storageKey); } catch {}
  }, [getReelsPublishStorageKey]);

  const getStableReelPublishId = useCallback((): string => {
    // Fix #4: сначала проверяем память (reelClientPublishId), затем sessionStorage,
    // затем localStorage как fallback (sessionStorage блокирован в private mode).
    // localStorage синхронен, но хранит только string ID — блокировка маловероятна.
    if (reelClientPublishId) return reelClientPublishId;

    const storageKey = getReelsPublishStorageKey();
    let resolvedId: string | null = null;

    // Пробуем sessionStorage
    if (storageKey) {
      try {
        resolvedId = sessionStorage.getItem(storageKey);
      } catch (e) {
        logger.warn('[CreateContentModal] sessionStorage недоступен, используем localStorage', { error: e });
      }
    }

    // sessionStorage не дал результат — localStorage как fallback
    if (!resolvedId && storageKey) {
      try {
        resolvedId = localStorage.getItem(storageKey);
      } catch (e) {
        logger.warn('[CreateContentModal] localStorage также недоступен', { error: e });
      }
    }

    if (!resolvedId) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        resolvedId = crypto.randomUUID();
      } else {
        resolvedId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      if (storageKey) {
        // sessionStorage первичен, localStorage — fallback
        try {
          sessionStorage.setItem(storageKey, resolvedId);
        } catch (e) {
          try {
            localStorage.setItem(storageKey, resolvedId);
          } catch (e2) {
            logger.warn('[CreateContentModal] Ни sessionStorage, ни localStorage недоступны', { error: e2 });
          }
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
    // Fix #11: version counter — отменяем устаревшие запросы без изменения API
    const version = ++loadAudioTracksVersionRef.current;
    setIsAudioLoading(true);
    try {
      const response = await editorApi.searchMusic({
        page: 1,
        limit: 20,
        query: (queryText ?? '').trim() || undefined,
      });

      if (version !== loadAudioTracksVersionRef.current) return; // stale response

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
      if (version !== loadAudioTracksVersionRef.current) return;
      logger.error('[CreateContentModal] Не удалось загрузить аудио-треки', { error: err });
      toast.error('Не удалось загрузить аудио-треки');
    } finally {
      // Без return — finally не должен блокировать исключения
      const isStale = version !== loadAudioTracksVersionRef.current;
      if (!isStale) setIsAudioLoading(false);
    }
  }, []);

  const setPreviewFromCapture = (file: File, url: string) => {
    // Fix B: снимаем guard сразу — capture завершён, state может обновляться
    captureInFlightRef.current = false;
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
    // Fix #7: отмечаем что переключение в процессе — камера не запускается пока не закоммичено
    if (tabId !== 'live' && activeTab === 'live') {
      isTabSwitchBootstrapping.current = true;
    }
    setActiveTab(tabId);
    setStoryComposeMode('camera');
    setQuickPanel(null);
    setShowCameraSettings(false);
    setActiveContentType(TABS.find(t => t.id === tabId)?.contentType || 'post');
    setCameraMode(tabId === 'live' ? 'gallery' : 'camera');
    setShowCaptionEditor(false);
  }, [isCameraRecording, setActiveContentType, activeTab]);

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
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (isCarouselMode) {
      void addCarouselFiles(files);
      return;
    }

    const file = files[0];
    if (file) {
      void applyGalleryFile(file);
    }
  };

  const addCarouselFiles = async (files: File[]) => {
    const remaining = 20 - editorState.carouselSlides.length;
    if (remaining <= 0) {
      toast.error('Максимум 20 слайдов в карусели');
      return;
    }

    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`Добавлено только ${remaining} из ${files.length} файлов (лимит 20)`);
    }

    for (const file of toProcess) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`Файл "${file.name}" превышает 50 МБ`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const slide = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: url,
        caption: '',
        filterIdx: 0,
        filterIntensity: 1,
        adjustments: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          warmth: 0,
          shadows: 0,
          highlights: 0,
          vignette: 0,
          sharpness: 0,
          grain: 0,
        },
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      } as CarouselSlide;
      dispatchEditor({ type: 'ADD_CAROUSEL_SLIDE', payload: slide });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMediaPickerSelect = async (selection: PickerSelection) => {
    try {
      const files: File[] = [];
      for (const item of selection.items) {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const file = new File([blob], item.name, { type: blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
        files.push(file);
      }
      await addCarouselFiles(files);
      setShowMediaPickerModal(false);
    } catch (error) {
      logger.error('[CreateContentModal] Ошибка импорта из MediaPickerModal', { error });
      toast.error('Не удалось загрузить выбранные файлы');
    }
  };

  // Fix #9: каждый таб — отдельная функция; добавление 5-го формата = +1 маленькая функция, не рост сложности handlePublish
  const publishLive = async (): Promise<boolean> => {
    if (!title.trim()) { toast.error('Укажите название трансляции'); return false; }
    const result = await createLiveSession(title, category, previewUrl || undefined);
    if (!result) return false;
    toast.success('Трансляция готова к началу!');
    onSuccess?.('live');
    resetForm();
    onClose();
    return true;
  };

  const publishTextStory = async (): Promise<boolean> => {
    const text = textStoryText.trim();
    if (!text) { toast.error('Введите текст истории'); return false; }
    const result = await createTextStory({
      text,
      backgroundId: textStoryBackgroundId,
      fontId: textStoryFontId,
      align: textStoryAlign,
      color: '#ffffff',
    });
    if (!result) return false;
    toast.success('История успешно загружена!');
    onSuccess?.(result.content_type);
    resetForm();
    onClose();
    return true;
  };

  const getCarouselCaption = useCallback(() => {
    const parts: string[] = [];
    if (caption.trim()) parts.push(caption.trim());
    for (const slide of editorState.carouselSlides) {
      if (slide.caption.trim()) parts.push(slide.caption.trim());
    }
    return parts.join('\n\n');
  }, [caption, editorState.carouselSlides]);

  const publishMediaContent = async (): Promise<boolean> => {
    const isCarousel = editorState.carouselSlides.length > 0;
    if (isCarousel) {
      const fullCaption = getCarouselCaption();
      const scheduledAt = editorState.scheduledDate?.toISOString() || null;
      const result = await uploadCarouselPost(
        editorState.carouselSlides,
        fullCaption,
        scheduledAt,
        {
          hideLikes: editorState.hideLikes,
          commentsDisabled: editorState.commentsDisabled,
        },
      );
      if (result && scheduledAt) toast.info(`Карусель запланирована на ${new Date(scheduledAt).toLocaleString('ru')}`);
      if (result) {
        toast.success('Карусель успешно загружена!');
        onSuccess?.(result.content_type);
        resetForm();
        onClose();
        return true;
      }
      return false;
    }

    if (!selectedFile) { toast.error('Выберите медиа-файл'); return false; }
    const fileValidation = validateMediaFile(selectedFile, activeTab);
    if (!fileValidation.valid) { toast.error(fileValidation.error || 'Некорректный файл'); return false; }

    if (activeTab === 'reels') {
      if (selectedFile.type.startsWith('video/')) {
        const duration = await getVideoDurationSeconds(selectedFile);
        if (duration != null && duration > reelMaxDurationSec) {
          toast.error(`Максимальная длительность в текущем режиме: ${reelMaxDurationSec}с`);
          return false;
        }
      }
      const hashtagVerdict = await checkHashtagsAllowedForText(caption.trim());
      if (!hashtagVerdict.ok) {
        const blockedTags = 'blockedTags' in hashtagVerdict ? hashtagVerdict.blockedTags : [];
        toast.error('Некоторые хештеги недоступны', { description: blockedTags.join(', ') });
        return false;
      }
    }

    const scheduledAt = editorState.scheduledDate?.toISOString() || null;

    let processedFile = selectedFile;
    if (activeTab === 'publications' && selectedFile.type.startsWith('image/')) {
      processedFile = await applyImageFilter(selectedFile, {
        filterIdx: editorState.selectedFilterIdx,
        filterIntensity: editorState.filterIntensity,
        adjustments: editorState.adjustments,
      });
    }

    let result: UnifiedContent | null = null;
    switch (activeTab) {
      case 'publications':
        result = await uploadPostMedia(processedFile, caption, scheduledAt, {
          hideLikes: editorState.hideLikes,
          commentsDisabled: editorState.commentsDisabled,
        });
        if (result && scheduledAt) toast.info(`Публикация запланирована на ${new Date(scheduledAt).toLocaleString('ru')}`);
        break;
      case 'stories':
        result = await uploadStoryMedia(selectedFile, caption);
        if (result && scheduledAt) toast.info(`История запланирована на ${new Date(scheduledAt).toLocaleString('ru')}`);
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
          taggedUsers: reelTaggedUsers.split(',').map(v => v.trim()).filter(Boolean),
          locationName: reelLocationName.trim() || null,
          visibility: reelAudience,
          allowComments: reelAllowComments,
          allowRemix: reelAllowRemix,
        });
        if (result && scheduledAt) toast.info(`Видео запланировано на ${new Date(scheduledAt).toLocaleString('ru')}`);
        break;
      default:
        return false;
    }

    if (result) {
      const currentTab2 = TABS.find((t) => t.id === activeTab);
      toast.success(`${currentTab2?.label ?? 'Контент'} успешно загружен!`);
      onSuccess?.(result.content_type);
      resetForm();
      onClose();
      return true;
    }
    return false;
  };

  const handlePublish = async () => {
    // Fix #5: не позволяем publish если компонент размонтирован
    if (publishInFlightRef.current || unmountRef.current) return;
    publishInFlightRef.current = true;
    setIsPublishing(true);

    try {
      const currentTab = TABS.find((t) => t.id === activeTab);
      const validation = validateEditorState(editorState, activeTab);
      if (!validation.valid) { toast.error(validation.error || 'Ошибка валидации'); return; }
      if (validation.warnings) validation.warnings.forEach((w) => toast.warning(w));

      let published = false;
      if (activeTab === 'live') {
        published = await publishLive();
      } else if (activeTab === 'stories' && storyComposeMode === 'text') {
        published = await publishTextStory();
      } else {
        published = await publishMediaContent();
      }
      if (!published) return; // ошибка уже показана внутри
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
    dispatchEditor({ type: 'CLEAR_ALL' });
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
    setReelMaxRecordingMs(RECORDING_DURATIONS[0].ms);
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
      if (facingMode === 'user') {
        // Фронтальная камера: только экранная вспышка
        const nextMode: FlashMode = flashMode === 'screen' ? 'off' : 'screen';
        if (nextMode === 'screen') {
          setFlashMode('screen');
          setScreenFlashActive(true);
          // Скрин-флеш: белый экран на ~150мс
          setTimeout(() => setScreenFlashActive(false), 150);
        } else {
          setFlashMode('off');
          setScreenFlashActive(false);
        }
        return;
      }

      // Задняя камера: физическая вспышка
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
      const nextIndex = (prev + 1) % BASE_ZOOM_LEVELS.length;
      void cameraHostRef.current?.setZoomLevel(BASE_ZOOM_LEVELS[nextIndex]);
      return nextIndex;
    });
  };

  const setZoomLevelIndex = (nextIndex: number) => {
    setZoomIndex(nextIndex);
    void cameraHostRef.current?.setZoomLevel(BASE_ZOOM_LEVELS[nextIndex]);
  };

  const cycleTimer = () => {
    setCaptureTimerSec(prev => (prev === 0 ? 3 : prev === 3 ? 10 : 0));
  };

  const runCapture = useCallback(() => {
    if (captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    if (activeTab === 'reels') {
      void cameraHostRef.current?.recordVideo();
    } else {
      void cameraHostRef.current?.capturePhoto();
    }
    // reset в finally/callback — see handleCapture
  }, [activeTab]);

  const handleCapture = useCallback(() => {
    if (timerCountdown != null) return;

    if (activeTab === 'reels' && isCameraRecording) {
      cameraHostRef.current?.stopRecording();
      return;
    }

    if (captureTimerSec <= 0) {
      if (captureInFlightRef.current) return; // Fix B: prevent double-tap
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
      void cameraHostRef.current?.setZoomLevel(BASE_ZOOM_LEVELS[zoomIndex]);
      if (facingMode === 'user' && flashMode === 'screen') {
        // При повторном открытии камеры сбрасываем скрин-флеш
        setFlashMode('off');
        setScreenFlashActive(false);
      }
      if (facingMode === 'environment' && flashMode === 'on') {
        void cameraHostRef.current?.setTorchEnabled(true);
      }
    }
  }, [flashMode, zoomIndex, facingMode]);

  const handleCameraDebugChange = useCallback((snapshot: CameraDebugSnapshot) => {
    setCameraDebug(snapshot);
  }, []);

  const galleryAccept = activeTab === 'live' ? 'image/*' : activeTab === 'reels' ? 'video/*' : 'image/*,video/*';
  const isCarouselMode = activeTab === 'publications' && editorState.carouselSlides.length > 0;

  const openGalleryPicker = () => {
    setQuickPanel(null);
    setShowCameraSettings(false);

    if (isCarouselMode) {
      setShowMediaPickerModal(true);
      return;
    }

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
    setFacingMode(prev => {
      const next = prev === 'user' ? 'environment' : 'user';
      // Сброс flash при переключении на фронтальную камеру
      if (next === 'user') {
        setFlashMode('off');
        setScreenFlashActive(false);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  const currentTab = TABS.find((t) => t.id === activeTab);
  const isCameraAvailable = activeTab !== 'live';
  const captureMode: CaptureMode = activeTab === 'reels' ? 'reel' : 'story';
  const isPreviewVideo = selectedFile ? selectedFile.type.startsWith('video/') : activeTab === 'reels';
  const zoomLabel = ZOOM_LEVELS_LABELS[BASE_ZOOM_LEVELS[zoomIndex]] ?? `${BASE_ZOOM_LEVELS[zoomIndex]}x`;
  const isTextStoryMode = activeTab === 'stories' && storyComposeMode === 'text';
  const textStoryBackground = TEXT_STORY_BACKGROUNDS.find((item) => item.id === textStoryBackgroundId) ?? TEXT_STORY_BACKGROUNDS[0];
  const textStoryFont = TEXT_STORY_FONTS.find((item) => item.id === textStoryFontId) ?? TEXT_STORY_FONTS[0];

  const FlashIcon = flashMode === 'off' ? ZapOff : Zap;
  const flashColor =
    flashMode === 'screen' ? 'text-white' :
    flashMode === 'on' ? 'text-yellow-400' :
    flashMode === 'auto' ? 'text-blue-400' : 'text-white/70';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Создание контента"
      className={cn(
        'fixed inset-y-0 right-0 z-[999] bg-black flex flex-col',
        isMobile ? 'left-0' : 'left-[84px]',
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* ── Full-screen camera / preview ─────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">

        {/* Camera feed */}
        {isCameraAvailable && (
          <CameraHost
            ref={cameraHostRef}
            isActive={
              isOpen
              && isCameraAvailable
              && cameraMode === 'camera'
              && !isTextStoryMode
              && !isTabSwitchBootstrapping.current
              && !previewUrl  // Fix E: не запускать камеру когда уже есть preview
            }
            mode={captureMode}
            facingMode={facingMode}
            previewZoom={BASE_ZOOM_LEVELS[zoomIndex]}
            maxRecordingMs={reelMaxRecordingMs}
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

        {/* Screen flash overlay (for front camera) */}
        {screenFlashActive && (
          <div className="absolute inset-0 bg-white animate-pulse pointer-events-none z-30" />
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
                <div className="grid grid-cols-4 gap-2">
                  {BASE_ZOOM_LEVELS.map((level, index) => (
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
                    flashMode !== 'off'
                      ? 'border-yellow-300/70 bg-yellow-500/20 text-yellow-100'
                      : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
                  )}
                >
                  <div className="font-semibold">Вспышка</div>
                  <div className="text-[11px] opacity-70">
                    {facingMode === 'user'
                      ? flashMode === 'screen' ? 'Экран: вкл' : 'Экран: выкл'
                      : flashMode === 'on' ? 'Вкл' : 'Выкл'}
                  </div>
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

              <div>
                <div className="mb-2 text-white/80 text-xs">Макс. длительность записи</div>
                <div className="grid grid-cols-5 gap-1">
                  {RECORDING_DURATIONS.map((d) => (
                    <button
                      key={d.ms}
                      onClick={() => setReelMaxRecordingMs(d.ms)}
                      className={cn(
                        'rounded-lg border px-1 py-1.5 text-center font-semibold text-[10px] transition-colors',
                        reelMaxRecordingMs === d.ms
                          ? 'border-blue-300 bg-blue-600/70 text-white'
                          : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/70">
                <div>Камера: {facingMode === 'environment' ? 'задняя' : 'фронтальная'}</div>
                <div>Torch: {cameraDebug?.supportsTorch ? 'доступен' : 'недоступен'}</div>
                <div>Зум: {cameraDebug?.supportsZoom ? 'аппаратный' : 'цифровой'}</div>
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
              disabled={isCameraRecording || timerCountdown != null}
              onClick={openGalleryPicker}
            />

            {/* Main capture button — 3D Liquid Glass */}
            <div className="flex flex-col items-center gap-2">
              {!isCameraReady && (
                <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
              )}

              {/* Recording Timer Ring */}
              {isCameraRecording && (
                <div className="relative flex items-center justify-center">
                  <svg className="w-[88px] h-[88px] -rotate-90" viewBox="0 0 88 88">
                    {/* Background ring */}
                    <circle cx="44" cy="44" r="40" fill="none" stroke="white/20" strokeWidth="4" />
                    {/* Progress ring — цвет меняется: зелёный → жёлтый → красный */}
                    <circle
                      cx="44"
                      cy="44"
                      r="40"
                      fill="none"
                      stroke={reelRecordingElapsedMs < reelMaxRecordingMs * 0.5
                        ? '#22c55e'
                        : reelRecordingElapsedMs < reelMaxRecordingMs * 0.75
                        ? '#eab308'
                        : '#ef4444'}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - reelRecordingElapsedMs / reelMaxRecordingMs)}`}
                      className="transition-all duration-200"
                    />
                  </svg>
                  {/* Timer text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-white/80">
                      {Math.floor(reelRecordingElapsedMs / 60000)}:{String(Math.floor((reelRecordingElapsedMs % 60000) / 1000)).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-white/50">
                      / {reelMaxRecordingMs >= 60000
                        ? `${reelMaxRecordingMs / 60000}м`
                        : `${reelMaxRecordingMs / 1000}с`}
                    </span>
                  </div>
                </div>
              )}

              {/* 3D Liquid Glass Capture Button */}
              {!isCameraRecording && (
                <button
                  onClick={handleCapture}
                  disabled={!isCameraReady || timerCountdown != null}
                  className={cn(
                    'relative w-[72px] h-[72px] rounded-full',
                    'before:absolute before:inset-0 before:rounded-full',
                    'before:bg-gradient-to-br before:from-white/60 before:to-white/10',
                    'before:backdrop-blur-md before:border before:border-white/30',
                    'before:shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.4)]',
                    'after:absolute after:inset-1 after:rounded-full',
                    'after:bg-gradient-to-br after:from-white/30 after:to-transparent',
                    'after:shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]',
                    'active:scale-95 active:before:scale-95',
                    'transition-all duration-150',
                    (!isCameraReady || timerCountdown != null) && 'opacity-40',
                  )}
                  aria-label={activeTab === 'reels' ? (isCameraRecording ? 'Стоп' : 'Запись') : 'Снимок'}
                >
                  {timerCountdown != null ? (
                    <span className="relative z-10 text-2xl font-bold text-white">{timerCountdown}</span>
                  ) : (
                    <span className="relative z-10 block w-[56px] h-[56px] rounded-full bg-white/90 shadow-inner" />
                  )}
                </button>
              )}

              {/* Stop button when recording */}
              {isCameraRecording && (
                <button
                  onClick={() => cameraHostRef.current?.stopRecording()}
                  className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center"
                >
                  <span className="block w-6 h-6 rounded bg-red-500" />
                </button>
              )}

              {timerCountdown != null && (
                <span className="text-xs text-white/80 font-medium">Таймер: {timerCountdown}</span>
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
                // Fix C: вызываем resetForm — сбрасывает всё: state, инпут, editor.
                // Без этого инпут хранит старый файл, и при повторном «Переснять» он не обновится.
                resetForm();
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
        <div role="tablist" className="flex items-stretch">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`create-panel-${tab.id}`}
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

      <MediaPickerModal
        isOpen={showMediaPickerModal}
        onClose={() => setShowMediaPickerModal(false)}
        onSelect={handleMediaPickerSelect}
        maxFiles={20}
        accept={galleryAccept}
      />
    </div>
  );
}
