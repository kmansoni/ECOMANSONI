export interface RpcErrorInfo {
  code: string | null;
  message: string;
  retryAfterMs: number | null;
}

function extractCodeFromText(input: string): string | null {
  const match = input.match(/\bERR_[A-Z0-9_]+\b/);
  return match ? match[0] : null;
}

export function parseRpcError(err: unknown): RpcErrorInfo {
  if (!err) {
    return { code: null, message: "Unknown error", retryAfterMs: null };
  }

  if (typeof err === "string") {
    return {
      code: extractCodeFromText(err),
      message: err,
      retryAfterMs: null,
    };
  }

  if (err instanceof Error) {
    return {
      code: extractCodeFromText(err.message || ""),
      message: err.message || "Error",
      retryAfterMs: null,
    };
  }

  if (typeof err === "object") {
    const anyErr = err as any;
    const message = String(
      anyErr?.message ??
        anyErr?.error_description ??
        anyErr?.details ??
        "Unknown error"
    );
    const directCode =
      typeof anyErr?.code === "string" && anyErr.code.trim() ? anyErr.code.trim() : null;
    const parsedCode = directCode ?? extractCodeFromText(message);
    const retryAfterRaw = anyErr?.retry_after_ms ?? anyErr?.retryAfterMs;
    const retryAfterMs =
      typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw) ? retryAfterRaw : null;
    return {
      code: parsedCode,
      message,
      retryAfterMs,
    };
  }

  const message = String(err);
  return {
    code: extractCodeFromText(message),
    message,
    retryAfterMs: null,
  };
}

