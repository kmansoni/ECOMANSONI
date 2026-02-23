export type DeepLinkEvent = {
  path: string;
  params?: Record<string, string>;
};

type DeepLinkListener = (event: DeepLinkEvent) => void;

const listeners = new Set<DeepLinkListener>();

export function onDeepLink(listener: DeepLinkListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDeepLink(event: DeepLinkEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
