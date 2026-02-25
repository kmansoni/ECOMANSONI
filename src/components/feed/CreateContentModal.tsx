import { useState, useRef, useEffect } from 'react';
import { X, Image, Film, Radio, Camera, Loader2, RotateCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

const TABS: Array<{ id: TabType; label: string; icon: any; contentType: ContentType }> = [
  { id: 'publications', label: 'Публикация', icon: Image, contentType: 'post' },
  { id: 'stories', label: 'История', icon: Camera, contentType: 'story' },
  { id: 'reels', label: 'Видео Reels', icon: Film, contentType: 'reel' },
  { id: 'live', label: 'Эфир', icon: Radio, contentType: 'live' },
];

export function CreateContentModal({ isOpen, onClose, onSuccess }: CreateContentModalProps) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraHostRef = useRef<CameraHostHandle | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const setPreviewFromCapture = (file: File, url: string) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(file);
    setPreviewUrl(url);
    setCameraMode('gallery');
  };

  const handleTabChange = (tabId: TabType) => {
    if (isCameraRecording) {
      toast.error('Остановите запись перед переключением режима');
      return;
    }

    setActiveTab(tabId);
    setActiveContentType(TABS.find(t => t.id === tabId)?.contentType || 'post');
    setCameraMode(tabId === 'live' ? 'gallery' : 'camera');
  };

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
    
    if (e.key === 'ArrowRight' && tabIndex > 0) {
      handleTabChange(TABS[tabIndex - 1].id);
    } else if (e.key === 'ArrowLeft' && tabIndex < TABS.length - 1) {
      handleTabChange(TABS[tabIndex + 1].id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey && tabIndex > 0) {
        handleTabChange(TABS[tabIndex - 1].id);
      } else if (!e.shiftKey && tabIndex < TABS.length - 1) {
        handleTabChange(TABS[tabIndex + 1].id);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCameraMode('gallery');
    }
  };

  const handlePublish = async () => {
    const currentTab = TABS.find((t) => t.id === activeTab);
    
    try {
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
        if (!selectedFile) {
          toast.error('Выберите медиа-файл');
          return;
        }

        let result = null;
        switch (activeTab) {
          case 'publications':
            result = await uploadPostMedia(selectedFile, caption);
            break;
          case 'stories':
            result = await uploadStoryMedia(selectedFile, caption);
            break;
          case 'reels':
            result = await uploadReelMedia(selectedFile, caption);
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
      toast.error(error || 'Ошибка при публикации');
    }
  };

  const resetForm = () => {
    setCaption('');
    setTitle('');
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCategory('other');
    setCameraMode('camera');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isCameraRecording) {
      toast.error('Остановите запись перед закрытием');
      return;
    }

    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentTab = TABS.find((t) => t.id === activeTab);
  const isCameraAvailable = activeTab !== 'live';
  const captureMode: CaptureMode = activeTab === 'reels' ? 'reel' : 'story';
  const isPreviewVideo = selectedFile ? selectedFile.type.startsWith('video/') : activeTab === 'reels';

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-end">
      <div className="w-full bg-slate-900 rounded-t-3xl border-t border-slate-700 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{currentTab?.label}</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          className="sticky top-16 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-3 py-3 flex gap-2 overflow-x-auto scroll-smooth focus:outline-none"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                disabled={isCameraRecording}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0',
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                  isCameraRecording && 'opacity-60 cursor-not-allowed'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="p-4 space-y-4 min-h-[500px] flex flex-col">
          {/* Camera/Media Preview Area */}
          <div 
            className="flex-1 bg-slate-800 rounded-xl flex items-center justify-center overflow-hidden border border-slate-700 relative min-h-[300px]"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {isCameraAvailable && (
              <CameraHost
                ref={cameraHostRef}
                isActive={isOpen && isCameraAvailable}
                mode={captureMode}
                className={cn(
                  'absolute inset-0 transition-opacity duration-150',
                  cameraMode === 'camera' && !previewUrl ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                videoClassName="w-full h-full object-cover"
                onReadyChange={setIsCameraReady}
                onRecordingChange={setIsCameraRecording}
                onPhotoCaptured={(file, url) => {
                  setPreviewFromCapture(file, url);
                  toast.success('Фото загружено');
                }}
                onVideoRecorded={(file, url) => {
                  setPreviewFromCapture(file, url);
                  toast.success('Видео загружено');
                }}
                onError={(err) => {
                  console.error('Ошибка доступа к камере:', err);
                  toast.error('Не удалось открыть камеру');
                  setCameraMode('gallery');
                }}
                onDebugChange={setCameraDebug}
              />
            )}

            {cameraMode === 'camera' && isCameraAvailable ? (
              <>
                {!isCameraReady && (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm">Включение камеры...</span>
                  </div>
                )}

                <div className="absolute bottom-4 left-0 right-0 flex gap-3 justify-center px-4">
                  <Button
                    onClick={() => setCameraMode('gallery')}
                    variant="outline"
                    size="sm"
                    className="bg-slate-900/80 border-slate-600"
                    disabled={isCameraRecording}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Галерея
                  </Button>

                  {activeTab === 'stories' || activeTab === 'publications' ? (
                    <Button
                      onClick={() => {
                        void cameraHostRef.current?.capturePhoto();
                      }}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={!isCameraReady || isCameraRecording}
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Снимок
                    </Button>
                  ) : activeTab === 'reels' ? (
                    <Button
                      onClick={() => {
                        void cameraHostRef.current?.recordVideo();
                      }}
                      size="sm"
                      className="bg-red-600 hover:bg-red-700"
                      disabled={!isCameraReady || isCameraRecording}
                    >
                      <Film className="w-4 h-4 mr-2" />
                      {isCameraRecording ? 'Запись...' : 'Запись'}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : previewUrl ? (
              <>
                {isPreviewVideo ? (
                  <video
                    src={previewUrl}
                    className="w-full h-full object-cover"
                    controls
                  />
                ) : (
                  <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                )}
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-lg text-white transition-colors"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
              </>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-4 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Upload className="w-16 h-16 opacity-50" />
                <div className="text-center">
                  <p className="font-semibold mb-1">Выберите медиа</p>
                  <p className="text-xs text-slate-500">Нажмите чтобы выбрать файл</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={activeTab === 'live' ? 'image/*' : 'image/*,video/*'}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {activeTab === 'live' && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Название трансляции
                  </label>
                  <Input
                    placeholder="Мой прямой эфир..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={50}
                    className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm h-9"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">{title.length}/50</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Категория
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="other">Другое</option>
                    <option value="music">Музыка</option>
                    <option value="gaming">Игры</option>
                    <option value="chat">Разговор</option>
                    <option value="performance">Перформанс</option>
                  </select>
                </div>
              </>
            )}

            {activeTab !== 'live' && selectedFile && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Описание
                </label>
                <Textarea
                  placeholder="Добавьте описание..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={300}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm h-16"
                />
                <p className="text-xs text-slate-400 mt-0.5">{caption.length}/300</p>
              </div>
            )}

            {error && (
              <div className="p-2 bg-red-900/30 border border-red-600/50 rounded-lg text-red-200 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 mt-auto">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 border-slate-600 h-9 text-sm"
            >
              Отмена
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isLoading || (!selectedFile && activeTab !== 'live') || (activeTab === 'live' && !title)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 h-9 text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Загрузка
                </>
              ) : (
                'Далее'
              )}
            </Button>
          </div>

          {selectedFile && (
            <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700 text-xs text-slate-400">
              <span className="font-medium text-slate-300">💡 </span>
              {activeTab === 'stories'
                ? 'История видна 24 часа'
                : activeTab === 'reels'
                  ? 'Вертикальное видео на всю ширину'
                  : activeTab === 'live'
                    ? 'Неограниченное время трансляции'
                    : 'Публикация видна подписчикам'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
