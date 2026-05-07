import { AnimatePresence, motion } from "framer-motion";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import type { CallState } from "@/calls-v2/callStateMachine";

interface CallStatusIndicatorProps {
  callState: CallState;
  className?: string;
}

type StateConfig = { icon: React.ReactNode; color: string; label: string };

function getConfig(s: CallState): StateConfig {
  switch (s) {
    case "outgoing_ringing":
      return { icon: <PhoneOutgoing className="w-6 h-6 animate-pulse" />, color: "#00b4d8", label: "Вызов" };
    case "incoming_ringing":
      return { icon: <PhoneIncoming className="w-6 h-6 animate-pulse" />, color: "#fbbf24", label: "Звонок" };
    case "bootstrapping":
    case "signaling_ready":
    case "media_acquiring":
    case "transport_connecting":
    case "media_ready":
      return { icon: <Loader2 className="w-6 h-6 animate-spin" />, color: "#00b4d8", label: "Подключение" };
    case "in_call":
      return { icon: <CheckCircle className="w-6 h-6" />, color: "#4fd080", label: "Соединение" };
    case "reconnecting":
      return { icon: <RefreshCw className="w-6 h-6 animate-spin" />, color: "#f97316", label: "Переподключение" };
    case "ending":
      return { icon: <PhoneOff className="w-6 h-6" />, color: "#94a3b8", label: "Завершение" };
    case "ended":
      return { icon: <PhoneOff className="w-6 h-6" />, color: "#64748b", label: "Завершено" };
    case "failed":
      return { icon: <AlertTriangle className="w-6 h-6" />, color: "#ef4444", label: "Ошибка" };
    case "idle":
      return { icon: <PhoneCall className="w-6 h-6" />, color: "#64748b", label: "Ожидание" };
    default: {
      const _exhaustive: never = s;
      return { icon: <PhoneCall className="w-6 h-6" />, color: "#64748b", label: "Ожидание" };
    }
  }
}

export function CallStatusIndicator({ callState, className = "" }: CallStatusIndicatorProps) {
  const { icon, color, label } = getConfig(callState);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={callState}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`flex items-center gap-2 transition-colors duration-500 ${className}`}
        style={{ color }}
      >
        {icon}
        <span className="font-medium text-base">{label}</span>
      </motion.span>
    </AnimatePresence>
  );
}
