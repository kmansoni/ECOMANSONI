/**
 * api.ts — HTTP клиент для editor-api.
 *
 * Использует native fetch (не axios). JWT берётся из Supabase session.
 * SSE реализован через fetch + ReadableStream (EventSource не поддерживает
 * custom headers — Authorization).
 *
 * Все методы возвращают строго типизированные Promise.
 * Ошибки оборачиваются в ApiError с HTTP status, message и необязательным code.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorEffect,
  EditorKeyframe,
  EditorTemplate,
  EditorAsset,
  MusicTrack,
  StickerPack,
  StickerItem,
  RenderJob,
  RenderLogEvent,
  TrackWithClips,
  CreateProjectInput,
  UpdateProjectInput,
  CreateTrackInput,
  UpdateTrackInput,
  CreateClipInput,
  UpdateClipInput,
  CreateEffectInput,
  UpdateEffectInput,
  KeyframeUpsertInput,
  StartRenderInput,
  RegisterAssetInput,
  PaginatedResponse,
  PaginationParams,
  ReorderItem,
} from './types';

// ── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

const EDITOR_API_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_EDITOR_API_URL ||
  'http://localhost:3002';

/** Кэшированный токен — переиспользуется до тех пор, пока сессия не сменится. */
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _tokenExpiresAt > now + 30_000) {
    return _cachedToken;
  }
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    _cachedToken = null;
    _tokenExpiresAt = 0;
    return '';
  }
  _cachedToken = session.access_token;
  _tokenExpiresAt = (session.expires_at ?? 0) * 1000;
  return _cachedToken;
}

