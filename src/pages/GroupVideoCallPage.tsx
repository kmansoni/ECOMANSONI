/**
 * GroupVideoCallPage — страница группового видеозвонка.
 * Читает roomId из URL, инициализирует useGroupVideoCall, рендерит GroupVideoCallScreen.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useGroupVideoCall } from "@/hooks/useGroupVideoCall";
import { GroupVideoCallScreen } from "@/components/chat/GroupVideoCallScreen";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { Button } from "@/components/ui/button";
import { PhoneOff } from "lucide-react";

export function GroupVideoCallPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const groupCall = useGroupVideoCall(roomId ?? "");
  const {
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
    joinCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    raiseHand,
    pinParticipant,
    addParticipant,
    error,
    isJoined,
    isJoining,
  } = groupCall;

  if (!roomId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900">
        <div className="text-center">
          <p className="text-white/60 mb-4">Не указан ID комнаты звонка</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Назад
          </Button>
        </div>
      </div>
    );
  }

  if (error && !isJoined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Назад
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GroupVideoCallScreen
      groupName="Групповой звонок"
      groupId={roomId}
      participants={participants}
      localStream={localStream}
      screenStream={screenStream}
      isMuted={isMuted}
      isCameraOn={isCameraOn}
      isScreenSharing={isScreenSharing}
      isHandRaised={isHandRaised}
      activeSpeakerId={activeSpeakerId}
      pinnedParticipantId={pinnedParticipantId}
      duration={duration}
      currentUserId=""
      onToggleMute={toggleMute}
      onToggleCamera={toggleCamera}
      onToggleScreenShare={toggleScreenShare}
      onRaiseHand={raiseHand}
      onLeaveCall={leaveCall}
      onPinParticipant={pinParticipant}
      onAddParticipant={addParticipant}
    />
  );
}