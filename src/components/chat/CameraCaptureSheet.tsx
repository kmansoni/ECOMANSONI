import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FlipHorizontal, Send, Settings, Video, X, Zap, ZapOff } from "lucide-react";
import { CameraHost, type CameraHostHandle } from "@/components/camera/CameraHost";
import { cn } from "@/lib/utils";

type FacingMode = "user" | "environment";
type CaptureKind = "photo" | "video";
type EffectKey = "none" | "vivid" | "mono" | "cool" | "warm";
type VideoQuality = "low" | "medium" | "high";

interface CameraCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendFile: (file: File, type: "image" | "video") => Promise<void> | void;
  settingsScopeKey?: string;
}

const STORAGE_KEY_FACING = "facing";
const STORAGE_KEY_MODE = "capture_mode";
const STORAGE_KEY_EFFECT = "effect";
const STORAGE_KEY_ZOOM = "zoom";
const STORAGE_KEY_QUALITY = "video_quality";
const STORAGE_KEY_FLASH = "flash_enabled";

const QUALITY_PRESETS: Record<VideoQuality, { label: string; bitrate: number }> = {
  low: { label: "Низкое", bitrate: 1_500_000 },
  medium: { label: "Среднее", bitrate: 2_800_000 },
  high: { label: "Высокое", bitrate: 4_500_000 },
};

const EFFECTS: Array<{ key: EffectKey; label: string; filter: string }> = [
  { key: "none", label: "Норм", filter: "none" },
  { key: "vivid", label: "Яркий", filter: "saturate(1.25) contrast(1.12)" },
  { key: "mono", label: "Ч/Б", filter: "grayscale(1) contrast(1.08)" },
  { key: "cool", label: "Холод", filter: "saturate(1.1) hue-rotate(10deg) brightness(1.04)" },
  { key: "warm", label: "Тепло", filter: "saturate(1.1) sepia(0.25) hue-rotate(-10deg)" },
];

