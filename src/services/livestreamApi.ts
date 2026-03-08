/**
 * Livestream Gateway API HTTP client.
 *
 * Typed async functions for every Gateway endpoint.
 * Automatically attaches Supabase session JWT as Bearer token.
 * Implements exponential-backoff retry (max 3) on 5xx responses.
 * Supports AbortController signal propagation.
 *
 * Base URL: import.meta.env.VITE_LIVESTREAM_GATEWAY_URL
 */

import { supabase } from '@/lib/supabase';
import type {
  ActiveStreamsParams,
  CreateStreamPayload,
  LiveGuest,
  LiveKitGuestTokenResponse,
  LiveKitTokenResponse,
  LiveSession,
  PaginatedResponse,
  RealtimeAnalytics,
  StreamAnalytics,
  StreamKey,
} from '@/types/livestream';

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

/** Typed API error carrying HTTP status and server message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BASE_URL = (): string => {
  const url = import.meta.env.VITE_LIVESTREAM_GATEWAY_URL as string | undefined;
  if (!url) throw new Error('VITE_LIVESTREAM_GATEWAY_URL is not defined');
  return url.replace(/\/$/, '');
};

async function getAuthHeader(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) throw new ApiError(401, 'No active session');
  return `Bearer ${session.access_token}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; signal?: AbortSignal; params?: Record<string, string | number | boolean> } = {},
): Promise<T> {
  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };

  let url = `${BASE_URL()}${path}`;
  if (options.params) {
    const q = new URLSearchParams(
      Object.entries(options.params).map(([k, v]) => [k, String(v)]),
    );
    url += `?${q.toString()}`;
  }

  const res = await fetchWithRetry(
    url,
    {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    },
  );

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : res.statusText;
    throw new ApiError(res.status, msg, body);
  }

  // 204 No Content — callers must use `void` as T for DELETE-like endpoints
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

/** Create a new live session (status: created). */
export async function createStream(
  payload: CreateStreamPayload,
  signal?: AbortSignal,
): Promise<LiveSession> {
  return request<LiveSession>('POST', '/api/v1/streams', { body: payload, signal });
}

