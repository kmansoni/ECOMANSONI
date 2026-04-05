/**
 * GroupVideoCallScreen — полноценный UI групповых видеозвонков уровня Telegram.
 *
 * Адаптивный грид:
 *  1  участник → fullscreen
 *  2  → split вертикально
 *  3-4 → 2×2
 *  5-6 → 2×3
 *  7+  → grid с фокусом на активном/прикреплённом спикере
 *
 * Безопасность:
 *  - Кнопка "Добавить" вызывает GroupCallInviteSheet — сервер проверяет членство
 *  - PiP fallback к собственному overlay если Browser PiP API недоступен
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Hand,
  PhoneOff,
  UserPlus,
  Maximize2,
  PictureInPicture2,
  Users,
  Pin,
  PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import type { Participant } from "@/hooks/useGroupVideoCall";
import { GroupCallInviteSheet } from "./GroupCallInviteSheet";
import { CallReactionOverlay, ReactionPicker, type CallReaction } from "./CallReactionOverlay";
import { Smile } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  groupName: string;
  groupId: string;
  participants: Participant[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  activeSpeakerId: string | null;
  pinnedParticipantId: string | null;
  duration: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onRaiseHand: () => void;
  onLeaveCall: () => void;
  onPinParticipant: (id: string | null) => void;
  onAddParticipant: (userId: string) => void;
  onReaction?: (emoji: string) => void;
  incomingReactions?: CallReaction[];
  currentUserId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Вычислить CSS grid layout в зависимости от числа участников */
function getGridLayout(count: number, hasPinned: boolean): string {
  if (hasPinned) return "grid-cols-1"; // pinned → featured + sidebar
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-3";
  return "grid-cols-4";
}

// ---------------------------------------------------------------------------
// ParticipantTile
// ---------------------------------------------------------------------------

interface TileProps {
  participant: Participant;
  isPinned: boolean;
  isActiveSpeaker: boolean;
  isFeatured: boolean;
  onPin: (id: string) => void;
}