export function CameraCaptureSheet({
  open,
  onOpenChange,
  onSendFile,
  settingsScopeKey = "global",
}: CameraCaptureSheetProps) {
  const storageKey = useCallback(
    (suffix: string) => `chat_camera:${settingsScopeKey}:${suffix}`,
    [settingsScopeKey],
  );

  const cameraRef = useRef<CameraHostHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_FACING));
    return saved === "user" ? "user" : "environment";
  });
  const [captureKind, setCaptureKind] = useState<CaptureKind>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_MODE));
    return saved === "video" ? "video" : "photo";
  });
  const [effect, setEffect] = useState<EffectKey>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_EFFECT));
    return (EFFECTS.find((e) => e.key === saved)?.key ?? "none") as EffectKey;
  });
  const [zoom, setZoom] = useState<number>(() => {
    const saved = Number(localStorage.getItem(storageKey(STORAGE_KEY_ZOOM)));
    if (!Number.isFinite(saved)) return 1;
    return Math.min(3, Math.max(1, saved));
  });
  const [videoQuality, setVideoQuality] = useState<VideoQuality>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_QUALITY));
    return saved === "low" || saved === "high" ? saved : "medium";
  });
  const [flashEnabled, setFlashEnabled] = useState<boolean>(() => {
    return localStorage.getItem(storageKey(STORAGE_KEY_FLASH)) === "1";
  });
  const [captured, setCaptured] = useState<{ file: File; previewUrl: string; type: "image" | "video" } | null>(null);

  useEffect(() => {
    if (!open) {
      setShowSettings(false);
      setRecording(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_FACING), facingMode);
  }, [facingMode, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_MODE), captureKind);
  }, [captureKind, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_EFFECT), effect);
  }, [effect, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_ZOOM), String(zoom));
  }, [zoom, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_QUALITY), videoQuality);
  }, [videoQuality, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY_FLASH), flashEnabled ? "1" : "0");
  }, [flashEnabled, storageKey]);

  useEffect(() => {
    const syncTorch = async () => {
      const host = cameraRef.current;
      if (!host || !ready || captured) return;
      const supported = host.supportsTorch();
      setTorchSupported(supported);
      if (!supported) {
        setFlashEnabled(false);
        return;
      }
      await host.setTorchEnabled(flashEnabled);
    };

    void syncTorch();
  }, [ready, captured, facingMode, flashEnabled]);

  useEffect(() => {
    return () => {
      if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
    };
  }, [captured?.previewUrl]);

  const canCapture = useMemo(
    () => open && ready && !captured && !sending,
    [open, ready, captured, sending]
  );

  const selectedFilter = useMemo(
    () => EFFECTS.find((e) => e.key === effect)?.filter ?? "none",
    [effect]
  );

  const handleClose = () => {
    if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
    setCaptured(null);
    setRecording(false);
    setShowSettings(false);
    onOpenChange(false);
  };

  const handleCapture = async () => {
    if (!canCapture) return;
    if (captureKind === "video") {
      if (recording) {
        cameraRef.current?.stopRecording();
      } else {
        await cameraRef.current?.recordVideo();
      }
      return;
    }
    await cameraRef.current?.capturePhoto();
  };

  const handleRetake = () => {
    if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
    setCaptured(null);
  };

  const handleSend = async () => {
    if (!captured || sending) return;
    try {
      setSending(true);
      await onSendFile(captured.file, captured.type);
      handleClose();
    } finally {
      setSending(false);
    }
  };

  const toggleFacing = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const toggleFlash = async () => {
    if (!torchSupported || !cameraRef.current) return;
    const next = !flashEnabled;
    const ok = await cameraRef.current.setTorchEnabled(next);
    if (ok) setFlashEnabled(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black">
      <div className="absolute inset-0">
        <CameraHost
          ref={cameraRef}
          isActive={open && !captured}
          mode={captureKind === "video" ? "reel" : "story"}
          facingMode={facingMode}
          className={cn("absolute inset-0", captured ? "opacity-0 pointer-events-none" : "opacity-100")}
          videoClassName="w-full h-full object-cover"
          videoStyle={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          targetVideoBitsPerSecond={QUALITY_PRESETS[videoQuality].bitrate}
          onReadyChange={setReady}
          onRecordingChange={setRecording}
          onPhotoCaptured={(file, previewUrl) => {
            setCaptured({ file, previewUrl, type: "image" });
          }}
          onVideoRecorded={(file, previewUrl) => {
            setCaptured({ file, previewUrl, type: "video" });
          }}
          onError={() => {
            setReady(false);
            setRecording(false);
          }}
        />

        {captured && (
          captured.type === "video" ? (
            <video src={captured.previewUrl} className="absolute inset-0 w-full h-full object-cover" controls playsInline />
          ) : (
            <img loading="lazy" src={captured.previewUrl} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
          )
        )}

        {!captured && (
          <div className="absolute inset-0 pointer-events-none" style={{ filter: selectedFilter }} />
        )}

        {!captured && zoom > 1 && <div className="absolute inset-0 pointer-events-none border border-white/10" />}
      </div>

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-10">
        <button
          type="button"
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center"
          aria-label="Закрыть камеру"
        >
          <X className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center"
          aria-label="Настройки камеры"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {showSettings && (
        <div className="absolute top-16 right-4 z-20 w-72 rounded-xl border border-white/15 bg-black/75 backdrop-blur p-3 space-y-3">
          <p className="text-xs text-white/70">Настройки камеры</p>
          <button
            type="button"
            onClick={toggleFacing}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-white/10 text-white text-sm"
          >
            <span>Камера</span>
            <span>{facingMode === "user" ? "Фронтальная" : "Основная"}</span>
          </button>

          <button
            type="button"
            onClick={toggleFlash}
            disabled={!torchSupported}
            className={cn(
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm",
              torchSupported ? "bg-white/10 text-white" : "bg-white/5 text-white/40"
            )}
          >
            <span className="flex items-center gap-2">
              {flashEnabled ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              Вспышка
            </span>
            <span>{torchSupported ? (flashEnabled ? "Вкл" : "Выкл") : "Недоступно"}</span>
          </button>

          <div className="space-y-1">
            <p className="text-xs text-white/60">Увеличение: {zoom.toFixed(1)}x</p>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-white/60">Качество видео</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(QUALITY_PRESETS) as VideoQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setVideoQuality(q)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    videoQuality === q ? "bg-cyan-500 text-white" : "bg-white/10 text-white/80"
                  )}
                >
                  {QUALITY_PRESETS[q].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-white/60">Эффекты</p>
            <div className="grid grid-cols-3 gap-2">
              {EFFECTS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setEffect(entry.key)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    effect === entry.key ? "bg-cyan-500 text-white" : "bg-white/10 text-white/80"
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-0 right-0 z-10 flex items-center justify-center gap-5 px-4">
        {captured ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="px-4 h-11 rounded-full bg-white/15 text-white text-sm"
            >
              Переснять
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="w-14 h-14 rounded-full bg-cyan-500 text-white flex items-center justify-center disabled:opacity-60"
              aria-label={captured.type === "video" ? "Отправить видео" : "Отправить фото"}
            >
              <Send className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCaptureKind("photo")}
                className={cn(
                  "px-3 h-8 rounded-full text-xs",
                  captureKind === "photo" ? "bg-white text-black" : "bg-black/45 text-white"
                )}
              >
                Фото
              </button>
              <button
                type="button"
                onClick={() => setCaptureKind("video")}
                className={cn(
                  "px-3 h-8 rounded-full text-xs",
                  captureKind === "video" ? "bg-white text-black" : "bg-black/45 text-white"
                )}
              >
                Видео
              </button>
            </div>

            <button
              type="button"
              onClick={toggleFacing}
              className="w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center"
              aria-label="Сменить камеру"
              disabled={recording}
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleCapture}
              disabled={!canCapture}
              className={cn(
                "w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50",
                captureKind === "video" && recording ? "bg-red-500/80" : "bg-white/20"
              )}
              aria-label={captureKind === "video" ? (recording ? "Остановить запись" : "Начать запись") : "Сделать фото"}
            >
              {captureKind === "video" ? <Video className="w-6 h-6 text-white" /> : <Camera className="w-6 h-6 text-white" />}
            </button>

            {captureKind === "video" && recording && (
              <span className="absolute -bottom-4 text-xs text-red-300">Идёт запись...</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
