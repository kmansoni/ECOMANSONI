export type NativePushEvent = {
  type: "message" | "incoming_call" | "security";
  payload: Record<string, unknown>;
};

export type NativePushTokenEvent = {
  token: string;
  provider: "apns" | "fcm";
  platform?: "ios" | "android" | "web";
  appBuild?: number;
  appVersion?: string;
};

type PushListener = (event: NativePushEvent) => void;

const listeners = new Set<PushListener>();

export function onNativePush(listener: PushListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNativePush(event: NativePushEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mansoni:native-push-event", { detail: event }));
  }
}

export function emitNativePushToken(event: NativePushTokenEvent): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mansoni:native-push-token", { detail: event }));
  }
}
