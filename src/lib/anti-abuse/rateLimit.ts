export type RateLimitErrorPayload = {
  error?: string;
  action?: string;
  tier?: string;
  retryAfter?: number;
};

export type ParsedRateLimitError = {
  payload: RateLimitErrorPayload;
  retryAfterSeconds?: number;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function parseRateLimitFromResponse(res: Response): Promise<ParsedRateLimitError | null> {
  if (res.status !== 429) return null;

  const retryAfterHeader = res.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

  const text = await res.text().catch(() => "");
  const json = typeof text === "string" && text ? safeJsonParse(text) : null;

  const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

  const payload: RateLimitErrorPayload = obj
    ? {
        error: typeof obj.error === "string" ? obj.error : undefined,
        action: typeof obj.action === "string" ? obj.action : undefined,
        tier: typeof obj.tier === "string" ? obj.tier : undefined,
        retryAfter: typeof obj.retryAfter === "number" ? obj.retryAfter : undefined,
      }
    : {};

  return {
    payload,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds
      : typeof payload.retryAfter === "number"
        ? payload.retryAfter
        : undefined,
  };
}
