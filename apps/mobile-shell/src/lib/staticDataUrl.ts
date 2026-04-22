const staticDataBaseUrl = (import.meta.env.VITE_STATIC_DATA_URL as string) ?? '';

export function staticDataUrl(path: string): string {
  return `${staticDataBaseUrl.replace(/\/$/, '')}${path}`;
}