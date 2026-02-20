export type FetchWithTimeoutOptions = {
  timeoutMs: number;
};

export function createFetchWithTimeout({ timeoutMs }: FetchWithTimeoutOptions) {
  return async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    const upstreamSignal = init?.signal;
    const onUpstreamAbort = () => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    };

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        onUpstreamAbort();
      } else {
        upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
      }
    }

    try {
      const nextInit: RequestInit = {
        ...init,
        // Always enforce our timeout; also respects upstream abort via piping above.
        signal: controller.signal,
      };
      return await fetch(input, nextInit);
    } finally {
      window.clearTimeout(timeoutId);
      if (upstreamSignal && !upstreamSignal.aborted) {
        try {
          upstreamSignal.removeEventListener("abort", onUpstreamAbort);
        } catch {
          // ignore
        }
      }
    }
  };
}
