function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

export const TURN_CREDENTIALS_URL = normalizeEnv(import.meta.env.VITE_TURN_CREDENTIALS_URL);
export const TURN_CREDENTIALS_API_KEY = normalizeEnv(import.meta.env.VITE_TURN_CREDENTIALS_API_KEY);
export const TURN_CREDENTIALS_EDGE_FNS = ["turn-credentials"] as const;
