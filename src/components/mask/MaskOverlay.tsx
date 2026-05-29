import React, { useEffect, useRef } from 'react';

export const MASKS = [
  { id: 'none',     label: 'Без маски',  emoji: null },
  { id: 'glasses',  label: 'Очки',       emoji: '🕶️' },
  { id: 'mustache', label: 'Усы',        emoji: '👨' },
  { id: 'hat',      label: 'Шляпа',      emoji: '🎩' },
] as const;

export type MaskId = typeof MASKS[number]['id'];

interface MaskOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  maskId: MaskId;
}

// Simple emoji overlay — no face tracking, no external deps.
// Renders centered emoji on top of video as a visual indicator.
const MaskOverlay: React.FC<MaskOverlayProps> = ({ maskId }) => {
  const mask = MASKS.find(m => m.id === maskId);
  if (!mask?.emoji) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        fontSize: '4rem',
        opacity: 0.85,
        userSelect: 'none',
      }}
    >
      {mask.emoji}
    </div>
  );
};

export default MaskOverlay;
