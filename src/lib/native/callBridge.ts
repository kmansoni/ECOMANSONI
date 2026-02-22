export type NativeCallAction =
  | { type: "incoming"; callId: string; callerName?: string; hasVideo?: boolean }
  | { type: "accept"; callId: string }
  | { type: "decline"; callId: string }
  | { type: "end"; callId: string; reason?: string }
  | { type: "answer"; callId: string }
  | { type: "reject"; callId: string }
  | { type: "disconnect"; callId: string; reason?: string };

const EVENT_NAME = "mansoni:native-call-action";

export function onNativeCallAction(listener: (action: NativeCallAction) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<NativeCallAction>;
    if (!custom.detail) return;
    listener(custom.detail);
  };

  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}

export function emitNativeCallAction(action: NativeCallAction): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: action }));
}