function getTokenSync(): string {
  return _cachedToken ?? '';
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ── Core request ──────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${EDITOR_API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errorMessage = res.statusText;
    let errorCode: string | undefined;
    try {
      const errorBody = await res.json();
      errorMessage = errorBody.error || errorBody.message || errorMessage;
      errorCode = errorBody.code;
    } catch {
      // body не JSON — используем statusText
    }
    throw new ApiError(res.status, errorMessage, errorCode);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── SSE via fetch + ReadableStream ────────────────────────────────────────

function streamSSE(
  path: string,
  onEvent: (event: RenderLogEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  const controller = new AbortController();
  let cancelled = false;

  (async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${EDITOR_API_URL}${path}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ApiError(res.status, `SSE connection failed: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Последний элемент — необработанная часть (может быть неполной строкой)
        buffer = lines.pop() ?? '';

        let currentEventData = '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            currentEventData += line.slice(6);
          } else if (line === '' && currentEventData) {
            // Пустая строка = конец SSE-события
            try {
              const parsed = JSON.parse(currentEventData) as RenderLogEvent;
              onEvent(parsed);
            } catch {
              // Не JSON — пропускаем (keepalive, комментарии)
            }
            currentEventData = '';
          }
        }
      }
    } catch (err: unknown) {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();
  };
}

// ── API Client ────────────────────────────────────────────────────────────

class EditorApiClient {
  // ── Projects ──────────────────────────────────────────────────────────

  createProject(data: CreateProjectInput): Promise<EditorProject> {
    return request<EditorProject>('POST', '/api/projects', data);
  }

  listProjects(params?: PaginationParams): Promise<PaginatedResponse<EditorProject>> {
    return request<PaginatedResponse<EditorProject>>(
      'GET',
      `/api/projects${buildQuery(params as Record<string, unknown>)}`,
    );
  }

  getProject(id: string): Promise<{ project: EditorProject; tracks: TrackWithClips[] }> {
    return request<{ project: EditorProject; tracks: TrackWithClips[] }>(
      'GET',
      `/api/projects/${id}`,
    );
  }

  updateProject(id: string, data: UpdateProjectInput): Promise<EditorProject> {
    return request<EditorProject>('PATCH', `/api/projects/${id}`, data);
  }

  deleteProject(id: string): Promise<void> {
    return request<void>('DELETE', `/api/projects/${id}`);
  }

  duplicateProject(id: string): Promise<EditorProject> {
    return request<EditorProject>('POST', `/api/projects/${id}/duplicate`);
  }

  // ── Tracks ────────────────────────────────────────────────────────────

  createTrack(projectId: string, data: CreateTrackInput): Promise<EditorTrack> {
    return request<EditorTrack>('POST', `/api/projects/${projectId}/tracks`, data);
  }

  updateTrack(projectId: string, trackId: string, data: UpdateTrackInput): Promise<EditorTrack> {
    return request<EditorTrack>(
      'PATCH',
      `/api/projects/${projectId}/tracks/${trackId}`,
      data,
    );
  }

  deleteTrack(projectId: string, trackId: string): Promise<void> {
    return request<void>('DELETE', `/api/projects/${projectId}/tracks/${trackId}`);
  }

  reorderTracks(projectId: string, items: ReorderItem[]): Promise<void> {
    return request<void>('PUT', `/api/projects/${projectId}/tracks/reorder`, items);
  }

  // ── Clips ─────────────────────────────────────────────────────────────

  createClip(projectId: string, data: CreateClipInput): Promise<EditorClip> {
    return request<EditorClip>('POST', `/api/projects/${projectId}/clips`, data);
  }

  listClips(projectId: string): Promise<EditorClip[]> {
    return request<EditorClip[]>('GET', `/api/projects/${projectId}/clips`);
  }

  updateClip(projectId: string, clipId: string, data: UpdateClipInput): Promise<EditorClip> {
    return request<EditorClip>(
      'PATCH',
      `/api/projects/${projectId}/clips/${clipId}`,
      data,
    );
  }

  deleteClip(projectId: string, clipId: string): Promise<void> {
    return request<void>('DELETE', `/api/projects/${projectId}/clips/${clipId}`);
  }

  splitClip(
    projectId: string,
    clipId: string,
    splitAtMs: number,
  ): Promise<{ left: EditorClip; right: EditorClip }> {
    return request<{ left: EditorClip; right: EditorClip }>(
      'POST',
      `/api/projects/${projectId}/clips/${clipId}/split`,
      { split_at_ms: splitAtMs },
    );
  }

  duplicateClip(projectId: string, clipId: string): Promise<EditorClip> {
    return request<EditorClip>(
      'POST',
      `/api/projects/${projectId}/clips/${clipId}/duplicate`,
    );
  }

  // ── Effects ───────────────────────────────────────────────────────────

  createEffect(projectId: string, data: CreateEffectInput): Promise<EditorEffect> {
    return request<EditorEffect>('POST', `/api/projects/${projectId}/effects`, data);
  }

  updateEffect(
    projectId: string,
    effectId: string,
    data: UpdateEffectInput,
  ): Promise<EditorEffect> {
    return request<EditorEffect>(
      'PATCH',
      `/api/projects/${projectId}/effects/${effectId}`,
      data,
    );
  }

  deleteEffect(projectId: string, effectId: string): Promise<void> {
    return request<void>('DELETE', `/api/projects/${projectId}/effects/${effectId}`);
  }

  // ── Keyframes ─────────────────────────────────────────────────────────

  upsertKeyframes(
    projectId: string,
    keyframes: KeyframeUpsertInput[],
  ): Promise<EditorKeyframe[]> {
    return request<EditorKeyframe[]>(
      'PUT',
      `/api/projects/${projectId}/keyframes`,
      { keyframes },
    );
  }

  deleteKeyframe(projectId: string, keyframeId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `/api/projects/${projectId}/keyframes/${keyframeId}`,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  startRender(projectId: string, opts?: StartRenderInput): Promise<RenderJob> {
    return request<RenderJob>(
      'POST',
      `/api/projects/${projectId}/render`,
      opts ?? {},
    );
  }

  getRenderStatus(projectId: string, jobId: string): Promise<RenderJob> {
    return request<RenderJob>(
      'GET',
      `/api/projects/${projectId}/render/${jobId}`,
    );
  }

  cancelRender(projectId: string, jobId: string): Promise<void> {
    return request<void>(
      'POST',
      `/api/projects/${projectId}/render/${jobId}/cancel`,
    );
  }

  /**
   * SSE-стрим логов рендеринга.
   * EventSource не поддерживает custom headers, поэтому используется
   * fetch + ReadableStream. Возвращает cleanup-функцию.
   */
  streamRenderLogs(
    projectId: string,
    jobId: string,
    onEvent: (event: RenderLogEvent) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return streamSSE(
      `/api/projects/${projectId}/render/${jobId}/logs`,
      onEvent,
      onError,
    );
  }

  // ── Templates ─────────────────────────────────────────────────────────

  listTemplates(
    params?: PaginationParams & { category?: string; search?: string },
  ): Promise<PaginatedResponse<EditorTemplate>> {
    return request<PaginatedResponse<EditorTemplate>>(
      'GET',
      `/api/templates${buildQuery(params as Record<string, unknown>)}`,
    );
  }

  getTemplate(id: string): Promise<EditorTemplate> {
    return request<EditorTemplate>('GET', `/api/templates/${id}`);
  }

  applyTemplate(templateId: string, title?: string): Promise<EditorProject> {
    return request<EditorProject>('POST', `/api/templates/${templateId}/apply`, { title });
  }

  // ── Music ─────────────────────────────────────────────────────────────

  searchMusic(
    params: {
      query?: string;
      genre?: string;
      mood?: string;
      bpm_min?: number;
      bpm_max?: number;
    } & PaginationParams,
  ): Promise<PaginatedResponse<MusicTrack>> {
    return request<PaginatedResponse<MusicTrack>>(
      'GET',
      `/api/music${buildQuery(params as Record<string, unknown>)}`,
    );
  }

  getMusicTrack(id: string): Promise<MusicTrack> {
    return request<MusicTrack>('GET', `/api/music/${id}`);
  }

  // ── Stickers ──────────────────────────────────────────────────────────

  listStickerPacks(
    params?: PaginationParams,
  ): Promise<PaginatedResponse<StickerPack>> {
    return request<PaginatedResponse<StickerPack>>(
      'GET',
      `/api/stickers${buildQuery(params as Record<string, unknown>)}`,
    );
  }

  getStickerPack(id: string): Promise<StickerPack & { items: StickerItem[] }> {
    return request<StickerPack & { items: StickerItem[] }>(
      'GET',
      `/api/stickers/${id}`,
    );
  }

  // ── Assets ────────────────────────────────────────────────────────────

  registerAsset(data: RegisterAssetInput): Promise<EditorAsset> {
    return request<EditorAsset>('POST', '/api/assets', data);
  }

  listAssets(
    params?: { type?: string; project_id?: string } & PaginationParams,
  ): Promise<PaginatedResponse<EditorAsset>> {
    return request<PaginatedResponse<EditorAsset>>(
      'GET',
      `/api/assets${buildQuery(params as Record<string, unknown>)}`,
    );
  }

  deleteAsset(id: string): Promise<void> {
    return request<void>('DELETE', `/api/assets/${id}`);
  }
}

// Синглтон — один экземпляр на всё приложение
export const editorApi = new EditorApiClient();

// Реэкспорт для удобства
export { getTokenSync };
