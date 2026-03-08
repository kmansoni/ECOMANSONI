/**
 * React Query hooks for the Livestream Gateway API.
 *
 * All queries use TanStack Query v5.  Mutations emit toast
 * notifications via `sonner` on success and error.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/services/livestreamApi';
import type {
  ActiveStreamsParams,
  CreateStreamPayload,
} from '@/types/livestream';

// ---------------------------------------------------------------------------
// Query key factory — centralised to prevent typos
// ---------------------------------------------------------------------------

export const livestreamKeys = {
  activeStreams: (params?: ActiveStreamsParams) => ['streams', params] as const,
  stream: (sessionId: number | undefined) => ['stream', sessionId] as const,
  analytics: (sessionId: number | undefined) => ['streamAnalytics', sessionId] as const,
  streamKeys: () => ['streamKeys'] as const,
  guests: (sessionId: number | undefined) => ['streamGuests', sessionId] as const,
} as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List active streams. Refetches every 15 s to keep viewer counts fresh. */
export function useActiveStreams(params?: ActiveStreamsParams) {
  return useQuery({
    queryKey: livestreamKeys.activeStreams(params),
    queryFn: ({ signal }) => api.getActiveStreams(params, signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** Fetch a single session by id. */
export function useStream(sessionId: number | undefined) {
  return useQuery({
    queryKey: livestreamKeys.stream(sessionId),
    queryFn: ({ signal }) => api.getStream(sessionId!, signal),
    enabled: sessionId != null,
  });
}

/** Historical / real-time stream analytics. Cached for 60 s. */
export function useStreamAnalytics(sessionId: number | undefined) {
  return useQuery({
    queryKey: livestreamKeys.analytics(sessionId),
    queryFn: ({ signal }) => api.getAnalytics(sessionId!, signal),
    enabled: sessionId != null,
    staleTime: 60_000,
  });
}

/** Authenticated user's RTMP/WHIP stream keys. */
export function useStreamKeys() {
  return useQuery({
    queryKey: livestreamKeys.streamKeys(),
    queryFn: ({ signal }) => api.getStreamKeys(signal),
  });
}

/** Guest list for a session. Refetches every 5 s during co-streaming. */
export function useStreamGuests(sessionId: number | undefined) {
  return useQuery({
    queryKey: livestreamKeys.guests(sessionId),
    queryFn: ({ signal }) => api.getGuests(sessionId!, signal),
    enabled: sessionId != null,
    refetchInterval: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new live session. Invalidates active streams list on success. */
export function useCreateStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStreamPayload) => api.createStream(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['streams'] });
      toast.success('Stream created');
    },
    onError: (err: Error) => toast.error(`Failed to create stream: ${err.message}`),
  });
}

/** Transition session to 'live'. Invalidates the session query. */
export function useStartStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.startStream(sessionId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.stream(data.id) });
      toast.success('Stream started');
    },
    onError: (err: Error) => toast.error(`Failed to start stream: ${err.message}`),
  });
}

/** Transition session to 'ended'. Invalidates the session query. */
export function useStopStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.stopStream(sessionId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.stream(data.id) });
      toast.success('Stream ended');
    },
    onError: (err: Error) => toast.error(`Failed to stop stream: ${err.message}`),
  });
}

/** Invite a viewer as a guest co-host. */
export function useInviteGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, userId }: { sessionId: number; userId: string }) =>
      api.inviteGuest(sessionId, userId),
    onSuccess: (_data, { sessionId }) => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.guests(sessionId) });
      toast.success('Guest invited');
    },
    onError: (err: Error) => toast.error(`Invite failed: ${err.message}`),
  });
}

/** Accept a pending guest invitation. */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, guestId }: { sessionId: number; guestId: string }) =>
      api.acceptInvite(sessionId, guestId),
    onSuccess: (_data, { sessionId }) => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.guests(sessionId) });
      toast.success('Invitation accepted');
    },
    onError: (err: Error) => toast.error(`Accept failed: ${err.message}`),
  });
}

/** Kick a guest from the co-hosting slot. */
export function useKickGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, guestId }: { sessionId: number; guestId: string }) =>
      api.kickGuest(sessionId, guestId),
    onSuccess: (_data, { sessionId }) => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.guests(sessionId) });
      toast.success('Guest removed');
    },
    onError: (err: Error) => toast.error(`Kick failed: ${err.message}`),
  });
}

/** Ban a viewer from the stream chat. */
export function useBanUser() {
  return useMutation({
    mutationFn: ({
      sessionId,
      userId,
      reason,
    }: {
      sessionId: number;
      userId: string;
      reason?: string;
    }) => api.banUser(sessionId, userId, reason),
    onSuccess: () => toast.success('User banned'),
    onError: (err: Error) => toast.error(`Ban failed: ${err.message}`),
  });
}

/** Delete a chat message (moderation action). */
export function useDeleteMessage() {
  return useMutation({
    mutationFn: ({
      sessionId,
      messageId,
    }: {
      sessionId: number;
      messageId: number;
    }) => api.deleteMessage(sessionId, messageId),
    onSuccess: () => toast.success('Message deleted'),
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}

/** Pin a chat message. */
export function usePinMessage() {
  return useMutation({
    mutationFn: ({
      sessionId,
      messageId,
    }: {
      sessionId: number;
      messageId: number;
    }) => api.pinMessage(sessionId, messageId),
    onSuccess: () => toast.success('Message pinned'),
    onError: (err: Error) => toast.error(`Pin failed: ${err.message}`),
  });
}

/** Create a new RTMP/WHIP stream key. Invalidates stream keys list. */
export function useCreateStreamKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createStreamKey(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.streamKeys() });
      toast.success('Stream key created');
    },
    onError: (err: Error) => toast.error(`Create key failed: ${err.message}`),
  });
}

/** Rotate (regenerate) an existing stream key. Invalidates stream keys list. */
export function useRotateStreamKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => api.rotateStreamKey(keyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: livestreamKeys.streamKeys() });
      toast.success('Stream key rotated');
    },
    onError: (err: Error) => toast.error(`Rotate key failed: ${err.message}`),
  });
}
