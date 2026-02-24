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

  const payload: RateLimitErrorPayload =
    json && typeof json === "object"
      ? {
          error: typeof (json as any).error === "string" ? (json as any).error : undefined,
          action: typeof (json as any).action === "string" ? (json as any).action : undefined,
          tier: typeof (json as any).tier === "string" ? (json as any).tier : undefined,
          retryAfter: typeof (json as any).retryAfter === "number" ? (json as any).retryAfter : undefined,
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