/** Transition session status to 'live'. */
export async function startStream(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveSession> {
  return request<LiveSession>('POST', `/api/v1/streams/${sessionId}/start`, { signal });
}

/** Transition session status to 'ended'. */
export async function stopStream(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveSession> {
  return request<LiveSession>('POST', `/api/v1/streams/${sessionId}/stop`, { signal });
}

/** Fetch a single live session by id. */
export async function getStream(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveSession> {
  return request<LiveSession>('GET', `/api/v1/streams/${sessionId}`, { signal });
}

/** List currently active (status = 'live') streams with optional pagination. */
export async function getActiveStreams(
  params?: ActiveStreamsParams,
  signal?: AbortSignal,
): Promise<PaginatedResponse<LiveSession>> {
  return request<PaginatedResponse<LiveSession>>('GET', '/api/v1/streams', {
    params: params as Record<string, string | number | boolean> | undefined,
    signal,
  });
}

/** Publisher heartbeat — keeps session alive server-side. */
export async function sendHeartbeat(
  sessionId: number,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('POST', `/api/v1/streams/${sessionId}/heartbeat`, { signal });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Obtain a LiveKit publisher token for own stream. */
export async function getPublisherToken(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveKitTokenResponse> {
  return request<LiveKitTokenResponse>('GET', `/api/v1/streams/${sessionId}/tokens/publisher`, { signal });
}

/** Obtain a LiveKit viewer token (read-only). */
export async function getViewerToken(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveKitTokenResponse> {
  return request<LiveKitTokenResponse>('GET', `/api/v1/streams/${sessionId}/tokens/viewer`, { signal });
}

/** Obtain a LiveKit guest (co-host) token with slot assignment. */
export async function getGuestToken(
  sessionId: number,
  inviteToken: string,
  signal?: AbortSignal,
): Promise<LiveKitGuestTokenResponse> {
  return request<LiveKitGuestTokenResponse>('POST', `/api/v1/streams/${sessionId}/tokens/guest`, {
    body: { invite_token: inviteToken },
    signal,
  });
}

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

/** Invite a user as guest co-host. Returns created LiveGuest record. */
export async function inviteGuest(
  sessionId: number,
  userId: string,
  signal?: AbortSignal,
): Promise<LiveGuest> {
  return request<LiveGuest>('POST', `/api/v1/streams/${sessionId}/guests`, {
    body: { user_id: userId },
    signal,
  });
}

/** Accept a guest invitation. */
export async function acceptInvite(
  sessionId: number,
  guestId: string,
  signal?: AbortSignal,
): Promise<LiveGuest> {
  return request<LiveGuest>('POST', `/api/v1/streams/${sessionId}/guests/${guestId}/accept`, { signal });
}

/** Decline a guest invitation. */
export async function declineInvite(
  sessionId: number,
  guestId: string,
  signal?: AbortSignal,
): Promise<LiveGuest> {
  return request<LiveGuest>('POST', `/api/v1/streams/${sessionId}/guests/${guestId}/decline`, { signal });
}

/** Forcibly remove a guest from co-hosting slot. */
export async function kickGuest(
  sessionId: number,
  guestId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('DELETE', `/api/v1/streams/${sessionId}/guests/${guestId}`, { signal });
}

/** List all guests for a session. */
export async function getGuests(
  sessionId: number,
  signal?: AbortSignal,
): Promise<LiveGuest[]> {
  return request<LiveGuest[]>('GET', `/api/v1/streams/${sessionId}/guests`, { signal });
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/** Ban a viewer from the stream chat. */
export async function banUser(
  sessionId: number,
  userId: string,
  reason?: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('POST', `/api/v1/streams/${sessionId}/moderation/ban`, {
    body: { user_id: userId, reason },
    signal,
  });
}

/** Unban a previously banned viewer. */
export async function unbanUser(
  sessionId: number,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('DELETE', `/api/v1/streams/${sessionId}/moderation/ban/${userId}`, { signal });
}

/** Delete a chat message by id. */
export async function deleteMessage(
  sessionId: number,
  messageId: number,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('DELETE', `/api/v1/streams/${sessionId}/chat/${messageId}`, { signal });
}

/** Pin a chat message. */
export async function pinMessage(
  sessionId: number,
  messageId: number,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('PUT', `/api/v1/streams/${sessionId}/chat/${messageId}/pin`, { signal });
}

/** Grant moderator role to a viewer. */
export async function addModerator(
  sessionId: number,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('POST', `/api/v1/streams/${sessionId}/moderation/moderators`, {
    body: { user_id: userId },
    signal,
  });
}

// ---------------------------------------------------------------------------
// Stream keys
// ---------------------------------------------------------------------------

/** List all stream keys for the authenticated user. */
export async function getStreamKeys(signal?: AbortSignal): Promise<StreamKey[]> {
  return request<StreamKey[]>('GET', '/api/v1/stream-keys', { signal });
}

/** Create a new stream key. Returns full key value (only time it's unmasked). */
export async function createStreamKey(
  name: string,
  signal?: AbortSignal,
): Promise<StreamKey> {
  return request<StreamKey>('POST', '/api/v1/stream-keys', { body: { name }, signal });
}

/** Rotate (invalidate + regenerate) a stream key. Returns new full key value. */
export async function rotateStreamKey(
  keyId: string,
  signal?: AbortSignal,
): Promise<StreamKey> {
  return request<StreamKey>('POST', `/api/v1/stream-keys/${keyId}/rotate`, { signal });
}

/** Permanently delete a stream key. */
export async function deleteStreamKey(
  keyId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>('DELETE', `/api/v1/stream-keys/${keyId}`, { signal });
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** Historical analytics for a completed or active stream. */
export async function getAnalytics(
  sessionId: number,
  signal?: AbortSignal,
): Promise<StreamAnalytics> {
  return request<StreamAnalytics>('GET', `/api/v1/streams/${sessionId}/analytics`, { signal });
}

/** Lightweight real-time metrics snapshot for an active stream. */
export async function getRealtimeAnalytics(
  sessionId: number,
  signal?: AbortSignal,
): Promise<RealtimeAnalytics> {
  return request<RealtimeAnalytics>('GET', `/api/v1/streams/${sessionId}/analytics/realtime`, { signal });
}
