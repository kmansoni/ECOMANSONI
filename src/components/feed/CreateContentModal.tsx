import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import {
  Image, Film, Radio, Camera, Loader2, RotateCw,
  FlipHorizontal, Wand2, Music2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import type { GalleryMediaKind, GalleryPermissionState } from '@/features/create/gallery/galleryTypes';
import { GalleryPicker, EmptyGalleryState } from './create/GalleryPicker';
import { PublishFooter } from './create/PublishFooter';
import { TextStoryEditor } from './create/TextStoryEditor';
import { LiveStreamSetup } from './create/LiveStreamSetup';
import { QuickPanels } from './create/QuickPanels';
import { MediaPickerModal } from '@/features/create/gallery/MediaPickerModal';
import { CreateContentProvider } from './CreateContentContext';
import { CameraTopBar } from './create/CameraTopBar';
import { CameraSettingsPanel } from './create/CameraSettingsPanel';
import { CameraSidebarTools } from './create/CameraSidebarTools';
import { RecordingTimerRing } from './create/RecordingTimerRing';
import { BASE_ZOOM_LEVELS, RECORDING_DURATIONS } from './create/cameraConstants';

const ZOOM_LEVELS_LABELS: Record<number, string> = {
  0.5: '0.5x', 1: '1x', 2: '2x', 3: '3x', 5: '5x', 8: '8x', 15: '15x',
};

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

  // ── Core state ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialTab === 'live' ? 'gallery' : 'camera');
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // ── Camera state ─────────────────────────────────────────────
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
  const [zoomIndex, setZoomIndex] = useState(0);
  const [captureTimerSec, setCaptureTimerSec] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);

  // ── Audio / effects ───────────────────────────────────────────
  const [musicTitle, setMusicTitle] = useState('');
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState<string | null>(null);
  const [audioQuery, setAudioQuery] = useState('');
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [quickPanel, setQuickPanel] = useState<'audio' | 'effects' | null>(null);

  // ── Gallery ───────────────────────────────────────────────────
  const [galleryPermission, setGalleryPermission] = useState<GalleryPermissionState>('unknown');
  const [lastGalleryThumbnailUrl, setLastGalleryThumbnailUrl] = useState<string | null>(null);
  const [lastGalleryMediaKind, setLastGalleryMediaKind] = useState<GalleryMediaKind | null>(null);
  const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);

  // ── Reels ────────────────────────────────────────────────────
  const [reelEffectPreset, setReelEffectPreset] = useState<string>('none');
  const [reelFaceEnhance, setReelFaceEnhance] = useState(false);
  const [reelAiEnhance, setReelAiEnhance] = useState(false);
  const [reelTaggedUsers, setReelTaggedUsers] = useState('');
  const [reelLocationName, setReelLocationName] = useState('');
  const [reelAudience, setReelAudience] = useState<'public' | 'followers' | 'private'>('public');
  const [reelAllowComments, setReelAllowComments] = useState(true);
  const [reelAllowRemix, setReelAllowRemix] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [reelClientPublishId, setReelClientPublishId] = useState<string | null>(null);
  const [showReelEditor, setShowReelEditor] = useState(false);
  const [reelRecordingElapsedMs, setReelRecordingElapsedMs] = useState(0);
  const [reelMaxRecordingMs, setReelMaxRecordingMs] = useState<number>(RECORDING_DURATIONS[0].ms);

  // ── Editor state ─────────────────────────────────────────────
  const [editorState, dispatchEditor] = useReducer(editorStateReducer, undefined, getDefaultEditorState);

  // ── Refs ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraHostRef = useRef<CameraHostHandle | null>(null);
  const publishInFlightRef = useRef(false);
  const captureTimerRef = useRef<number | null>(null);
  const unmountRef = useRef(false);
  const isTabSwitchBootstrapping = useRef(false);
  const loadAudioTracksVersionRef = useRef(0);
  const captureInFlightRef = useRef(false);
  const reelRecordingStartRef = useRef(0);

  // ── Derived ──────────────────────────────────────────────────
  const isCameraAvailable = activeTab !== 'live';
  const isTextStoryMode = activeTab === 'stories' && storyComposeMode === 'text';
  const isPreviewVideo = selectedFile ? selectedFile.type.startsWith('video/') : activeTab === 'reels';
  const isCarouselMode = activeTab === 'publications' && editorState.carouselSlides.length > 0;
  const galleryAccept = activeTab === 'live' ? 'image/*' : activeTab === 'reels' ? 'video/*' : 'image/*,video/*';
  const captureMode: CaptureMode = activeTab === 'reels' ? 'reel' : 'story';
  const zoomLabel = ZOOM_LEVELS_LABELS[BASE_ZOOM_LEVELS[zoomIndex]] ?? `${BASE_ZOOM_LEVELS[zoomIndex]}x`;
  const isCameraActive = isOpen && isCameraAvailable && cameraMode === 'camera' && !isTextStoryMode && !isTabSwitchBootstrapping.current && !previewUrl;

  // ── Effects ───────────────────────────────────────────────────
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

  useEffect(() => {
    return () => {
      if (captureTimerRef.current) { window.clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
      if (previewUrl?.startsWith('blob:')) { try { URL.revokeObjectURL(previewUrl); } catch {} }
      if (lastGalleryThumbnailUrl?.startsWith('blob:')) { try { URL.revokeObjectURL(lastGalleryThumbnailUrl); } catch {} }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (isTabSwitchBootstrapping.current) {
      const t = setTimeout(() => { isTabSwitchBootstrapping.current = false; }, 100);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

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

  // ── Callbacks ─────────────────────────────────────────────────
  const getReelsPublishStorageKey = useCallback(() => {
    if (!user?.id) return null;
    return `reels_client_publish_id:${user.id}`;
  }, [user?.id]);

  const clearStoredReelPublishId = useCallback(() => {
    const storageKey = getReelsPublishStorageKey();
    if (!storageKey) return;
    try { sessionStorage.removeItem(storageKey); } catch {}
    try { localStorage.removeItem(storageKey); } catch {}
  }, [getReelsPublishStorageKey]);

  const getStableReelPublishId = useCallback((): string => {
    if (reelClientPublishId) return reelClientPublishId;
    const storageKey = getReelsPublishStorageKey();
    let resolvedId: string | null = null;
    if (storageKey) { try { resolvedId = sessionStorage.getItem(storageKey); } catch {} }
    if (!resolvedId && storageKey) { try { resolvedId = localStorage.getItem(storageKey); } catch {} }
    if (!resolvedId) {
      resolvedId = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      if (storageKey) { try { sessionStorage.setItem(storageKey, resolvedId); } catch {} try { localStorage.setItem(storageKey, resolvedId); } catch {} }
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
      const finalize = (duration: number | null) => { URL.revokeObjectURL(objectUrl); resolve(duration); };
      video.onloadedmetadata = () => finalize(Number.isFinite(video.duration) ? video.duration : null);
      video.onerror = () => finalize(null);
      video.src = objectUrl;
    });
  }, []);

  const loadAudioTracks = useCallback(async (queryText?: string) => {
    const version = ++loadAudioTracksVersionRef.current;
    setIsAudioLoading(true);
    try {
      const response = await editorApi.searchMusic({ page: 1, limit: 20, query: (queryText ?? '').trim() || undefined });
      if (version !== loadAudioTracksVersionRef.current) return;
      setAudioTracks(response.data.filter(row => row?.id && row?.title).map(row => ({
        id: String(row.id), title: String(row.title), artist: row.artist ? String(row.artist) : null,
      })));
    } catch (err) {
      if (version !== loadAudioTracksVersionRef.current) return;
      logger.error('[CreateContentModal] Не удалось загрузить аудио-треки', { error: err });
      toast.error('Не удалось загрузить аудио-треки');
    } finally {
      const isStale = version !== loadAudioTracksVersionRef.current;
      if (!isStale) setIsAudioLoading(false);
    }
  }, []);

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
    setLastGalleryThumbnailUrl(file.type.startsWith('image/') ? url : null);
    setCameraMode('gallery');
    setShowCaptionEditor(true);
    setReelClientPublishId(null);
    clearStoredReelPublishId();
  }, [activeTab, clearStoredReelPublishId, getVideoDurationSeconds]);

  const handleTabChange = useCallback((tabId: TabType) => {
    if (isCameraRecording) { toast.error('Остановите запись перед переключением режима'); return; }
    if (tabId !== 'live' && activeTab === 'live') { isTabSwitchBootstrapping.current = true; }
    setActiveTab(tabId);
    setStoryComposeMode('camera');
    setQuickPanel(null);
    setShowCameraSettings(false);
    setActiveContentType(TABS.find(t => t.id === tabId)?.contentType || 'post');
    setCameraMode(tabId === 'live' ? 'gallery' : 'camera');
    setShowCaptionEditor(false);
  }, [isCameraRecording, setActiveContentType, activeTab]);

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    const tabIndex = TABS.findIndex(t => t.id === activeTab);
    if (diff > 50 && tabIndex < TABS.length - 1) handleTabChange(TABS[tabIndex + 1].id);
    else if (diff < -50 && tabIndex > 0) handleTabChange(TABS[tabIndex - 1].id);
    setTouchStart(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tabIndex = TABS.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowRight' && tabIndex < TABS.length - 1) handleTabChange(TABS[tabIndex + 1].id);
    else if (e.key === 'ArrowLeft' && tabIndex > 0) handleTabChange(TABS[tabIndex - 1].id);
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey && tabIndex > 0) handleTabChange(TABS[tabIndex - 1].id);
      else if (!e.shiftKey && tabIndex < TABS.length - 1) handleTabChange(TABS[tabIndex + 1].id);
    } else if (e.key === 'Escape') handleClose();
  };

  const setPreviewFromCapture = (file: File, url: string) => {
    captureInFlightRef.current = false;
    dispatchEditor({ type: 'CLEAR_ALL' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(url);
    setCameraMode('gallery');
    setShowCaptionEditor(true);
    setReelClientPublishId(null);
    clearStoredReelPublishId();
  };

  // ── Publish logic ─────────────────────────────────────────────
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
    const result = await createTextStory({ text, backgroundId: textStoryBackgroundId, fontId: textStoryFontId, align: textStoryAlign, color: '#ffffff' });
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
    for (const slide of editorState.carouselSlides) { if (slide.caption.trim()) parts.push(slide.caption.trim()); }
    return parts.join('\n\n');
  }, [caption, editorState.carouselSlides]);

  const publishMediaContent = async (): Promise<boolean> => {
    const isCarousel = editorState.carouselSlides.length > 0;
    if (isCarousel) {
      const fullCaption = getCarouselCaption();
      const scheduledAt = editorState.scheduledDate?.toISOString() || null;
      const result = await uploadCarouselPost(editorState.carouselSlides, fullCaption, scheduledAt, { hideLikes: editorState.hideLikes, commentsDisabled: editorState.commentsDisabled });
      if (result && scheduledAt) toast.info(`Карусель запланирована на ${new Date(scheduledAt).toLocaleString('ru')}`);
      if (result) { toast.success('Карусель успешно загружена!'); onSuccess?.(result.content_type); resetForm(); onClose(); return true; }
      return false;
    }
    if (!selectedFile) { toast.error('Выберите медиа-файл'); return false; }
    const fileValidation = validateMediaFile(selectedFile, activeTab);
    if (!fileValidation.valid) { toast.error(fileValidation.error || 'Некорректный файл'); return false; }
    if (activeTab === 'reels' && selectedFile.type.startsWith('video/')) {
      const duration = await getVideoDurationSeconds(selectedFile);
      if (duration != null && duration > reelMaxRecordingMs / 1000) { toast.error(`Максимальная длительность: ${Math.round(reelMaxRecordingMs / 1000)}с`); return false; }
    }
    if (activeTab === 'reels') {
      const hashtagVerdict = await checkHashtagsAllowedForText(caption.trim());
      if (!hashtagVerdict.ok) { toast.error('Некоторые хештеги недоступны', { description: ('blockedTags' in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(', ') }); return false; }
    }
    const scheduledAt = editorState.scheduledDate?.toISOString() || null;
    let processedFile = selectedFile;
    if (activeTab === 'publications' && selectedFile.type.startsWith('image/')) {
      processedFile = await applyImageFilter(selectedFile, { filterIdx: editorState.selectedFilterIdx, filterIntensity: editorState.filterIntensity, adjustments: editorState.adjustments });
    }
    let result: UnifiedContent | null = null;
    switch (activeTab) {
      case 'publications': result = await uploadPostMedia(processedFile, caption, scheduledAt, { hideLikes: editorState.hideLikes, commentsDisabled: editorState.commentsDisabled }); break;
      case 'stories': result = await uploadStoryMedia(selectedFile, caption); break;
      case 'reels': result = await uploadReelMedia(selectedFile, caption, { clientPublishId: getStableReelPublishId(), musicTitle, musicTrackId: selectedMusicTrackId, effectPreset: reelEffectPreset, faceEnhance: reelFaceEnhance, aiEnhance: reelAiEnhance, maxDurationSec: Math.round(reelMaxRecordingMs / 1000), taggedUsers: reelTaggedUsers.split(',').map(v => v.trim()).filter(Boolean), locationName: reelLocationName.trim() || null, visibility: reelAudience, allowComments: reelAllowComments, allowRemix: reelAllowRemix }); break;
      default: return false;
    }
    if (result) { toast.success(`${TABS.find(t => t.id === activeTab)?.label ?? 'Контент'} успешно загружен!`); onSuccess?.(result.content_type); resetForm(); onClose(); return true; }
    return false;
  };

  const handlePublish = async () => {
    if (publishInFlightRef.current || unmountRef.current) return;
    publishInFlightRef.current = true;
    setIsPublishing(true);
    try {
      const validation = validateEditorState(editorState, activeTab);
      if (!validation.valid) { toast.error(validation.error || 'Ошибка валидации'); return; }
      if (validation.warnings) validation.warnings.forEach((w) => toast.warning(w));
      let published = false;
      if (activeTab === 'live') published = await publishLive();
      else if (activeTab === 'stories' && storyComposeMode === 'text') published = await publishTextStory();
      else published = await publishMediaContent();
      if (!published) return;
    } catch (err) { toast.error(err instanceof Error ? err.message : error || 'Ошибка при публикации'); logger.error('[CreateContentModal] Ошибка публикации', { error: err }); }
    finally { publishInFlightRef.current = false; setIsPublishing(false); }
  };

  const resetForm = () => {
    dispatchEditor({ type: 'CLEAR_ALL' });
    setCaption(''); setTitle(''); setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setCategory('other'); setMusicTitle(''); setSelectedMusicTrackId(null);
    setAudioQuery(''); setAudioTracks([]); setQuickPanel(null); setShowCameraSettings(false);
    setReelEffectPreset('none'); setReelFaceEnhance(false); setReelAiEnhance(false);
    setReelMaxRecordingMs(RECORDING_DURATIONS[0].ms);
    setReelTaggedUsers(''); setReelLocationName(''); setReelAudience('public');
    setReelAllowComments(true); setReelAllowRemix(true);
    setCameraMode('camera'); setShowCaptionEditor(false); setCaptureTimerSec(0); setTimerCountdown(null);
    setFlashMode('off'); setStoryComposeMode('camera'); setTextStoryText('');
    setTextStoryBackgroundId('gradient-aurora'); setTextStoryFontId('classic'); setTextStoryAlign('center');
    setZoomIndex(0); setReelClientPublishId(null); clearStoredReelPublishId();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isCameraRecording) { toast.error('Остановите запись перед закрытием'); return; }
    if (!isLoading) { resetForm(); onClose(); }
  };

  const cycleFlash = () => {
    void (async () => {
      if (facingMode === 'user') {
        const nextMode: FlashMode = flashMode === 'screen' ? 'off' : 'screen';
        if (nextMode === 'screen') { setFlashMode('screen'); setScreenFlashActive(true); setTimeout(() => setScreenFlashActive(false), 150); }
        else { setFlashMode('off'); setScreenFlashActive(false); }
        return;
      }
      const nextMode: FlashMode = flashMode === 'off' ? 'on' : 'off';
      if (nextMode === 'on') {
        const enabled = await cameraHostRef.current?.setTorchEnabled(true);
        if (!enabled) { toast.error('Вспышка недоступна на этой камере'); setFlashMode('off'); return; }
      } else { await cameraHostRef.current?.setTorchEnabled(false); }
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

  const cycleTimer = () => setCaptureTimerSec(prev => (prev === 0 ? 3 : prev === 3 ? 10 : 0));

  const runCapture = useCallback(() => {
    if (captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    if (activeTab === 'reels') void cameraHostRef.current?.recordVideo();
    else void cameraHostRef.current?.capturePhoto();
  }, [activeTab]);

  const handleCapture = useCallback(() => {
    if (timerCountdown != null) return;
    if (activeTab === 'reels' && isCameraRecording) { cameraHostRef.current?.stopRecording(); return; }
    if (captureTimerSec <= 0) { if (captureInFlightRef.current) return; runCapture(); return; }
    setTimerCountdown(captureTimerSec);
    captureTimerRef.current = window.setInterval(() => {
      setTimerCountdown(prev => {
        if (prev == null) return prev;
        if (prev <= 1) {
          if (captureTimerRef.current) { window.clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
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
      if (facingMode === 'user' && flashMode === 'screen') { setFlashMode('off'); setScreenFlashActive(false); }
      if (facingMode === 'environment' && flashMode === 'on') void cameraHostRef.current?.setTorchEnabled(true);
    }
  }, [flashMode, zoomIndex, facingMode]);

  const handleCameraDebugChange = useCallback((snapshot: CameraDebugSnapshot) => setCameraDebug(snapshot), []);

  const onPhotoCaptured = (file: File, url: string) => { setPreviewFromCapture(file, url); toast.success('Фото сохранено'); };
  const onVideoRecorded = (file: File, url: string) => { setPreviewFromCapture(file, url); toast.success('Видео сохранено'); };
  const onCameraError = (err: unknown) => { logger.error('[CreateContentModal] Ошибка доступа к камере', { error: err }); toast.error('Не удалось открыть камеру'); setCameraMode('gallery'); };

  const flipCamera = () => {
    setFacingMode(prev => {
      const next = prev === 'user' ? 'environment' : 'user';
      if (next === 'user') { setFlashMode('off'); setScreenFlashActive(false); }
      return next;
    });
  };

  // ── Gallery callbacks ────────────────────────────────────────
  const handleGalleryFileSelected = (file: File, url: string) => { void applyGalleryFile(file, url); };
  const handleGalleryCarouselAdded = (files: File[]) => {
    const remaining = 20 - editorState.carouselSlides.length;
    if (remaining <= 0) { toast.error('Максимум 20 слайдов в карусели'); return; }
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) toast.warning(`Добавлено только ${remaining} из ${files.length} файлов (лимит 20)`);
    for (const file of toProcess) {
      if (file.size > 50 * 1024 * 1024) { toast.error(`Файл "${file.name}" превышает 50 МБ`); continue; }
      const url = URL.createObjectURL(file);
      const slide = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, file, previewUrl: url, caption: '', filterIdx: 0, filterIntensity: 1, adjustments: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, shadows: 0, highlights: 0, vignette: 0, sharpness: 0, grain: 0 }, mediaType: file.type.startsWith('video/') ? 'video' : 'image' } as CarouselSlide;
      dispatchEditor({ type: 'ADD_CAROUSEL_SLIDE', payload: slide });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const handleGalleryPermissionChange = (permission: GalleryPermissionState) => setGalleryPermission(permission);
  const handleGalleryThumbnailChange = (url: string | null, kind: GalleryMediaKind | null) => {
    if (lastGalleryThumbnailUrl?.startsWith('blob:')) try { URL.revokeObjectURL(lastGalleryThumbnailUrl); } catch {}
    setLastGalleryThumbnailUrl(url);
    setLastGalleryMediaKind(kind);
  };

  const textBgChange = (id: string) => setTextStoryBackgroundId(id as typeof TEXT_STORY_BACKGROUNDS[number]['id']);
  const textFontChange = (id: string) => setTextStoryFontId(id as typeof TEXT_STORY_FONTS[number]['id']);

  // ── Context value ─────────────────────────────────────────────
  const contextValue = {
    activeTab, isPublishing, isLoading, handlePublish, handleClose,
    isCameraReady, isCameraRecording, timerCountdown, flashMode, screenFlashActive,
    facingMode, zoomIndex, zoomLabel, captureTimerSec, showCameraSettings, cameraDebug,
    reelMaxRecordingMs, reelRecordingElapsedMs, cameraHostRef,
    cycleFlash, cycleTimer, cycleZoom, setZoomLevelIndex, handleCapture,
    handleCameraReadyChange, handleCameraDebugChange,
    handleRecordingChange: setIsCameraRecording,
    flipCamera, setShowCameraSettings,
    onPhotoCaptured, onVideoRecorded, onCameraError,
    isActive: isCameraActive, mode: captureMode, previewZoom: BASE_ZOOM_LEVELS[zoomIndex],
    cameraMode, isCameraAvailable, isTextStoryMode,
    galleryPermission, lastGalleryThumbnailUrl, lastGalleryMediaKind, openGalleryPicker: () => { setQuickPanel(null); setShowCameraSettings(false); setShowMediaPickerModal(true); },
    previewUrl, selectedFile, resetForm, setPreviewUrl, setSelectedFile,
    showCaptionEditor, caption, editorState, dispatchEditor, setCaption,
    title, category, setTitle, setCategory,
    quickPanel, setQuickPanel, musicTitle, selectedMusicTrackId,
    setMusicTitle: setMusicTitle, setSelectedMusicTrackId: setSelectedMusicTrackId,
    reelEffectPreset, setReelEffectPreset,
    reelFaceEnhance, setReelFaceEnhance, reelAiEnhance, setReelAiEnhance,
    setReelMaxRecordingMs, audioQuery,
    textStoryText, setTextStoryText, textStoryBackgroundId, setTextStoryBackgroundId,
    textStoryFontId, setTextStoryFontId, textStoryAlign, setTextStoryAlign,
    galleryAccept, isCarouselMode, fileInputRef,
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      if (isCarouselMode) { handleGalleryCarouselAdded(files); return; }
      const file = files[0];
      if (file) void applyGalleryFile(file);
    },
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Создание контента"
      className={cn('fixed inset-y-0 right-0 z-[999] bg-black flex flex-col', isMobile ? 'left-0' : 'left-[84px]')}
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
              isActive={isCameraActive}
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
              onPhotoCaptured={onPhotoCaptured}
              onVideoRecorded={onVideoRecorded}
              onError={onCameraError}
              onDebugChange={handleCameraDebugChange}
            />
          )}

          {/* Screen flash overlay */}
          {screenFlashActive && <div className="absolute inset-0 bg-white animate-pulse pointer-events-none z-30" />}

          {/* Preview */}
          {previewUrl && (
            <div className="absolute inset-0">
              {isPreviewVideo
                ? <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
                : <img loading="lazy" src={previewUrl} alt="preview" className="w-full h-full object-cover" />}
            </div>
          )}

          {/* Empty gallery state */}
          {cameraMode === 'gallery' && !previewUrl && activeTab !== 'live' && !isTextStoryMode && (
            <EmptyGalleryState onClick={() => fileInputRef.current?.click()} />
          )}

          {/* Text story */}
          {isTextStoryMode && !previewUrl && (
            <TextStoryEditor
              text={textStoryText}
              onTextChange={setTextStoryText}
              backgroundId={textStoryBackgroundId}
              onBackgroundChange={textBgChange}
              fontId={textStoryFontId}
              onFontChange={textFontChange}
              align={textStoryAlign}
              onAlignChange={setTextStoryAlign}
            />
          )}

          {/* Live setup */}
          {activeTab === 'live' && !previewUrl && (
            <LiveStreamSetup
              title={title}
              onTitleChange={setTitle}
              category={category}
              onCategoryChange={setCategory}
              onOpenCoverPicker={() => fileInputRef.current?.click()}
            />
          )}

          {/* ── TOP BAR ──────────────────────────────────────────── */}
          <CameraTopBar />

          {/* Camera settings panel */}
          <CameraSettingsPanel />

          {/* ── Add audio label ──────────────────────────────────── */}
          {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
              <button onClick={() => { setQuickPanel('audio'); void loadAudioTracks(audioQuery); }}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-sm">
                <Music2 className="w-4 h-4" />
                <span>{musicTitle ? `Аудио: ${musicTitle}` : 'Добавить аудио'}</span>
              </button>
            </div>
          )}

          {/* ── Left sidebar tools ────────────────────────────────── */}
          <CameraSidebarTools onLoadAudioTracks={loadAudioTracks} />

          {/* ── Quick panels ──────────────────────────────────────── */}
          <QuickPanels
            onLoadAudioTracks={loadAudioTracks}
            audioTracks={audioTracks}
            isAudioLoading={isAudioLoading}
            audioQuery={audioQuery}
            setAudioQuery={setAudioQuery}
          />

          {/* ── Story mode toggle ─────────────────────────────────── */}
          {activeTab === 'stories' && !previewUrl && (
            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/45 p-1 text-xs font-semibold text-white backdrop-blur-md">
              <button type="button" onClick={() => setStoryComposeMode('camera')}
                className={cn('rounded-full px-4 py-2 transition-colors', storyComposeMode === 'camera' ? 'bg-white text-black' : 'text-white/70 hover:text-white')}>Камера</button>
              <button type="button" onClick={() => { setStoryComposeMode('text'); setQuickPanel(null); setShowCameraSettings(false); }}
                className={cn('rounded-full px-4 py-2 transition-colors', storyComposeMode === 'text' ? 'bg-white text-black' : 'text-white/70 hover:text-white')}>Текст</button>
            </div>
          )}

          {/* ── Caption editor overlay ─────────────────────────────── */}
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

          {/* ── Live caption ──────────────────────────────────────── */}
          {showCaptionEditor && activeTab === 'live' && (
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
              <Textarea placeholder="Добавьте описание трансляции..." value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} rows={2}
                className="w-full bg-white/10 backdrop-blur border-white/20 text-white placeholder:text-white/50 text-sm rounded-2xl resize-none" />
              <p className="text-right text-xs text-white/40 mt-1">{caption.length}/300</p>
            </div>
          )}

          {/* ── Bottom camera controls ─────────────────────────────── */}
          {cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode && (
            <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-between px-8">
              {/* Gallery */}
              <GalleryPicker
                activeTab={activeTab}
                isCarouselMode={isCarouselMode}
                thumbnailUrl={lastGalleryThumbnailUrl}
                mediaKind={lastGalleryMediaKind}
                permission={galleryPermission}
                fileInputRef={fileInputRef}
                onFileSelected={handleGalleryFileSelected}
                onCarouselFilesAdded={handleGalleryCarouselAdded}
                onPermissionChange={handleGalleryPermissionChange}
                onThumbnailChange={handleGalleryThumbnailChange}
                currentSlideCount={editorState.carouselSlides.length}
              />

              {/* Capture */}
              <div className="flex flex-col items-center gap-2">
                {!isCameraReady && <Loader2 className="w-5 h-5 text-white/60 animate-spin" />}

                {isCameraRecording && (
                  <RecordingTimerRing elapsedMs={reelRecordingElapsedMs} maxMs={reelMaxRecordingMs} />
                )}

                {!isCameraRecording && (
                  <button onClick={handleCapture} disabled={!isCameraReady || timerCountdown != null}
                    className={cn(
                      'relative w-[72px] h-[72px] rounded-full',
                      'before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-white/60 before:to-white/10 before:backdrop-blur-md before:border before:border-white/30 before:shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.4)]',
                      'after:absolute after:inset-1 after:rounded-full after:bg-gradient-to-br after:from-white/30 after:to-transparent after:shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]',
                      'active:scale-95 active:before:scale-95 transition-all duration-150',
                      (!isCameraReady || timerCountdown != null) && 'opacity-40',
                    )}
                    aria-label={activeTab === 'reels' ? (isCameraRecording ? 'Стоп' : 'Запись') : 'Снимок'}>
                    {timerCountdown != null
                      ? <span className="relative z-10 text-2xl font-bold text-white">{timerCountdown}</span>
                      : <span className="relative z-10 block w-[56px] h-[56px] rounded-full bg-white/90 shadow-inner" />}
                  </button>
                )}

                {isCameraRecording && (
                  <button onClick={() => cameraHostRef.current?.stopRecording()}
                    className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center">
                    <span className="block w-6 h-6 rounded bg-red-500" />
                  </button>
                )}

                {timerCountdown != null && <span className="text-xs text-white/80 font-medium">Таймер: {timerCountdown}</span>}
              </div>

              {/* Flip */}
              <button onClick={flipCamera} disabled={isCameraRecording}
                className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center" aria-label="Перевернуть камеру">
                <FlipHorizontal className="w-5 h-5 text-white" />
              </button>
            </div>
          )}

          {/* ── Preview controls ──────────────────────────────────── */}
          {previewUrl && (
            <div className="absolute top-16 right-4 z-20 flex items-center gap-2">
              {activeTab === 'reels' && selectedFile?.type.startsWith('video/') && (
                <button onClick={() => setShowReelEditor(true)}
                  className="w-10 h-10 rounded-full bg-blue-600/90 backdrop-blur-sm flex items-center justify-center text-white" aria-label="Редактировать видео">
                  <Wand2 className="w-5 h-5" />
                </button>
              )}
              <button onClick={resetForm}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white" aria-label="Переснять">
                <RotateCw className="w-5 h-5" />
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept={galleryAccept} onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length === 0) return;
            if (isCarouselMode) { handleGalleryCarouselAdded(files); return; }
            const file = files[0];
            if (file) void applyGalleryFile(file);
          }} className="hidden" />
        </div>

        {/* ── Bottom tab bar ─────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-black border-t border-white/10 pb-safe">
          <div role="tablist" className="flex items-stretch">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} role="tab" aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)} disabled={isCameraRecording}
                  className={cn('flex-1 py-3 flex flex-col items-center justify-center gap-0.5 transition-all', isActive ? 'text-white' : 'text-white/40', isCameraRecording && 'opacity-40 cursor-not-allowed')}>
                  <span className={cn('text-[11px] tracking-wide transition-all', isActive ? 'font-bold text-white' : 'font-normal')}>{tab.label.toUpperCase()}</span>
                  {isActive && <span className="block w-1 h-1 rounded-full bg-white mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Publish footer ─────────────────────────────────────── */}
        <PublishFooter
          activeTab={activeTab}
          isPublishing={isPublishing}
          isLoading={isLoading}
          canPublish={!!previewUrl || isCarouselMode || activeTab === 'live'}
          onPublish={handlePublish}
          onCancel={handleClose}
          title={title}
        />

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="absolute top-20 left-4 right-4 z-30 p-3 bg-red-900/80 backdrop-blur border border-red-500/50 rounded-2xl text-red-200 text-sm text-center">
            {error}
          </div>
        )}

        {/* ── Reel editor ──────────────────────────────────────── */}
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

        {/* ── Media picker modal ───────────────────────────────── */}
        <MediaPickerModal
          isOpen={showMediaPickerModal}
          onClose={() => setShowMediaPickerModal(false)}
          onSelect={async (selection) => {
            try {
              const files: File[] = [];
              for (const item of selection.items) {
                const response = await fetch(item.url);
                const blob = await response.blob();
                files.push(new File([blob], item.name, { type: blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg') }));
              }
              handleGalleryCarouselAdded(files);
              setShowMediaPickerModal(false);
            } catch (error) { logger.error('[CreateContentModal] Импорт', { error }); toast.error('Не удалось загрузить файлы'); }
          }}
          maxFiles={20}
          accept={galleryAccept}
        />
      </div>
  );
}

type AudioTrackOption = { id: string; title: string; artist?: string | null; };
