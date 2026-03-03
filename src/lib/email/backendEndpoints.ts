function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function pushUnique(list: string[], value: string) {
  const normalized = stripTrailingSlash(value);
  if (!normalized) return;
  if (!list.includes(normalized)) list.push(normalized);
}

function localDevBaseFromWindow(): string {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.protocol}//${hostname}:8090`;
  }
  return "";
}

export function getEmailRouterApiBases(): string[] {
  const bases: string[] = [];
  const explicit = normalizeEnv((import.meta as any).env?.VITE_EMAIL_ROUTER_API_URL);
  if (explicit) {
    pushUnique(bases, explicit);
  }

  const localDev = localDevBaseFromWindow();
  if (localDev) {
    pushUnique(bases, localDev);
  }

  if (typeof window !== "undefined") {
    pushUnique(bases, `${window.location.origin}/api/email-router`);
  }

  pushUnique(bases, "http://127.0.0.1:8090");
  pushUnique(bases, "http://localhost:8090");
  return bases;
}
