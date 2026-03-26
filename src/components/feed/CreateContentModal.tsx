import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Image, Film, Radio, Camera, Loader2, RotateCw, Upload,
  Zap, ZapOff, Timer, Settings, Sparkles, Music2, FlipHorizontal,
  Wand2, User, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useChatOpen } from '@/contexts/ChatOpenContext';
import type { ContentType } from '@/hooks/useMediaEditor';
import { useUnifiedContentCreator } from '@/hooks/useUnifiedContentCreator';
import { CameraHost, type CameraHostHandle, type CaptureMode } from '@/components/camera/CameraHost';
import type { CameraDebugSnapshot } from '@/components/camera/CameraHost';

interface CreateContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (contentType: ContentType) => void;
}

type TabType = 'publications' | 'stories' | 'reels' | 'live';
type CameraMode = 'camera' | 'gallery';
type FlashMode = 'off' | 'on' | 'auto';

const TABS: Array<{ id: TabType; label: string; icon: any; contentType: ContentType }> = [
  { id: 'publications', label: 'Публикация', icon: Image, contentType: 'post' },
  { id: 'stories', label: 'История', icon: Camera, contentType: 'story' },
  { id: 'reels', label: 'Видео Reels', icon: Film, contentType: 'reel' },
  { id: 'live', label: 'Прямой эфир', icon: Radio, contentType: 'live' },
];

const ZOOM_LEVELS = [0.5, 1, 2, 3] as const;

