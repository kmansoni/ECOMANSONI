import { X, Settings, Zap, ZapOff, Timer, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateContent } from '../CreateContentContext';

export function CameraTopBar() {
  const {
    isCameraReady, isCameraRecording, timerCountdown, flashMode, screenFlashActive,
    facingMode, zoomIndex, zoomLabel, captureTimerSec,
    showCameraSettings, isLoading, isPublishing,
    isTextStoryMode, textStoryText,
    previewUrl, cameraMode, isCameraAvailable,
    isActive,
    cycleFlash, cycleTimer, cycleZoom,
    handlePublish, handleClose, setShowCameraSettings,
  } = useCreateContent();

  const isCameraMode = cameraMode === 'camera' && isCameraAvailable && !isTextStoryMode;
  const FlashIcon = flashMode === 'off' ? ZapOff : Zap;
  const flashColor = flashMode === 'screen'
    ? 'text-white'
    : flashMode === 'on'
    ? 'text-yellow-400'
    : flashMode === 'auto'
    ? 'text-blue-400'
    : 'text-white/70';

  const publishDisabled =
    isLoading ||
    isPublishing ||
    (isTextStoryMode && !textStoryText.trim());

  return (
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

      {/* Center controls */}
      {isCameraMode && (
        <div className="flex items-center gap-4">
          <button onClick={cycleFlash} className="flex flex-col items-center gap-0.5" aria-label="Вспышка">
            <FlashIcon className={cn('w-6 h-6', flashColor)} />
          </button>
          <button
            onClick={cycleZoom}
            className="min-w-[36px] h-8 px-2 rounded-full bg-black/40 backdrop-blur-sm text-white text-sm font-bold flex items-center justify-center"
            aria-label="Зум"
          >
            {zoomLabel}
          </button>
          <button
            onClick={cycleTimer}
            className={cn(
              'flex flex-col items-center',
              captureTimerSec > 0 ? 'text-yellow-400' : 'text-white/70',
            )}
            aria-label="Таймер"
          >
            <Timer className="w-6 h-6" />
            {captureTimerSec > 0 && (
              <span className="text-[10px] font-bold leading-none">{captureTimerSec}с</span>
            )}
          </button>
        </div>
      )}

      {/* Right side: publish / settings */}
      {previewUrl || isTextStoryMode ? (
        <button
          onClick={handlePublish}
          disabled={publishDisabled}
          className="px-4 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
        >
          {isLoading || isPublishing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isTextStoryMode ? (
            'Опубликовать'
          ) : (
            'Далее →'
          )}
        </button>
      ) : (
        <button
          onClick={() => { setShowCameraSettings(prev => !prev); }}
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
  );
}
