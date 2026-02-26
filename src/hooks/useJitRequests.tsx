import { useCallback, useEffect, useState } from "react";
import { adminApi, JitRequest, AdminMe } from "@/lib/adminApi";

export function useJitRequests(me: AdminMe | null | undefined) {
  const [requests, setRequests] = useState<JitRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi<JitRequest[]>("jit.active");
      setRequests(data || []);
    } catch (err: any) {
      setError(typeof err?.message === "string" ? err.message : "Failed to load JIT requests");
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [load]);

  return { requests, loading, error, refresh: load };
}