export function CreateContentModal({ isOpen, onClose, onSuccess }: CreateContentModalProps) {
  const { setIsCreatingContent } = useChatOpen();
  const {
    isLoading,
    error,
    setActiveContentType,
    uploadStoryMedia,
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
  const [zoomIndex, setZoomIndex] = useState(1); // 1x by default
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraHostRef = useRef<CameraHostHandle | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    setIsCreatingContent(isOpen);

    return () => {
      setIsCreatingContent(false);
    };
  }, [isOpen, setIsCreatingContent]);

  // Lock body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const setPreviewFromCapture = (file: File, url: string) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(url);
    setCameraMode('gallery');
    setShowCaptionEditor(true);
  };

  const handleTabChange = useCallback((tabId: TabType) => {
    if (isCameraRecording) {
      toast.error('Остановите запись перед переключением режима');
      return;
    }
    setActiveTab(tabId);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCameraMode('gallery');
      setShowCaptionEditor(true);
    }
  };

  const handlePublish = async () => {
    const currentTab = TABS.find((t) => t.id === activeTab);
    try {
      if (activeTab === 'live') {
        if (!title.trim()) { toast.error('Укажите название трансляции'); return; }
        await createLiveSession(title, category, previewUrl || undefined);
        toast.success('Трансляция готова к началу!');
        onSuccess?.('live');
        resetForm();
        onClose();
      } else {
        if (!selectedFile) { toast.error('Выберите медиа-файл'); return; }
        let result: { content_type: ContentType } | null = null;
        switch (activeTab) {
          case 'publications': result = await uploadPostMedia(selectedFile, caption); break;
          case 'stories': result = await uploadStoryMedia(selectedFile, caption); break;
          case 'reels': result = await uploadReelMedia(selectedFile, caption); break;
        }
        if (result) {
          toast.success(`${currentTab?.label} успешно загружена!`);
          onSuccess?.(result.content_type);
          resetForm();
          onClose();
        }
      }
    } catch {
      toast.error(error || 'Ошибка при публикации');
    }
  };

  const resetForm = () => {
    setCaption('');
    setTitle('');
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCategory('other');
    setCameraMode('camera');
    setShowCaptionEditor(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isCameraRecording) { toast.error('Остановите запись перед закрытием'); return; }
    if (!isLoading) { resetForm(); onClose(); }
  };

  const cycleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : prev === 'on' ? 'auto' : 'off');
  };

  const cycleZoom = () => {
    setZoomIndex(prev => (prev + 1) % ZOOM_LEVELS.length);
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

  const FlashIcon = flashMode === 'off' ? ZapOff : Zap;
  const flashColor = flashMode === 'on' ? 'text-yellow-400' : flashMode === 'auto' ? 'text-blue-400' : 'text-white/70';

  return (
    <div
      className="fixed inset-0 z-[999] bg-black flex flex-col"
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
            isActive={isOpen && isCameraAvailable && cameraMode === 'camera'}
            mode={captureMode}
            facingMode={facingMode}
            className={cn(
              'absolute inset-0 transition-opacity duration-150',
              cameraMode === 'camera' && !previewUrl ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            videoClassName="w-full h-full object-cover"
            onReadyChange={setIsCameraReady}
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
              console.error('Ошибка доступа к камере:', err);
              toast.error('Не удалось открыть камеру');
              setCameraMode('gallery');
            }}
            onDebugChange={setCameraDebug}
          />
        )}

        {/* Preview (photo/video after capture or gallery pick) */}
        {previewUrl && (
          <div className="absolute inset-0">
            {isPreviewVideo ? (
              <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
            ) : (
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            )}
          </div>
        )}

        {/* Empty gallery state */}
        {cameraMode === 'gallery' && !previewUrl && activeTab !== 'live' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer text-white/50 hover:text-white/80 transition-colors"
          >
            <Upload className="w-20 h-20 opacity-40" />
            <p className="text-base font-medium">Нажмите чтобы выбрать медиа</p>
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
          {cameraMode === 'camera' && isCameraAvailable && (
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
                onClick={() => setTimerEnabled(v => !v)}
                className={cn('flex flex-col items-center', timerEnabled ? 'text-yellow-400' : 'text-white/70')}
                aria-label="Таймер"
              >
                <Timer className="w-6 h-6" />
              </button>
            </div>
          )}

          {/* Settings / Done */}
          {previewUrl ? (
            <button
              onClick={handlePublish}
              disabled={isLoading}
              className="px-4 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Далее →'}
            </button>
          ) : (
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white" aria-label="Настройки">
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ── ADD AUDIO label (camera mode, non-live) ─────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
            <button className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-sm">
              <Music2 className="w-4 h-4" />
              <span>Добавить аудио</span>
            </button>
          </div>
        )}

        {/* ── LEFT SIDEBAR TOOLS (camera mode only) ─────────────────── */}
        {cameraMode === 'camera' && isCameraAvailable && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-5">
            {[
              { icon: Music2, label: 'Аудио' },
              { icon: Sparkles, label: 'Эффекты' },
              { icon: Timer, label: '60с' },
              { icon: User, label: 'Лицо' },
              { icon: Wand2, label: 'AI' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-0.5"
                aria-label={label}
              >
                <div className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] text-white/80 font-medium">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── CAPTION EDITOR OVERLAY (after capture) ─────────────── */}
        {showCaptionEditor && previewUrl && activeTab !== 'live' && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
            <Textarea
              placeholder="Добавьте описание..."
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
        {cameraMode === 'camera' && isCameraAvailable && (
          <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-between px-8">
            {/* Gallery thumbnail button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden"
              aria-label="Галерея"
              disabled={isCameraRecording}
            >
              <Upload className="w-5 h-5 text-white" />
            </button>

            {/* Main capture button */}
            <div className="flex flex-col items-center gap-2">
              {!isCameraReady && (
                <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
              )}
              <button
                onClick={() => {
                  if (activeTab === 'reels') {
                    void cameraHostRef.current?.recordVideo();
                  } else {
                    void cameraHostRef.current?.capturePhoto();
                  }
                }}
                disabled={!isCameraReady}
                className={cn(
                  'w-[72px] h-[72px] rounded-full border-4 transition-all active:scale-95',
                  isCameraRecording
                    ? 'border-red-500 bg-red-500/30 scale-90'
                    : 'border-white bg-white/20 hover:bg-white/30',
                  !isCameraReady && 'opacity-40',
                )}
                aria-label={activeTab === 'reels' ? (isCameraRecording ? 'Стоп' : 'Запись') : 'Снимок'}
              >
                {isCameraRecording && (
                  <span className="block w-6 h-6 rounded bg-red-500 mx-auto" />
                )}
              </button>
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
          <button
            onClick={() => {
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
              setSelectedFile(null);
              setCameraMode('camera');
              setShowCaptionEditor(false);
            }}
            className="absolute top-16 right-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
            aria-label="Переснять"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={activeTab === 'live' ? 'image/*' : 'image/*,video/*'}
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
            disabled={isLoading || !title.trim()}
            className="flex-1 bg-red-600 hover:bg-red-500 h-11 rounded-2xl font-semibold text-white"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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
    </div>
  );
}
