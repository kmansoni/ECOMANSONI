/**
 * useKeyboardAvoidance — keeps the message input above the software keyboard.
 *
 * Problem: On iOS Safari and Android Chrome, the virtual keyboard resizes
 * the viewport but the browser's handling is inconsistent:
 *   - iOS Safari: does NOT resize `window.innerHeight`, uses `visualViewport`.
 *   - Android Chrome: resizes `window.innerHeight` OR uses `visualViewport`.
 *   - PWA / standalone mode: behavior differs from browser tab.
 *
 * Solution: Use `window.visualViewport` API (supported in all 2024+ browsers).
 *   - `visualViewport.height` = visible area above keyboard.
 *   - `visualViewport.offsetTop` = scroll offset of the visual viewport.
 *   - `visualViewport.pageTop` = position of visual viewport within the page.
 *
 * Returns `keyboardHeight` (px above the keyboard the layout should "float").
 * The caller applies this as `paddingBottom` or `bottom` offset to the
 * compose bar / input container.
 *
 * Also returns `isKeyboardOpen` for conditionally showing UI (camera button
 * disappears when keyboard is open in Telegram).
 *
 * Usage:
 *   const { keyboardHeight, isKeyboardOpen } = useKeyboardAvoidance();
 *   <div style={{ paddingBottom: keyboardHeight }}>
 *     <MessageInput />
 *   </div>
 */

import { useState, useEffect } from 'react';

export interface UseKeyboardAvoidanceResult {
  /** Pixels the keyboard extends above the bottom of the screen. 0 when keyboard is hidden. */
  keyboardHeight: number;
  /** True while keyboard is visible */
  isKeyboardOpen: boolean;
}

export function useKeyboardAvoidance(): UseKeyboardAvoidanceResult {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // visualViewport is available in all modern browsers
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback: no keyboard avoidance (desktop, or very old browser)
      return;
    }

    const KEYBOARD_THRESHOLD = 100; // px — ignore tiny visual viewport shifts

    const update = () => {
      const windowHeight = window.innerHeight;
      const viewportHeight = vv.height;

      // Keyboard height = difference between window height and visible viewport height
      // adjusted for any existing scroll offset in the visual viewport.
      const offset = Math.max(0, windowHeight - viewportHeight - vv.offsetTop);

      // Only treat as "keyboard open" if offset is significant
      const kh = offset > KEYBOARD_THRESHOLD ? offset : 0;
      setKeyboardHeight(kh);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    // Initial measurement
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return {
    keyboardHeight,
    isKeyboardOpen: keyboardHeight > 0,
  };
}
