export type CallKitAction =
  | { type: "incoming"; callId: string; callerName: string; hasVideo: boolean }
  | { type: "accept"; callId: string }
  | { type: "decline"; callId: string }
  | { type: "end"; callId: string; reason?: string };

type CallKitListener = (action: CallKitAction) => void;

const listeners = new Set<CallKitListener>();

export function onCallKitAction(listener: CallKitListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitCallKitAction(action: CallKitAction): void {
  for (const listener of listeners) {
    listener(action);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mansoni:native-call-action", { detail: action }));
  }
}
