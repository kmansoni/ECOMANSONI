import { cn } from '@/lib/utils';
import { useCreateContent } from '../CreateContentContext';
import { BASE_ZOOM_LEVELS, RECORDING_DURATIONS } from './cameraConstants';

export function CameraSettingsPanel() {
  const {
    cameraMode, isCameraAvailable, isTextStoryMode, previewUrl,
    showCameraSettings, cameraDebug,
    facingMode, flashMode, captureTimerSec,
    zoomIndex, reelMaxRecordingMs,
    setShowCameraSettings, cycleFlash, cycleTimer, setZoomLevelIndex, setReelMaxRecordingMs,
  } = useCreateContent();

  if (cameraMode !== 'camera' || !isCameraAvailable || isTextStoryMode || !showCameraSettings || previewUrl) {
    return null;
  }

  return (
    <div className="absolute right-4 top-16 z-30 w-72 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-md p-4 text-white shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Настройки камеры</span>
        <button onClick={() => setShowCameraSettings(false)} className="text-xs text-white/70 hover:text-white">
          Закрыть
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Zoom */}
        <div>
          <div className="mb-2 flex items-center justify-between text-white/80">
            <span>Зум</span>
            <span>{BASE_ZOOM_LEVELS[zoomIndex]}x</span>
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
            {cameraDebug?.supportsZoom ? 'Аппаратный зум.' : 'Цифровой зум.'}
          </p>
        </div>

        {/* Flash + Timer */}
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
            <div className="text-[11px] opacity-70">
              {captureTimerSec > 0 ? `${captureTimerSec}с` : 'Выкл'}
            </div>
          </button>
        </div>

        {/* Max duration */}
        <div>
          <div className="mb-2 text-white/80 text-xs">Макс. длительность</div>
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

        {/* Debug info */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/70">
          <div>Камера: {facingMode === 'environment' ? 'задняя' : 'фронтальная'}</div>
          <div>Torch: {cameraDebug?.supportsTorch ? 'доступен' : 'недоступен'}</div>
          <div>Зум: {cameraDebug?.supportsZoom ? 'аппаратный' : 'цифровой'}</div>
        </div>
      </div>
    </div>
  );
}
