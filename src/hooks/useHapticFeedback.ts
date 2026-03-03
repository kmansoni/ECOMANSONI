export function useHapticFeedback() {
  const light = () => navigator.vibrate?.(10);
  const medium = () => navigator.vibrate?.(25);
  const heavy = () => navigator.vibrate?.(50);
  const success = () => navigator.vibrate?.([10, 50, 10]);
  const error = () => navigator.vibrate?.([50, 30, 50]);
  const selection = () => navigator.vibrate?.(5);

  return { light, medium, heavy, success, error, selection };
}
