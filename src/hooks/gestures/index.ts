/**
 * Gesture hooks — barrel export.
 *
 * All gesture/interaction hooks available in this project:
 */

// ── Existing (updated) ─────────────────────────────────────────────────────
export { useSwipeGesture } from '../useSwipeGesture';
export type {} from '../useSwipeGesture';

export { useMessageSwipe } from '../useMessageSwipe';
export type { MessageSwipeCallbacks } from '../useMessageSwipe';

export { useReelGestures } from '../useReelGestures';
export { usePullDownExpand } from '../usePullDownExpand';
export { useScrollCollapse } from '../useScrollCollapse';

// ── New (2026) ──────────────────────────────────────────────────────────────
export { useLongPress } from '../useLongPress';
export type { UseLongPressOptions, UseLongPressResult } from '../useLongPress';

export { useScrollToBottom } from '../useScrollToBottom';
export type { UseScrollToBottomOptions, UseScrollToBottomResult } from '../useScrollToBottom';

export { usePinchZoom } from '../usePinchZoom';
export type { UsePinchZoomOptions, UsePinchZoomResult } from '../usePinchZoom';

export { useBottomSheetPan } from '../useBottomSheetPan';
export type { UseBottomSheetPanOptions, UseBottomSheetPanResult } from '../useBottomSheetPan';

export { useEdgeSwipeBack } from '../useEdgeSwipeBack';
export type { UseEdgeSwipeBackOptions, UseEdgeSwipeBackResult } from '../useEdgeSwipeBack';

export { useKeyboardAvoidance } from '../useKeyboardAvoidance';
export type { UseKeyboardAvoidanceResult } from '../useKeyboardAvoidance';

export { useDragReorder, reorderArray } from '../useDragReorder';
export type { UseDragReorderOptions, UseDragReorderResult } from '../useDragReorder';
