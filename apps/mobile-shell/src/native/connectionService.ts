export type ConnectionServiceAction =
  | { type: "incoming"; callId: string; callerName: string; hasVideo: boolean }
  | { type: "answer"; callId: string }
  | { type: "reject"; callId: string }
  | { type: "disconnect"; callId: string; reason?: string };

type ConnectionServiceListener = (action: ConnectionServiceAction) => void;

const listeners = new Set<ConnectionServiceListener>();

export function onConnectionServiceAction(listener: ConnectionServiceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitConnectionServiceAction(action: ConnectionServiceAction): void {
  for (const listener of listeners) {
    listener(action);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mansoni:native-call-action", { detail: action }));
  }
}
