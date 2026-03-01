/**
 * CreateSurfacePage — Instagram-grade Unified Create Surface
 *
 * Архитектура:
 * - Использует существующий CameraHost (production-grade, с debug, с CaptureMode)
 * - ONE CameraHost instance — камера НЕ перезапускается при смене режима
 * - Переворот камеры: key={facing} → CameraHost ремаунтится с новым facingMode
 * - FSM: initializing → ready → recording → preview → publishing → error
 *
 * Режимы: stream | post | reel | live
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Volume2,
  VolumeX,
  Settings,
  RotateCcw,
  Type,
  Sparkles,
  LayoutGrid,
  Music,
  Wand2,
  Image as ImageIcon,
  Share2,
  Loader2,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { toast } from "sonner";
import {
  CameraHost,
  type CameraHostHandle,
  type CaptureMode,
  type FacingMode,
} from "@/components/camera/CameraHost";

// ─── Типы ────────────────────────────────────────────────────────────────────

type ModeId = "stream" | "post" | "reel" | "live";
type ScreenState =
  | "initializing"
  | "ready"
  | "recording"
  | "preview"
  | "publishing"
  | "error";
type ToolId = "text" | "effects" | "layout" | "audio" | "filters";

// CaptureMode для CameraHost: "story" (короткие) | "reel" (длинные)
// Маппинг наших режимов в CaptureMode CameraHost
const modeToCaptureMode: Record<ModeId, CaptureMode> = {
  stream: "story",
  post: "story",
  reel: "reel",
  live: "story",
};

// ─── Профили режимов ──────────────────────────────────────────────────────────

interface ModeProfile {
  id: ModeId;
  label: string;
  aspect: "9/16" | "1/1";
  captureType: "video" | "photo" | "live";
  tools: ToolId[];
}

const MODES: ModeProfile[] = [
  {
    id: "stream",
    label: "СТРИМ",
    aspect: "9/16",
    captureType: "video",
    tools: ["text", "effects", "filters"],
  },
  {
    id: "post",
    label: "ПОСТ",
    aspect: "1/1",
    captureType: "photo",
    tools: ["text", "layout", "filters"],
  },
  {
    id: "reel",
    label: "РИЛС",
    aspect: "9/16",
    captureType: "video",
    tools: ["text", "effects", "audio", "filters"],
  },
  {
    id: "live",
    label: "ЭФИР",
    aspect: "9/16",
    captureType: "live",
    tools: ["text"],
  },
];

// ─── Вспомогательные компоненты ───────────────────────────────────────────────

function ToolIcon({ id }: { id: ToolId }) {
  if (id === "text") return <Type className="w-5 h-5" />;
  if (id === "effects") return <Sparkles className="w-5 h-5" />;
  if (id === "layout") return <LayoutGrid className="w-5 h-5" />;
  if (id === "audio") return <Music className="w-5 h-5" />;
  return <Wand2 className="w-5 h-5" />;
}

function SideToolButton({ id, onClick }: { id: ToolId; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={id}
      className={cn(
        "w-11 h-11 rounded-2xl flex items-center justify-center",
        "bg-black/30 backdrop-blur-sm border border-white/10",
        "text-white active:scale-95 transition-transform",
      )}
    >
      <ToolIcon id={id} />
    </button>
  );
}

function TopBarButton({
  children,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "w-11 h-11 rounded-full flex items-center justify-center",
        "bg-black/30 backdrop-blur-sm border border-white/10",
        "text-white active:scale-95 transition-transform",
      )}
    >
      {children}
    </button>
  );
}

interface PreviewMediaProps {
  url: string;
  type: "image" | "video";
}

function PreviewMedia({ url, type }: PreviewMediaProps) {
  if (type === "image") {
    return (
      <img
        src={url}
        alt="preview"
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return (
    <video
      src={url}
      className="absolute inset-0 w-full h-full object-cover"
      autoPlay
      loop
      playsInline
      controls
    />
  );
}

// ─── Кнопка затвора ────────────────────────────────────────────────────────────

interface ShutterButtonProps {
  captureType: ModeProfile["captureType"];
  isRecording: boolean;
  isReady: boolean;
  onPress: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

function ShutterButton({
  captureType,
  isRecording,
  isReady,
  onPress,
  onMouseDown,
  onMouseUp,
}: ShutterButtonProps) {
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    onMouseDown();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onMouseUp();
  };

  return (
    <button
      onClick={onPress}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={!isReady && !isRecording}
      aria-label="Затвор"
      className={cn(
        "relative w-[82px] h-[82px] rounded-full flex items-center justify-center",
        "transition-transform active:scale-95",
        isReady || isRecording ? "cursor-pointer" : "cursor-default opacity-50",
      )}
    >
      {/* Внешнее кольцо */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border-[3.5px] transition-colors duration-200",
          isRecording
            ? "border-red-400"
            : captureType === "live"
            ? "border-red-400"
            : "border-white",
        )}
      />
      {/* Внутреннее заполнение */}
      <div
        className={cn(
          "rounded-full transition-all duration-200",
          isRecording
            ? "w-[38px] h-[38px] bg-red-500 rounded-lg"
            : captureType === "live"
            ? "w-[64px] h-[64px] bg-red-500 flex items-center justify-center"
            : "w-[64px] h-[64px] bg-white",
        )}
      >
        {captureType === "live" && <Radio className="w-7 h-7 text-white" />}
      </div>
    </button>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export function CreateSurfacePage() {
  const navigate = useNavigate();
  const { setIsCreatingContent } = useChatOpen();

  // ── Режим ────────────────────────────────────────────────────────────────────
  const [modeId, setModeId] = useState<ModeId>("post");
  const profile = useMemo(() => MODES.find((m) => m.id === modeId)!, [modeId]);
  const captureMode = useMemo(() => modeToCaptureMode[modeId], [modeId]);

  // ── FSM состояния ─────────────────────────────────────────────────────────────
  const [screenState, setScreenState] = useState<ScreenState>("initializing");

  // ── Превью ────────────────────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video">("video");

  // ── Управление камерой ────────────────────────────────────────────────────────
  const cameraHostRef = useRef<CameraHostHandle | null>(null);
  const capturedFileRef = useRef<File | null>(null);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [cameraKey, setCameraKey] = useState(0);
  const [muted, setMuted] = useState(false);

  // ── Таймер записи ─────────────────────────────────────────────────────────────
  const [recordSec, setRecordSec] = useState(0);
  const tickRef = useRef<number | null>(null);
  const recordStartRef = useRef<number | null>(null);

  const modeStripRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Скрыть нижний nav пока открыта create surface
  useEffect(() => {
    setIsCreatingContent(true);
    return () => setIsCreatingContent(false);
  }, [setIsCreatingContent]);

  // Прокрутить mode selector к активной вкладке при монтировании
  useEffect(() => {
    scrollToMode(modeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Очистка previewUrl при размонтировании компонента — предотвращение утечки памяти
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Таймер записи ─────────────────────────────────────────────────────────────

  const stopTick = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    recordStartRef.current = null;
    setRecordSec(0);
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    recordStartRef.current = Date.now();
    tickRef.current = window.setInterval(() => {
      const start = recordStartRef.current;
      if (!start) return;
      setRecordSec(Math.floor((Date.now() - start) / 1000));
    }, 200);
  }, [stopTick]);

  // ── Колбэки CameraHost ────────────────────────────────────────────────────────

  const onReadyChange = useCallback((ready: boolean) => {
    setScreenState((prev) => {
      // Не перезаписывать состояние recording/preview/publishing
      if (prev === "recording" || prev === "preview" || prev === "publishing") return prev;
      return ready ? "ready" : "initializing";
    });
  }, []);

  const onRecordingChange = useCallback(
    (recording: boolean) => {
      if (recording) {
        setScreenState("recording");
        startTick();
      } else {
        stopTick();
        // Если не перешли в preview — возвращаемся в ready
        setScreenState((prev) => (prev === "recording" ? "ready" : prev));
      }
    },
    [startTick, stopTick],
  );

  const onPhotoCaptured = useCallback((file: File, previewUrl: string) => {
    capturedFileRef.current = file;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    setPreviewType("image");
    setScreenState("preview");
  }, []);

  const onVideoRecorded = useCallback((file: File, videoPreviewUrl: string) => {
    capturedFileRef.current = file;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return videoPreviewUrl;
    });
    setPreviewType("video");
    stopTick();
    setScreenState("preview");
  }, [stopTick]);

  const onCameraError = useCallback((error: unknown) => {
    console.error("CameraHost error:", error);
    setScreenState("error");
    toast.error("Ошибка камеры: " + (error instanceof Error ? error.message : "нет доступа"));
  }, []);

  // ── Затвор ────────────────────────────────────────────────────────────────────

  const onShutterPress = useCallback(async () => {
    // Видео-запись обрабатывается только через onMouseDown/onTouchStart,
    // чтобы не вызывать recordVideo() дважды (onClick + onMouseDown).
    if (profile.captureType === "photo") {
      await cameraHostRef.current?.capturePhoto();
      return;
    }
    if (profile.captureType === "live") {
      toast.info("LIVE: WebRTC signaling/SFU — отдельный модуль");
    }
  }, [profile.captureType]);

  const onShutterMouseDown = useCallback(async () => {
    if (profile.captureType !== "video") return;
    if (screenState === "ready") {
      await cameraHostRef.current?.recordVideo();
    }
  }, [profile.captureType, screenState]);

  const onShutterMouseUp = useCallback(() => {
    // CameraHost auto-stops по maxDurationMs через recorderTimerRef
    // Для ручной остановки по release — нет прямого API в CameraHost
    // Используется onPress для toggle
  }, []);

  // ── Смена режима ──────────────────────────────────────────────────────────────

  const switchMode = useCallback(
    (next: ModeId) => {
      if (screenState === "recording") {
        toast.warning("Завершите запись перед сменой режима");
        return;
      }
      setModeId(next);
      scrollToMode(next);
    },
    [screenState],
  );

  function scrollToMode(id: ModeId) {
    const strip = modeStripRef.current;
    if (!strip) return;
    const idx = MODES.findIndex((m) => m.id === id);
    strip
      .querySelector<HTMLButtonElement>(`[data-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  // ── Превью ────────────────────────────────────────────────────────────────────

  const discardPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setScreenState("ready");
  }, []);

  const publish = useCallback(async () => {
    // Заглушка — проверка окружения для предотвращения случайного деплоя
    if (import.meta.env.PROD) {
      console.error("Publish not implemented - this is a stub");
      toast.error("Публикация временно недоступна");
      return;
    }
    const file = capturedFileRef.current;
    if (!file) {
      toast.error("Нет захваченного файла для публикации");
      return;
    }
    setScreenState("publishing");
    // TODO: интегрировать с /cmd/create/publish + signed URL upload
    // Здесь передать file в реальный upload-сервис
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    capturedFileRef.current = null;
    toast.success(`Опубликовано как ${profile.label}`);
    discardPreview();
  }, [profile.label, discardPreview]);

  // ── Галерея ───────────────────────────────────────────────────────────────────

  const onGalleryPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setPreviewType(file.type.startsWith("video/") ? "video" : "image");
    setScreenState("preview");
    e.currentTarget.value = "";
  }, []);

  // ── Вычисляемые значения ──────────────────────────────────────────────────────

  const isPreview = screenState === "preview" || screenState === "publishing";
  const isReady = screenState === "ready";
  const isRecording = screenState === "recording";
  const maxDurationSec =
    captureMode === "reel" ? 90 : captureMode === "story" ? 15 : undefined;

  // CameraHost нужен isActive=true всегда, кроме preview/error
  const cameraActive = !isPreview && screenState !== "error";

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: "none" }}
    >
      {/* Скрытый input для галереи */}
      <input
        ref={galleryInputRef}
        type="file"
        accept={profile.captureType === "video" ? "video/*" : "image/*,video/*"}
        className="hidden"
        onChange={onGalleryPick}
      />

      {/* ── Область камеры ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative bg-black overflow-hidden",
          profile.aspect === "1/1" ? "aspect-square max-h-[65vh] mx-auto w-full" : "flex-1",
        )}
      >
        {/* CameraHost — производственная камера с debug, profileMode, capturePhoto/recordVideo.
            key={facing} обеспечивает ремаунт при переключении камеры. */}
        <CameraHost
          key={`${facing}-${cameraKey}`}
          ref={cameraHostRef}
          isActive={cameraActive}
          mode={captureMode}
          facingMode={facing}
          className={cn(
            "absolute inset-0 w-full h-full",
            isPreview ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
          videoClassName="w-full h-full object-cover"
          onReadyChange={onReadyChange}
          onRecordingChange={onRecordingChange}
          onPhotoCaptured={onPhotoCaptured}
          onVideoRecorded={onVideoRecorded}
          onError={onCameraError}
        />

        {/* Превью медиа */}
        {isPreview && previewUrl && (
          <PreviewMedia url={previewUrl} type={previewType} />
        )}

        {/* Spinner инициализации */}
        {screenState === "initializing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}

        {/* Состояние ошибки */}
        {screenState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center">
            <p className="text-white font-semibold text-lg">Нет доступа к камере</p>
            <p className="text-white/70 text-sm">Разрешите доступ в настройках браузера</p>
            <button
              onClick={() => {
                setScreenState("initializing");
                setCameraKey((k) => k + 1);
              }}
              className="px-6 py-2.5 rounded-full bg-white text-black font-semibold text-sm"
            >
              Повторить
            </button>
          </div>
        )}

        {/* ── Top bar (не в превью) */}
        {!isPreview && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-3">
            <TopBarButton onClick={() => navigate(-1)} aria-label="Закрыть">
              <X className="w-5 h-5" />
            </TopBarButton>
            <TopBarButton
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Включить звук" : "Выключить звук"}
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </TopBarButton>
            <TopBarButton onClick={() => toast.info("Настройки камеры")} aria-label="Настройки">
              <Settings className="w-5 h-5" />
            </TopBarButton>
          </div>
        )}

        {/* ── Top bar (в превью) */}
        {isPreview && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-3 z-10">
            <TopBarButton onClick={discardPreview} aria-label="Назад">
              <X className="w-5 h-5" />
            </TopBarButton>
            <button
              onClick={publish}
              disabled={screenState === "publishing"}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold",
                "bg-white text-black active:scale-95 transition-transform",
                screenState === "publishing" && "opacity-60",
              )}
            >
              {screenState === "publishing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Публикация...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Опубликовать
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Side tools */}
        {!isPreview && (isReady || isRecording) && (
          <div className="absolute left-3 top-[100px] flex flex-col gap-3">
            {profile.tools.map((tool) => (
              <SideToolButton key={tool} id={tool} onClick={() => toast.info(tool)} />
            ))}
          </div>
        )}

        {/* ── Recording HUD */}
        {isRecording && (
          <div className="absolute top-[90px] left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-bold tabular-nums text-sm">
              {String(Math.floor(recordSec / 60)).padStart(2, "0")}:
              {String(recordSec % 60).padStart(2, "0")}
              {maxDurationSec != null && (
                <span className="opacity-50 font-normal">
                  {" "}
                  / {String(Math.floor(maxDurationSec / 60)).padStart(2, "0")}:
                  {String(maxDurationSec % 60).padStart(2, "0")}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom controls */}
      {!isPreview && screenState !== "error" && (
        <div className="flex items-center justify-center gap-7 px-6 py-5">
          {/* Галерея */}
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 overflow-hidden flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Галерея"
          >
            <ImageIcon className="w-6 h-6 text-white/80" />
          </button>

          {/* Затвор */}
          <ShutterButton
            captureType={profile.captureType}
            isRecording={isRecording}
            isReady={isReady}
            onPress={onShutterPress}
            onMouseDown={onShutterMouseDown}
            onMouseUp={onShutterMouseUp}
          />

          {/* Переворот камеры */}
          <button
            onClick={() => {
              if (isRecording) return;
              setFacing((f) => (f === "environment" ? "user" : "environment"));
            }}
            className="w-14 h-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Переворот камеры"
          >
            <RotateCcw className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      {/* ── Mode selector */}
      {!isPreview && (
        <div
          className="pb-6"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}
        >
          <div
            ref={modeStripRef}
            className="flex items-center gap-5 overflow-x-auto px-6 py-1 scrollbar-none"
            style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}
          >
            {MODES.map((m, idx) => (
              <button
                key={m.id}
                data-idx={idx}
                onClick={() => switchMode(m.id)}
                style={{ scrollSnapAlign: "center" }}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center text-[13px] font-bold tracking-wider py-2 px-1 transition-all",
                  m.id === modeId ? "text-white" : "text-white/40 hover:text-white/70",
                )}
              >
                <span className="flex items-center gap-1">
                  {m.id === "live" && (
                    <Radio className="w-3 h-3 text-red-400" />
                  )}
                  {m.label}
                </span>
                {m.id === modeId && (
                  <div className="mt-1 h-0.5 bg-white rounded-full w-4" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateSurfacePage;
