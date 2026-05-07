import { motion } from "framer-motion";
import { Phone, Video } from "lucide-react";
import type { VideoCall } from "@/contexts/VideoCallContext";
import { GlassControlButton } from "@/components/ui/glass/GlassControlButton";
import { CallBackground } from "@/components/ui/glass/CallBackground";
import { GlassAvatarRing } from "@/components/ui/glass/GlassAvatarRing";

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
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between py-16 safe-area-inset"
    >
      <CallBackground />

      <div className="relative z-10 flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
        {isVideoCall ? <Video className="w-5 h-5 text-white" /> : <Phone className="w-5 h-5 text-white" />}
        <span className="text-white font-medium">
          {isVideoCall ? "Видеозвонок" : "Аудиозвонок"}
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4">
        <GlassAvatarRing
          name={callerName}
          seed={call.caller_id}
          avatarUrl={callerAvatar}
          size="xl"
          isRinging
          callState="incoming_ringing"
        />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{callerName}</h2>
          <p className="text-white/80 mt-1">Входящий звонок...</p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-12">
        <GlassControlButton
          icon={<Phone className="w-7 h-7 rotate-[135deg]" />}
          label="Отклонить"
          variant="danger"
          size="lg"
          onClick={onDecline}
        />
        <GlassControlButton
          icon={isVideoCall ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
          label="Ответить"
          size="lg"
          onClick={onAccept}
        />
      </div>
    </motion.div>
  );
}
