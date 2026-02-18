import { Phone, PhoneOff, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCall } from "@/contexts/VideoCallContext";

interface IncomingVideoCallSheetProps {
  call: VideoCall;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingVideoCallSheet({ call, onAccept, onDecline }: IncomingVideoCallSheetProps) {
  const callerName = call.caller_profile?.display_name || "Неизвестный";
  const callerAvatar = call.caller_profile?.avatar_url;
  const isVideoCall = call.call_type === "video";

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-primary/90 to-primary z-[100] flex flex-col items-center justify-between py-16 safe-area-inset">
      {/* Call type indicator */}
      <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
        {isVideoCall ? (
          <Video className="w-5 h-5 text-white" />
        ) : (
          <Phone className="w-5 h-5 text-white" />
        )}
        <span className="text-white font-medium">
          {isVideoCall ? "Видеозвонок" : "Аудиозвонок"}
        </span>
      </div>

      {/* Caller info */}
      <div className="flex flex-col items-center gap-4">
        {/* Avatar with pulse animation */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/30 rounded-full animate-ping" />
          <div className="absolute inset-[-8px] bg-white/20 rounded-full animate-pulse" />
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/50 relative z-10">
            {callerAvatar ? (
              <img
                src={callerAvatar}
                alt={callerName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-white/30 flex items-center justify-center">
                <span className="text-4xl text-white font-bold">
                  {callerName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{callerName}</h2>
          <p className="text-white/80 mt-1">Входящий звонок...</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-12">
        {/* Decline */}
        <div className="flex flex-col items-center gap-2">
          <Button
            size="icon"
            onClick={onDecline}
            className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>
          <span className="text-white/80 text-sm">Отклонить</span>
        </div>

        {/* Accept */}
        <div className="flex flex-col items-center gap-2">
          <Button
            size="icon"
            onClick={onAccept}
            className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600"
          >
            {isVideoCall ? (
              <Video className="w-7 h-7" />
            ) : (
              <Phone className="w-7 h-7" />
            )}
          </Button>
          <span className="text-white/80 text-sm">Ответить</span>
        </div>
      </div>
    </div>
  );
}
