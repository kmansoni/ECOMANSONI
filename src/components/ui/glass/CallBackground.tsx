import { memo } from "react";
import { CALL_ACCENT_COLORS } from "./glassTokens";

interface CallBackgroundProps {
  variant?: "aurora" | "minimal";
  className?: string;
}

export const CallBackground = memo(function CallBackground({
  variant = "aurora",
  className = "",
}: CallBackgroundProps) {
  if (variant === "minimal") {
    return (
      <div className={`absolute inset-0 ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
      <div
        className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
        style={{
          background: `radial-gradient(circle, ${CALL_ACCENT_COLORS.navy} 0%, transparent 70%)`,
          animation: "float-orb-1 15s ease-in-out infinite",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />
      <div
        className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
        style={{
          background: `radial-gradient(circle, ${CALL_ACCENT_COLORS.teal} 0%, transparent 70%)`,
          animation: "float-orb-2 18s ease-in-out infinite",
          animationDelay: "-5s",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />
      <div
        className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
        style={{
          background: `radial-gradient(circle, ${CALL_ACCENT_COLORS.emerald} 0%, transparent 70%)`,
          animation: "float-orb-3 20s ease-in-out infinite",
          animationDelay: "-10s",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />
      <div
        className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
        style={{
          background: `radial-gradient(circle, ${CALL_ACCENT_COLORS.green} 0%, transparent 70%)`,
          animation: "float-orb-4 22s ease-in-out infinite",
          animationDelay: "-3s",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(at 30% 20%, hsla(200,100%,40%,0.25) 0px, transparent 50%),
                            radial-gradient(at 70% 10%, hsla(175,80%,45%,0.2) 0px, transparent 50%),
                            radial-gradient(at 10% 60%, hsla(160,70%,50%,0.2) 0px, transparent 50%),
                            radial-gradient(at 90% 70%, hsla(140,60%,50%,0.15) 0px, transparent 50%),
                            radial-gradient(at 50% 90%, hsla(185,90%,40%,0.2) 0px, transparent 50%)`,
          backgroundSize: "200% 200%",
          animation: "shimmer-gradient 8s ease-in-out infinite",
          willChange: "transform",
        }}
      />
    </div>
  );
});
