/**
 * Returns the base URL prefix for static navigation data files.
 *
 * In production VITE_STATIC_DATA_URL points to the AdminVPS nginx
 * location that serves /opt/mansoni/static-data (e.g. "https://mansoni.ru").
 * In dev mode the variable is empty and files are served from public/.
 */
export function staticDataUrl(path: string): string {
  const base = (import.meta.env.VITE_STATIC_DATA_URL as string) ?? '';
  // Ensure no double slashes when base is empty or ends with /
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${path}`;
}
