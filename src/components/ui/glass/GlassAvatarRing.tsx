import { motion, AnimatePresence } from "framer-motion";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import type { CallState } from "@/calls-v2/callStateMachine";
import { isCallRinging, isCallConnected } from "@/calls-v2/callStateMachine";
import { BRAND_GRADIENT } from "./glassTokens";

interface GlassAvatarRingProps {
  name: string;
  seed: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  isRinging?: boolean;
  callState?: CallState;
  className?: string;
}

const SIZE_MAP = { sm: "w-12 h-12", md: "w-20 h-20", lg: "w-28 h-28", xl: "w-36 h-36" } as const;
const TEXT_SIZE_MAP = { sm: "text-lg", md: "text-2xl", lg: "text-4xl", xl: "text-5xl" } as const;
const AVATAR_SIZE_MAP = { sm: "sm" as const, md: "md" as const, lg: "lg" as const, xl: "lg" as const };

function getRingColor(callState?: CallState): string {
  if (!callState) return "rgba(0,180,216,0.6)";
  if (isCallRinging(callState)) return "rgba(251,191,36,0.7)";
  if (isCallConnected(callState)) return "rgba(79,208,128,0.7)";
  if (callState === "failed") return "rgba(239,68,68,0.7)";
  return "rgba(0,180,216,0.6)";
}

export function GlassAvatarRing({
  name,
  seed,
  avatarUrl,
  size = "lg",
  isRinging = false,
  callState,
  className = "",
}: GlassAvatarRingProps) {
  const ringColor = getRingColor(callState);

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>
        {isRinging && (
          <>
            <motion.div
              key="ring1"
              className={`absolute -inset-3 rounded-full border-2`}
              style={{ borderColor: ringColor }}
              animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              key="ring2"
              className={`absolute -inset-3 rounded-full border`}
              style={{ borderColor: ringColor }}
              animate={{ scale: [1, 1.7], opacity: [0.3, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
            />
          </>
        )}
      </AnimatePresence>

      <div
        className={`relative ${SIZE_MAP[size]} rounded-full overflow-hidden flex items-center justify-center backdrop-blur-xl`}
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 60px ${ringColor}`,
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <GradientAvatar
          name={name}
          seed={seed}
          avatarUrl={avatarUrl}
          size={AVATAR_SIZE_MAP[size]}
          className={`w-full h-full ${TEXT_SIZE_MAP[size]} border-0`}
        />
      </div>
    </div>
  );
}
