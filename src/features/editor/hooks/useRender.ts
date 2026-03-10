/**
 * useRender.ts — Hooks для запуска рендеринга, получения статуса и SSE-логов.
 *
 * useRenderStatus — polling каждые 2с пока job не completed/failed/cancelled.
 * useRenderLogs — SSE стрим через fetch ReadableStream.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import type { StartRenderInput, RenderJob, RenderLogEvent } from '../types';

// ── Query keys ────────────────────────────────────────────────────────────

export const renderKeys = {
  status: (projectId: string, jobId: string) =>
    ['render-status', projectId, jobId] as const,
};

// ── Terminal statuses ─────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

// ── Start Render ──────────────────────────────────────────────────────────

export function useStartRender(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (opts?: StartRenderInput) => editorApi.startRender(projectId, opts),
    onSuccess(job) {
      queryClient.setQueryData(renderKeys.status(projectId, job.id), job);
    },
  });
}

// ── Render Status (polling) ───────────────────────────────────────────────

export function useRenderStatus(projectId: string, jobId: string | null) {
  return useQuery({
    queryKey: renderKeys.status(projectId, jobId ?? ''),
    queryFn: () => editorApi.getRenderStatus(projectId, jobId!),
    enabled: !!jobId,
    refetchInterval(query) {
      const status = query.state.data?.status;
      if (isTerminal(status)) return false;
      return 2000;
    },
    staleTime: 1000,
  });
}

// ── Cancel Render ─────────────────────────────────────────────────────────

export function useCancelRender(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => editorApi.cancelRender(projectId, jobId),
    onSuccess(_data, jobId) {
      queryClient.invalidateQueries({
        queryKey: renderKeys.status(projectId, jobId),
      });
    },
  });
}

// ── Render Logs (SSE stream) ──────────────────────────────────────────────

export function useRenderLogs(projectId: string, jobId: string | null) {
  const [logs, setLogs] = useState<RenderLogEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    if (!jobId) {
      setLogs([]);
      return;
    }

    const cleanup = editorApi.streamRenderLogs(
      projectId,
      jobId,
      (event) => {
        setLogs((prev) => [...prev, event]);
      },
      (err) => {
        setError(err);
      },
    );

    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [projectId, jobId]);

  return { logs, error, clearLogs };
}

// ── Composite: full render workflow ─────────────────────────────────────

export function useRenderWorkflow(projectId: string) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const startRender = useStartRender(projectId);
  const status = useRenderStatus(projectId, activeJobId);
  const { logs, error: logsError, clearLogs } = useRenderLogs(projectId, activeJobId);
  const cancelRender = useCancelRender(projectId);

  const start = useCallback(
    async (opts?: StartRenderInput) => {
      clearLogs();
      const job = await startRender.mutateAsync(opts);
      setActiveJobId(job.id);
      return job;
    },
    [startRender, clearLogs],
  );

  const cancel = useCallback(async () => {
    if (!activeJobId) return;
    await cancelRender.mutateAsync(activeJobId);
  }, [activeJobId, cancelRender]);

  const reset = useCallback(() => {
    setActiveJobId(null);
    clearLogs();
  }, [clearLogs]);

  return {
    activeJobId,
    start,
    cancel,
    reset,
    status: status.data as RenderJob | undefined,
    isStarting: startRender.isPending,
    isCancelling: cancelRender.isPending,
    logs,
    logsError,
    isComplete: isTerminal(status.data?.status),
  };
}
