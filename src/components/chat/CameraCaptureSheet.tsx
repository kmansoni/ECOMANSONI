import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture,
  Camera,
  FlipHorizontal,
  Moon,
  MoreHorizontal,
  Send,
  Settings,
  Snowflake,
  Sun,
  Timer,
  Video,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import { CameraHost, type CameraHostHandle, type ProCameraSettings, type VideoMode } from "@/components/camera/CameraHost";
import { ProControlsPanel } from "@/components/camera/ProControlsPanel";
import { ProHistogram } from "@/components/camera/ProHistogram";
import { LevelIndicator } from "@/components/camera/ProHistogram";
import { useAIFilters, INSTAGRAM_FILTERS, type AIFilterConfig } from "@/features/create/camera/useAIFilters";
import { cn } from "@/lib/utils";

type FacingMode = "user" | "environment";
type CaptureKind = "photo" | "video";
type EffectKey = "none" | "vivid" | "mono" | "cool" | "warm" | "fade" | "vintage" | "dramatic" | "blackout" | "glow";
type VideoQuality = "low" | "medium" | "high";
type CapturePreset = "auto" | "pro" | "portrait" | "night" | "food" | "sport";

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
const STORAGE_KEY_PRESET = "capture_preset";
const STORAGE_KEY_VIDEOMODE = "video_mode";
const STORAGE_KEY_PRO_SETTINGS = "pro_settings";

const QUALITY_PRESETS: Record<VideoQuality, { label: string; bitrate: number }> = {
  low: { label: "Низкое", bitrate: 1_500_000 },
  medium: { label: "Среднее", bitrate: 2_800_000 },
  high: { label: "Высокое", bitrate: 4_500_000 },
};

// Instagram-style filters
const EFFECTS: Array<{ key: EffectKey; label: string; filter: string }> = [
  { key: "none", label: "Normal", filter: "none" },
  { key: "vivid", label: "Vivid", filter: "saturate(1.35) contrast(1.15) brightness(1.05)" },
  { key: "mono", label: "B&W", filter: "grayscale(1) contrast(1.08)" },
  { key: "cool", label: "Cool", filter: "saturate(1.1) hue-rotate(10deg) brightness(1.04)" },
  { key: "warm", label: "Warm", filter: "saturate(1.1) sepia(0.25) hue-rotate(-10deg)" },
  { key: "fade", label: "Fade", filter: "contrast(0.9) saturate(0.85) brightness(1.1)" },
  { key: "vintage", label: "Vintage", filter: "sepia(0.35) contrast(1.1) saturate(0.85)" },
  { key: "dramatic", label: "Dramatic", filter: "contrast(1.35) saturate(0.9) brightness(0.95)" },
  { key: "blackout", label: "Blackout", filter: "contrast(1.5) saturate(0.3) brightness(0.85)" },
  { key: "glow", label: "Glow", filter: "brightness(1.15) contrast(1.05) saturate(1.2) blur(0.3px)" },
];

// Capture presets
const CAPTURE_PRESETS: Array<{ key: CapturePreset; label: string; icon: React.ReactNode; proSettings?: Partial<ProCameraSettings> }> = [
  { key: "auto", label: "Auto", icon: <Camera className="w-4 h-4" /> },
  { key: "pro", label: "Pro", icon: <Aperture className="w-4 h-4" /> },
  { key: "portrait", label: "Portrait", icon: <Camera className="w-4 h-4" />, proSettings: { focusMode: "continuous" } },
  { key: "night", label: "Night", icon: <Moon className="w-4 h-4" />, proSettings: { nightMode: true, exposureCompensation: 0.5 } },
  { key: "food", label: "Food", icon: <Sun className="w-4 h-4" />, proSettings: { whiteBalanceMode: "fluorescent" as const, whiteBalanceKelvin: 5000 } },
  { key: "sport", label: "Sport", icon: <Timer className="w-4 h-4" />, proSettings: { exposureMode: "shutter-priority" as const, shutterSpeed: 1 / 500 } },
];

// Video modes
const VIDEO_MODES: Array<{ key: VideoMode; label: string; icon: React.ReactNode; description: string }> = [
  { key: "normal", label: "Normal", icon: <Video className="w-4 h-4" />, description: "Standard video" },
  { key: "slowmo", label: "Slow-Mo", icon: <Timer className="w-4 h-4" />, description: "120fps capture" },
  { key: "timelapse", label: "Timelapse", icon: <Timer className="w-4 h-4" />, description: "Time compressed" },
  { key: "cinematic", label: "Cinema", icon: <Video className="w-4 h-4" />, description: "24fps + blur" },
];

