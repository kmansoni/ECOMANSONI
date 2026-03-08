/**
 * useHapticFeedback — unified haptic feedback hook.
 *
 * Priority:
 *   1. @capacitor/haptics — native iOS/Android (precise, silent on web)
 *   2. navigator.vibrate  — Android Chrome fallback
 *   3. No-op              — desktop / unsupported
 *
 * Usage:
 *   const haptic = useHapticFeedback();
 *   haptic.light();    // selection / tap
 *   haptic.medium();   // action confirmation
 *   haptic.heavy();    // destructive / strong feedback
 *   haptic.success();  // positive outcome
 *   haptic.error();    // negative outcome
 *   haptic.selection();// picker / scroll tick
 */

// Lazy-loaded Capacitor Haptics to avoid import errors on web
let capacitorHapticsPromise: Promise<typeof import("@capacitor/haptics")> | null = null;

function getCapacitorHaptics() {
  if (!capacitorHapticsPromise) {
    capacitorHapticsPromise = import("@capacitor/haptics").catch(() => null as never);
  }
  return capacitorHapticsPromise;
}

async function triggerCapacitor(
  style: "Light" | "Medium" | "Heavy",
  notification?: "Success" | "Warning" | "Error"
): Promise<boolean> {
  try {
    const mod = await getCapacitorHaptics();
    if (!mod) return false;
    const { Haptics, ImpactStyle, NotificationType } = mod;
    if (notification) {
      await Haptics.notification({ type: NotificationType[notification] });
    } else {
      await Haptics.impact({ style: ImpactStyle[style] });
    }
    return true;
  } catch {
    return false;
  }
}

function vibrateWeb(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Silently ignore — desktop or unsupported
  }
}

// ---------------------------------------------------------------------------
// Module-level stable singleton — functions never change identity between
// renders, so they are safe to use in useEffect/useCallback deps arrays.
// ---------------------------------------------------------------------------

const light = async (): Promise<void> => {
  const ok = await triggerCapacitor("Light");
  if (!ok) vibrateWeb(10);
};

const medium = async (): Promise<void> => {
  const ok = await triggerCapacitor("Medium");
  if (!ok) vibrateWeb(25);
};

const heavy = async (): Promise<void> => {
  const ok = await triggerCapacitor("Heavy");
  if (!ok) vibrateWeb(50);
};

const success = async (): Promise<void> => {
  const ok = await triggerCapacitor("Light", "Success");
  if (!ok) vibrateWeb([10, 50, 10]);
};

const error = async (): Promise<void> => {
  const ok = await triggerCapacitor("Heavy", "Error");
  if (!ok) vibrateWeb([50, 30, 50]);
};

const selection = async (): Promise<void> => {
  const ok = await triggerCapacitor("Light");
  if (!ok) vibrateWeb(5);
};

/** Stable singleton — same object reference across all renders. */
export const hapticFeedback = {
  light,
  medium,
  heavy,
  success,
  error,
  selection,
} as const;

/**
 * useHapticFeedback — returns the stable hapticFeedback singleton.
 *
 * The returned object is referentially stable (module-level constant),
 * so it is safe to include in useEffect / useCallback dependency arrays.
 */
export function useHapticFeedback() {
  return hapticFeedback;
}
