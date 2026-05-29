import { type ReactNode } from "react";
import { motion } from "framer-motion";

interface GlassControlButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  variant?: "default" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

const SIZE_MAP = { sm: "w-10 h-10", md: "w-14 h-14", lg: "w-16 h-16" } as const;

export function GlassControlButton({
  icon,
  label,
  onClick,
  isActive = true,
  variant = "default",
  size = "md",
  disabled = false,
  className = "",
}: GlassControlButtonProps) {
  const isDanger = variant === "danger";
  const isSuccess = variant === "success";

  const style: React.CSSProperties = isDanger
    ? {
        background: "linear-gradient(145deg, #ef4444 0%, #dc2626 100%)",
        boxShadow: "0 4px 20px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
      }
    : isSuccess
    ? {
        background: "linear-gradient(145deg, #22c55e 0%, #16a34a 100%)",
        boxShadow: "0 4px 20px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
      }
    : {
        background: isActive
          ? "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)",
        border: "1px solid rgba(255,255,255,0.2)",
        boxShadow: isActive
          ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.2)"
          : "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 20px rgba(0,0,0,0.1)",
        color: isActive ? "white" : "#1a1a1a",
      };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={!isDanger ? isActive : undefined}
        className={`${SIZE_MAP[size]} min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center backdrop-blur-xl transition-opacity ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
        style={style}
      >
        <span className={isDanger || isSuccess || isActive ? "text-white" : "text-gray-800"}>
          {icon}
        </span>
      </motion.button>
      <span className="text-white/70 text-xs select-none">{label}</span>
    </div>
  );
}