const DEFAULT_PRO_SETTINGS: ProCameraSettings = {
  exposureMode: "auto",
  iso: 100,
  shutterSpeed: 1 / 125,
  whiteBalanceMode: "auto",
  whiteBalanceKelvin: 5500,
  exposureCompensation: 0,
  focusMode: "continuous",
  focusDistance: 0,
  exposureLock: false,
  focusLock: false,
  whiteBalanceLock: false,
  hdrMode: false,
  nightMode: false,
  stabilizationMode: "standard",
  gridOverlay: "none",
  showHistogram: false,
  showFocusPeaking: false,
  showZebraStripes: false,
  zebraThreshold: 200,
  showLevel: false,
  touchAELock: false,
  touchAFPoint: null,
};

export function CameraCaptureSheet({
  open,
  onOpenChange,
  onSendFile,
  settingsScopeKey = "global",
}: CameraCaptureSheetProps) {
  const storageKey = useCallback(
    (suffix: string) => `chat_camera:${settingsScopeKey}:${suffix}`,
    [settingsScopeKey]
  );

  const cameraRef = useRef<CameraHostHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProPanel, setShowProPanel] = useState(false);
  const [showHistogram, setShowHistogram] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [histogramData, setHistogramData] = useState<Uint32Array | null>(null);

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
  const [capturePreset, setCapturePreset] = useState<CapturePreset>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_PRESET));
    return (CAPTURE_PRESETS.find((p) => p.key === saved)?.key ?? "auto") as CapturePreset;
  });
  const [videoMode, setVideoMode] = useState<VideoMode>(() => {
    const saved = localStorage.getItem(storageKey(STORAGE_KEY_VIDEOMODE));
    return (VIDEO_MODES.find((m) => m.key === saved)?.key ?? "normal") as VideoMode;
  });
  const [proSettings, setProSettings] = useState<ProCameraSettings>(() => {
    try {
      const saved = localStorage.getItem(storageKey(STORAGE_KEY_PRO_SETTINGS));
      if (saved) return { ...DEFAULT_PRO_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_PRO_SETTINGS };
  });
  const [captured, setCaptured] = useState<{ file: File; previewUrl: string; type: "image" | "video" } | null>(null);

  // AI Filters hook
  const {
    currentFilter,
    filterIntensity,
    cssFilter,
    filters,
    setFilter,
    setIntensity,
  } = useAIFilters();

  // Effect refs for callbacks
  const effectRef = useRef(effect);
  useEffect(() => { effectRef.current = effect; }, [effect]);

  // Sync Pro settings
  const handleProSettingsChange = useCallback((settings: Partial<ProCameraSettings>) => {
    setProSettings((prev) => {
      const next = { ...prev, ...settings };
      localStorage.setItem(storageKey(STORAGE_KEY_PRO_SETTINGS), JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  // Load pro settings from preset
  const applyPreset = useCallback((preset: CapturePreset) => {
    setCapturePreset(preset);
    localStorage.setItem(storageKey(STORAGE_KEY_PRESET), preset);
    const presetConfig = CAPTURE_PRESETS.find((p) => p.key === preset);
    if (presetConfig?.proSettings) {
      handleProSettingsChange(presetConfig.proSettings);
    }
  }, [storageKey, handleProSettingsChange]);

  // Reset to auto
  const resetToAuto = useCallback(() => {
    setCapturePreset("auto");
    localStorage.setItem(storageKey(STORAGE_KEY_PRESET), "auto");
    setProSettings(DEFAULT_PRO_SETTINGS);
    localStorage.setItem(storageKey(STORAGE_KEY_PRO_SETTINGS), JSON.stringify(DEFAULT_PRO_SETTINGS));
  }, [storageKey]);

  // Load pro settings on mount
  useEffect(() => {
    const presetConfig = CAPTURE_PRESETS.find((p) => p.key === capturePreset);
    if (presetConfig?.proSettings) {
      handleProSettingsChange(presetConfig.proSettings);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setShowSettings(false);
      setShowProPanel(false);
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
    localStorage.setItem(storageKey(STORAGE_KEY_VIDEOMODE), videoMode);
  }, [videoMode, storageKey]);

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

  // Sync pro settings with camera
  useEffect(() => {
    const host = cameraRef.current;
    if (!host || !ready) return;
    host.setProSettings(proSettings);
  }, [ready, proSettings]);

  // Histogram updates
  useEffect(() => {
    if (!showHistogram) return;
    const interval = setInterval(() => {
      const hist = cameraRef.current?.getHistogram?.();
      if (hist) setHistogramData(hist);
    }, 100);
    return () => clearInterval(interval);
  }, [showHistogram]);

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

  // Combined filter (effect + AI filter)
  const combinedFilter = useMemo(() => {
    const base = selectedFilter;
    if (effect !== "none" && cssFilter !== "none") {
      return `${base} ${cssFilter}`;
    }
    return cssFilter !== "none" ? cssFilter : base;
  }, [selectedFilter, effect, cssFilter]);

  const handleClose = () => {
    if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
    setCaptured(null);
    setRecording(false);
    setShowSettings(false);
    setShowProPanel(false);
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

  const toggleProPanel = () => {
    setShowProPanel((prev) => !prev);
  };

  const handleTouchFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cameraRef.current?.triggerTouchAEAF?.(x, y);
    handleProSettingsChange({
      touchAFPoint: { x: x / rect.width, y: y / rect.height }
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black">
      {/* Camera Feed */}
      <div className="absolute inset-0" onClick={handleTouchFocus}>
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
          onProSettingsChange={handleProSettingsChange}
          onHistogramUpdate={setHistogramData}
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

        {/* Captured preview */}
        {captured && (
          captured.type === "video" ? (
            <video src={captured.previewUrl} className="absolute inset-0 w-full h-full object-cover" controls playsInline />
          ) : (
            <img loading="lazy" src={captured.previewUrl} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
          )
        )}

        {/* Filter overlay */}
        {!captured && (
          <div className="absolute inset-0 pointer-events-none" style={{ filter: combinedFilter }} />
        )}

        {/* Grid Overlay */}
        {proSettings.gridOverlay !== "none" && !captured && (
          <GridOverlay type={proSettings.gridOverlay} />
        )}

        {/* Touch Focus Point */}
        {proSettings.touchAFPoint && !captured && (
          <div
            className="absolute w-16 h-16 border-2 border-yellow-400 pointer-events-none"
            style={{
              left: `${proSettings.touchAFPoint.x * 100}%`,
              top: `${proSettings.touchAFPoint.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="absolute inset-0 border-2 border-yellow-400 animate-pulse" />
          </div>
        )}

        {/* Level Indicator */}
        {proSettings.showLevel && !captured && (
          <div className="absolute top-20 right-4">
            <LevelIndicator className="opacity-70" />
          </div>
        )}

        {/* Histogram */}
        {showHistogram && histogramData && !captured && (
          <div className="absolute top-20 left-4">
            <ProHistogram histogramData={histogramData} width={160} height={80} />
          </div>
        )}

        {/* Zoom indicator */}
        {zoom > 1 && !captured && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
            {zoom.toFixed(1)}x
          </div>
        )}
      </div>

      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 pb-2 z-10">
        <button
          type="button"
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center"
          aria-label="Закрыть камеру"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Center: Capture Presets */}
        <div className="flex items-center gap-1 bg-black/45 rounded-full px-2 py-1">
          {CAPTURE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset.key)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all",
                capturePreset === preset.key
                  ? "bg-white text-black font-medium"
                  : "text-white/80 hover:text-white"
              )}
            >
              {preset.icon}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Pro Mode Toggle */}
          <button
            type="button"
            onClick={toggleProPanel}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              showProPanel ? "bg-cyan-500 text-white" : "bg-black/45 text-white"
            )}
            aria-label="Pro режим"
          >
            <Aperture className="w-5 h-5" />
          </button>

          {/* Histogram Toggle */}
          <button
            type="button"
            onClick={() => setShowHistogram((v) => !v)}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              showHistogram ? "bg-cyan-500 text-white" : "bg-black/45 text-white"
            )}
            aria-label="Гистограмма"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              showSettings ? "bg-cyan-500 text-white" : "bg-black/45 text-white"
            )}
            aria-label="Настройки камеры"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pro Controls Panel */}
      {showProPanel && (
        <div className="absolute top-20 left-4 right-4 z-30 max-w-md mx-auto">
          <ProControlsPanel
            settings={proSettings}
            onSettingsChange={handleProSettingsChange}
            onClose={() => setShowProPanel(false)}
            videoMode={captureKind === "video" ? videoMode : undefined}
          />
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && !showProPanel && (
        <div className="absolute top-16 right-4 z-20 w-72 rounded-xl border border-white/15 bg-black/75 backdrop-blur p-3 space-y-3">
          <p className="text-xs text-white/70">Настройки</p>

          {/* Camera switch */}
          <button
            type="button"
            onClick={toggleFacing}
            disabled={recording}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-white/10 text-white text-sm"
          >
            <span>Камера</span>
            <span>{facingMode === "user" ? "Фронтальная" : "Основная"}</span>
          </button>

          {/* Flash */}
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

          {/* Zoom */}
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

          {/* Video Quality */}
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

          {/* Video Mode */}
          {captureKind === "video" && (
            <div className="space-y-2">
              <p className="text-xs text-white/60">Режим видео</p>
              <div className="grid grid-cols-2 gap-2">
                {VIDEO_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setVideoMode(m.key)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs flex items-center gap-1",
                      videoMode === m.key ? "bg-cyan-500 text-white" : "bg-white/10 text-white/80"
                    )}
                  >
                    {m.icon}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="space-y-2">
            <p className="text-xs text-white/60">Фильтры</p>
            <div className="grid grid-cols-5 gap-1">
              {EFFECTS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setEffect(entry.key)}
                  className={cn(
                    "rounded-md px-1 py-1 text-xs",
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

      {/* Bottom Controls */}
      <div className="absolute bottom-6 left-0 right-0 z-10">
        {captured ? (
          /* Preview mode */
          <div className="flex items-center justify-center gap-5 px-4">
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
          </div>
        ) : (
          /* Capture mode */
          <div className="flex flex-col items-center gap-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCaptureKind("photo")}
                className={cn(
                  "px-4 h-9 rounded-full text-sm font-medium transition-colors",
                  captureKind === "photo" ? "bg-white text-black" : "bg-black/45 text-white"
                )}
              >
                Фото
              </button>
              <button
                type="button"
                onClick={() => setCaptureKind("video")}
                className={cn(
                  "px-4 h-9 rounded-full text-sm font-medium transition-colors",
                  captureKind === "video" ? "bg-white text-black" : "bg-black/45 text-white"
                )}
              >
                Видео
              </button>
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-center gap-8 w-full px-4">
              {/* Camera flip */}
              <button
                type="button"
                onClick={toggleFacing}
                className="w-12 h-12 rounded-full bg-black/45 text-white flex items-center justify-center"
                aria-label="Сменить камеру"
                disabled={recording}
              >
                <FlipHorizontal className="w-6 h-6" />
              </button>

              {/* Capture button */}
              <button
                type="button"
                onClick={handleCapture}
                disabled={!canCapture}
                className={cn(
                  "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all disabled:opacity-50",
                  captureKind === "video" && recording
                    ? "bg-red-500/80 scale-90"
                    : "bg-white/20 hover:scale-105 active:scale-95"
                )}
                aria-label={captureKind === "video" ? (recording ? "Остановить запись" : "Начать запись") : "Сделать фото"}
              >
                {captureKind === "video" ? (
                  <div className="w-8 h-8 bg-red-500 rounded-md" />
                ) : (
                  <div className="w-10 h-10 bg-white rounded-full" />
                )}
              </button>

              {/* Flash toggle (photo only) */}
              <button
                type="button"
                onClick={toggleFlash}
                disabled={!torchSupported || captureKind === "video"}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  torchSupported && flashEnabled
                    ? "bg-yellow-500 text-black"
                    : "bg-black/45 text-white",
                  (!torchSupported || captureKind === "video") && "opacity-40"
                )}
                aria-label="Вспышка"
              >
                {flashEnabled ? <Zap className="w-6 h-6" /> : <ZapOff className="w-6 h-6" />}
              </button>
            </div>

            {/* Recording indicator */}
            {captureKind === "video" && recording && (
              <div className="flex items-center gap-2 bg-red-500/80 rounded-full px-4 py-1">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white text-sm">Идёт запись...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Grid Overlay Component
function GridOverlay({ type }: { type: ProCameraSettings["gridOverlay"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;

    const w = canvas.width;
    const h = canvas.height;

    if (type === "rule-of-thirds") {
      ctx.beginPath();
      ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
      ctx.moveTo(2 * w / 3, 0); ctx.lineTo(2 * w / 3, h);
      ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
      ctx.moveTo(0, 2 * h / 3); ctx.lineTo(w, 2 * h / 3);
      ctx.stroke();
    } else if (type === "golden-ratio") {
      const phi = 1.618;
      ctx.beginPath();
      ctx.moveTo(w / phi, 0); ctx.lineTo(w / phi, h);
      ctx.moveTo(w - w / phi, 0); ctx.lineTo(w - w / phi, h);
      ctx.moveTo(0, h / phi); ctx.lineTo(w, h / phi);
      ctx.moveTo(0, h - h / phi); ctx.lineTo(w, h - h / phi);
      ctx.stroke();
    } else if (type === "diagonal") {
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(w, h);
      ctx.moveTo(w, 0); ctx.lineTo(0, h);
      ctx.stroke();
    } else if (type === "square") {
      const size = Math.min(w, h) * 0.8;
      const x = (w - size) / 2;
      const y = (h - size) / 2;
      ctx.strokeRect(x, y, size, size);
    }
  }, [type]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