function ParticipantTile({ participant, isPinned, isActiveSpeaker, isFeatured, onPin }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !participant.stream) return;
    el.srcObject = participant.stream;
    el.play().catch(() => {/* autoplay policy — user gesture required */});
    return () => {
      el.srcObject = null;
    };
  }, [participant.stream]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl overflow-hidden bg-zinc-800 select-none",
        isFeatured ? "col-span-2 row-span-2 min-h-[300px]" : "min-h-[120px]",
        isActiveSpeaker && "ring-2 ring-green-500 ring-offset-1 ring-offset-zinc-900",
      )}
    >
      {/* Video */}
      {participant.stream && !participant.isCameraOff ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted={participant.id === "local"}
          autoPlay
          playsInline
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
            <GradientAvatar
              seed={participant.id}
              name={participant.displayName}
              avatarUrl={participant.avatarUrl}
              size={isFeatured ? "lg" : "md"}
            />
          </div>
      )}

      {/* Overlay: имя + индикаторы */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        {isActiveSpeaker && (
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
        )}
        <span className="text-white text-xs font-medium truncate">{participant.displayName}</span>
        {participant.isMuted && <MicOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
        {participant.isHandRaised && <span className="text-sm flex-shrink-0">🖐</span>}
        {participant.isScreenSharing && <Monitor className="w-3 h-3 text-blue-400 flex-shrink-0" />}
      </div>

      {/* Pin button  */}
      <button
        onClick={() => onPin(participant.id)}
        className="absolute top-2 right-2 p-1 rounded-full bg-black/40 text-white opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity"
        aria-label={isPinned ? "Открепить" : "Закрепить"}
      >
        {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocalTile
// ---------------------------------------------------------------------------

function LocalTile({
  localStream,
  isMuted,
  isCameraOn,
  isScreenSharing,
  currentUserId,
  isActiveSpeaker,
}: {
  localStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  currentUserId: string;
  isActiveSpeaker: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    el.play().catch(() => { /* autoplay blocked */ });
    return () => { el.srcObject = null; };
  }, [localStream]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl overflow-hidden bg-zinc-800 min-h-[120px]",
        isActiveSpeaker && "ring-2 ring-green-500 ring-offset-1 ring-offset-zinc-900",
      )}
    >
      {localStream && isCameraOn ? (
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted autoPlay playsInline />
      ) : (
        <GradientAvatar seed={currentUserId} name="Вы" avatarUrl={null} size="md" />
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        {isActiveSpeaker && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
        <span className="text-white text-xs font-medium">Вы</span>
        {isMuted && <MicOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
        {isScreenSharing && <Monitor className="w-3 h-3 text-blue-400 flex-shrink-0" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GroupVideoCallScreen({
  groupName,
  groupId,
  participants,
  localStream,
  screenStream,
  isMuted,
  isCameraOn,
  isScreenSharing,
  isHandRaised,
  activeSpeakerId,
  pinnedParticipantId,
  duration,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onRaiseHand,
  onLeaveCall,
  onPinParticipant,
  onAddParticipant,
  onReaction,
  incomingReactions,
  currentUserId,
}: Props) {
  const [showInvite, setShowInvite] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [liveReactions, setLiveReactions] = useState<CallReaction[]>([]);

  // мержим входящие реакции с локальными
  useEffect(() => {
    if (!incomingReactions?.length) return;
    setLiveReactions(prev => {
      const ids = new Set(prev.map(r => r.id));
      const fresh = incomingReactions.filter(r => !ids.has(r.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [incomingReactions]);

  const handleReactionExpired = useCallback((id: string) => {
    setLiveReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleSendReaction = useCallback((emoji: string) => {
    onReaction?.(emoji);
  }, [onReaction]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls после 3 секунд бездействия
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, [resetHideTimer]);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => { /* fullscreen not available */ });
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => { /* fullscreen not available */ });
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Picture-in-Picture через Browser PiP API (video element)
  // Применяем к первому видео источнику
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const togglePiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      // Найти первый <video> с активным потоком
      const videos = containerRef.current?.querySelectorAll("video");
      const activeVideo = videos && Array.from(videos).find(v => v.srcObject);
      if (activeVideo) {
        await activeVideo.requestPictureInPicture();
      }
    } catch (_) {
      // PiP недоступен в браузере — игнорируем
    }
  }, []);

  // Screen share stream → отдельный tile
  const screenShareTile = isScreenSharing && screenStream ? (
    <div className="relative col-span-full rounded-xl overflow-hidden bg-zinc-900 aspect-video">
      <video
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted
        ref={(el) => { if (el) el.srcObject = screenStream; }}
      />
      <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-0.5 rounded">
        Демонстрация экрана
      </div>
    </div>
  ) : null;

  // Pinned participant logic
  const pinnedParticipant = pinnedParticipantId
    ? participants.find(p => p.id === pinnedParticipantId) ?? null
    : null;

  const otherParticipants = pinnedParticipant
    ? participants.filter(p => p.id !== pinnedParticipantId)
    : participants;

  const allCount = participants.length + 1; // +1 local
  const gridClass = getGridLayout(allCount, !!pinnedParticipant);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-zinc-900 flex flex-col"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3",
          "bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm">{groupName}</span>
          <span className="text-zinc-400 text-xs flex items-center gap-1">
            <Users className="w-3 h-3" />
            {participants.length + 1} участников · {formatDuration(duration)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePiP}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Picture-in-Picture"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Полный экран"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Video grid ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-2 flex flex-col gap-2">
        {screenShareTile}

        {pinnedParticipant ? (
          // Featured layout: большой тайл + sidebar
          <div className="flex-1 flex gap-2 min-h-0">
            <div className="flex-1">
              <ParticipantTile
                participant={pinnedParticipant}
                isPinned
                isActiveSpeaker={activeSpeakerId === pinnedParticipant.id}
                isFeatured
                onPin={(id) => onPinParticipant(id === pinnedParticipantId ? null : id)}
              />
            </div>
            <div className="w-32 flex flex-col gap-2 overflow-y-auto">
              <LocalTile
                localStream={localStream}
                isMuted={isMuted}
                isCameraOn={isCameraOn}
                isScreenSharing={isScreenSharing}
                currentUserId={currentUserId}
                isActiveSpeaker={activeSpeakerId === currentUserId}
              />
              {otherParticipants.map(p => (
                <ParticipantTile
                  key={p.id}
                  participant={p}
                  isPinned={false}
                  isActiveSpeaker={activeSpeakerId === p.id}
                  isFeatured={false}
                  onPin={(id) => onPinParticipant(id)}
                />
              ))}
            </div>
          </div>
        ) : (
          // Adaptive grid layout
          <div className={cn("flex-1 grid gap-2 auto-rows-fr", gridClass)}>
            <LocalTile
              localStream={localStream}
              isMuted={isMuted}
              isCameraOn={isCameraOn}
              isScreenSharing={isScreenSharing}
              currentUserId={currentUserId}
              isActiveSpeaker={activeSpeakerId === currentUserId}
            />
            {participants.map(p => (
              <ParticipantTile
                key={p.id}
                participant={p}
                isPinned={p.id === pinnedParticipantId}
                isActiveSpeaker={activeSpeakerId === p.id}
                isFeatured={false}
                onPin={(id) => onPinParticipant(id === pinnedParticipantId ? null : id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom controls ───────────────────────────────────────── */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-3 px-4 py-5",
          "bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* Мьют */}
        <ControlButton
          onClick={onToggleMute}
          active={!isMuted}
          icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          label={isMuted ? "Включить микрофон" : "Выключить микрофон"}
          danger={isMuted}
        />

        {/* Камера */}
        <ControlButton
          onClick={onToggleCamera}
          active={isCameraOn}
          icon={isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          label={isCameraOn ? "Выключить камеру" : "Включить камеру"}
          danger={!isCameraOn}
        />

        {/* Демонстрация экрана */}
        <ControlButton
          onClick={onToggleScreenShare}
          active={isScreenSharing}
          icon={<Monitor className="w-5 h-5" />}
          label={isScreenSharing ? "Остановить демонстрацию" : "Демонстрация экрана"}
          accent={isScreenSharing}
        />

        {/* Поднять руку */}
        <ControlButton
          onClick={onRaiseHand}
          active={isHandRaised}
          icon={<Hand className="w-5 h-5" />}
          label={isHandRaised ? "Опустить руку" : "Поднять руку"}
          accent={isHandRaised}
        />

        {/* Реакции */}
        {onReaction && (
          <div className="relative">
            {showReactionPicker && (
              <ReactionPicker
                onSelect={handleSendReaction}
                onClose={() => setShowReactionPicker(false)}
              />
            )}
            <ControlButton
              onClick={() => setShowReactionPicker(v => !v)}
              active={showReactionPicker}
              icon={<Smile className="w-5 h-5" />}
              label="Реакция"
            />
          </div>
        )}

        {/* Завершить */}
        <button
          onClick={onLeaveCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg"
          title="Завершить звонок"
          aria-label="Завершить звонок"
        >
          <PhoneOff className="w-5 h-5" />
        </button>

        {/* Добавить участника */}
        <ControlButton
          onClick={() => setShowInvite(true)}
          active={false}
          icon={<UserPlus className="w-5 h-5" />}
          label="Добавить участника"
        />
      </div>

      {/* ── Reaction overlay ──────────────────────────────────────── */}
      <CallReactionOverlay reactions={liveReactions} onExpired={handleReactionExpired} />

      {/* ── Invite sheet ──────────────────────────────────────────── */}
      {showInvite && (
        <GroupCallInviteSheet
          groupId={groupId}
          currentParticipantIds={[currentUserId, ...participants.map(p => p.id)]}
          onInvite={onAddParticipant}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ControlButton util
// ---------------------------------------------------------------------------

function ControlButton({
  onClick,
  active,
  icon,
  label,
  danger = false,
  accent = false,
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "p-3.5 rounded-full transition-colors shadow",
        danger
          ? "bg-red-600/80 hover:bg-red-600 text-white"
          : accent
          ? "bg-blue-600/80 hover:bg-blue-600 text-white"
          : active
          ? "bg-white/20 hover:bg-white/30 text-white"
          : "bg-white/10 hover:bg-white/20 text-zinc-400",
      )}
    >
      {icon}
    </button>
  );
}
