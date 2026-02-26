function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function pushUnique(list: string[], value: string) {
  const v = stripTrailingSlash(value);
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

export function getPhoneAuthFunctionUrls(): string[] {
  const urls: string[] = [];
  const explicitFn = normalizeEnv(import.meta.env.VITE_PHONE_AUTH_FUNCTION_URL as unknown);
  if (explicitFn) {
    pushUnique(urls, explicitFn);
  }

  const apiBase = normalizeEnv(import.meta.env.VITE_PHONE_AUTH_API_URL as unknown);
  if (apiBase) {
    const base = stripTrailingSlash(apiBase);
    if (/\/functions\/v1$/i.test(base)) {
      pushUnique(urls, `${base}/phone-auth`);
    } else if (/\/functions\/v1\/phone-auth$/i.test(base)) {
      pushUnique(urls, base);
    } else {
      pushUnique(urls, `${base}/functions/v1/phone-auth`);
    }
  }

  const supabaseUrl = stripTrailingSlash(normalizeEnv(import.meta.env.VITE_SUPABASE_URL as unknown));
  if (supabaseUrl) {
    let isSupabaseHost = false;
    try {
      isSupabaseHost = /\.supabase\.co$/i.test(new URL(supabaseUrl).hostname);
    } catch {
      isSupabaseHost = false;
    }

    if (isSupabaseHost) {
      pushUnique(urls, `${supabaseUrl}/functions/v1/phone-auth`);
    } else {
      pushUnique(urls, `${supabaseUrl}/functions/v1/phone-auth`);
      const supabaseRef = normalizeEnv(import.meta.env.VITE_SUPABASE_PROJECT_REF as unknown);
      if (supabaseRef) {
        pushUnique(urls, `https://${supabaseRef}.supabase.co/functions/v1/phone-auth`);
      }
    }
  }

  // Emergency production fallback for current primary project ref.
  pushUnique(urls, "https://lfkbgnbjxskspsownvjm.supabase.co/functions/v1/phone-auth");
  return urls;
}

export function getPhoneAuthFunctionUrl(): string {
  const urls = getPhoneAuthFunctionUrls();
  return urls[0] || "";
}

export function getPhoneAuthHeaders(): Record<string, string> {
  const supabaseKey = normalizeEnv(
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as unknown) ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as unknown),
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (supabaseKey) {
    headers.Authorization = `Bearer ${supabaseKey}`;
    headers.apikey = supabaseKey;
    headers["x-client-info"] = "supabase-js/2";
  }

  return headers;
}

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL as unknown);
  const supabaseKey = normalizeEnv(
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as unknown) ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as unknown),
  );
  return Boolean(supabaseUrl && supabaseKey);
}
