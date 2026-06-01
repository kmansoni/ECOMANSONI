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
  Wifi,
  Shield,
  KeyRound,
  Radio,
  Signal,
} from "lucide-react";
import type { CallState } from "@/calls-v2/callStateMachine";

interface CallStatusIndicatorProps {
  callState: CallState;
  className?: string;
  /** Show extended E2EE/key-exchange sub-status */
  showDetail?: boolean;
  /** Sub-status for key exchange (shown during connecting states) */
  keyExchangePhase?: "none" | "identity" | "handshake" | "key_derivation" | "media_setup" | "done";
}

type StateConfig = { icon: React.ReactNode; color: string; label: string; detail?: string };

function getConfig(s: CallState, keyExchangePhase?: string): StateConfig {
  switch (s) {
    case "outgoing_ringing":
      return { icon: <PhoneOutgoing className="w-5 h-5 animate-pulse" />, color: "#00b4d8", label: "Вызов" };
    case "incoming_ringing":
      return { icon: <PhoneIncoming className="w-5 h-5 animate-pulse" />, color: "#fbbf24", label: "Звонок" };
    case "idle":
      return { icon: <PhoneCall className="w-5 h-5" />, color: "#64748b", label: "Ожидание" };
    case "bootstrapping":
      return {
        icon: <Loader2 className="w-5 h-5 animate-spin" />,
        color: "#00b4d8",
        label: "Подключение",
        detail: getKeyExchangeDetail(keyExchangePhase),
      };
    case "signaling_ready":
      return {
        icon: <Signal className="w-5 h-5 animate-pulse" />,
        color: "#06b6d4",
        label: "Сигналинг",
        detail: "Канал готов",
      };
    case "media_acquiring":
      return {
        icon: <Radio className="w-5 h-5 animate-pulse" />,
        color: "#0891b2",
        label: "Микрофон/камера",
        detail: "Запрос доступа",
      };
    case "transport_connecting":
      return {
        icon: <Wifi className="w-5 h-5 animate-pulse" />,
        color: "#7c3aed",
        label: "Транспорт",
        detail: "DTLS/SRTP",
      };
    case "media_ready":
      return {
        icon: <Shield className="w-5 h-5 animate-pulse" />,
        color: "#059669",
        label: "Шифрование",
        detail: getKeyExchangeDetail(keyExchangePhase),
      };
    case "in_call":
      return { icon: <CheckCircle className="w-5 h-5" />, color: "#4fd080", label: "Соединение" };
    case "reconnecting":
      return { icon: <RefreshCw className="w-5 h-6 animate-spin" />, color: "#f97316", label: "Переподключение" };
    case "ending":
      return { icon: <PhoneOff className="w-5 h-5" />, color: "#94a3b8", label: "Завершение" };
    case "ended":
      return { icon: <PhoneOff className="w-5 h-5" />, color: "#64748b", label: "Завершено" };
    case "failed":
      return { icon: <AlertTriangle className="w-5 h-5" />, color: "#ef4444", label: "Ошибка" };
    default: {
      const _exhaustive: never = s;
      return { icon: <PhoneCall className="w-5 h-5" />, color: "#64748b", label: "Ожидание" };
    }
  }
}

function getKeyExchangeDetail(phase?: string): string | undefined {
  switch (phase) {
    case "identity": return "Идентификация...";
    case "handshake": return "Обмен ключами...";
    case "key_derivation": return "Ключи...";
    case "media_setup": return "Медиа...";
    case "done": return "Готово";
    default: return undefined;
  }
}

export function CallStatusIndicator({
  callState,
  className = "",
  showDetail = false,
  keyExchangePhase,
}: CallStatusIndicatorProps) {
  const { icon, color, label, detail } = getConfig(callState, keyExchangePhase);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={callState}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`flex flex-col items-start gap-0.5 transition-colors duration-500 ${className}`}
        style={{ color }}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{label}</span>
        </span>
        {showDetail && detail && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            className="text-[11px] font-normal ml-7"
          >
            {detail}
          </motion.span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}
