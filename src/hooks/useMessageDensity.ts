/**
 * useMessageDensity — toggle between compact and expanded message display.
 *
 * Compact: smaller avatars (28px), reduced padding, smaller font, no sender name for consecutive.
 * Expanded: standard Telegram layout (40px avatars, full padding).
 *
 * Persisted in localStorage.
 */

import { useState, useCallback } from "react";

export type MessageDensity = "compact" | "expanded";

const LS_KEY = "msg_density_v1";

function loadDensity(): MessageDensity {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === "compact" || val === "expanded") return val;
  } catch {}
  return "expanded";
}

export interface DensityStyles {
  avatarSize: string;       // tailwind class: "w-7 h-7" or "w-10 h-10"
  avatarSizePx: number;     // 28 or 40
  bubblePadding: string;    // "px-2.5 py-1.5" or "px-3 py-2"
  fontSize: string;         // "text-[13px]" or "text-[15px]"
  gap: string;              // "gap-1" or "gap-2"
  senderNameSize: string;   // "text-[11px]" or "text-xs"
  timeSize: string;         // "text-[9px]" or "text-[11px]"
  messageGap: string;       // "py-0.5" or "py-1"
}

const COMPACT_STYLES: DensityStyles = {
  avatarSize: "w-7 h-7",
  avatarSizePx: 28,
  bubblePadding: "px-2.5 py-1.5",
  fontSize: "text-[13px]",
  gap: "gap-1",
  senderNameSize: "text-[11px]",
  timeSize: "text-[9px]",
  messageGap: "py-0.5",
};

const EXPANDED_STYLES: DensityStyles = {
  avatarSize: "w-10 h-10",
  avatarSizePx: 40,
  bubblePadding: "px-3 py-2",
  fontSize: "text-[15px]",
  gap: "gap-2",
  senderNameSize: "text-xs",
  timeSize: "text-[11px]",
  messageGap: "py-1",
};

export function useMessageDensity() {
  const [density, setDensityState] = useState<MessageDensity>(loadDensity);

  const setDensity = useCallback((d: MessageDensity) => {
    setDensityState(d);
    try { localStorage.setItem(LS_KEY, d); } catch {}
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity(density === "compact" ? "expanded" : "compact");
  }, [density, setDensity]);

  const styles: DensityStyles = density === "compact" ? COMPACT_STYLES : EXPANDED_STYLES;

  return { density, setDensity, toggleDensity, styles };
}
