/**
 * Трекер взаимодействий пользователя
 * Батч-запись в Supabase с debounce 5сек, max 50 событий
 */

import { supabase } from '@/integrations/supabase/client';

export type ContentType = 'post' | 'reel' | 'story' | 'profile' | 'hashtag';
export type InteractionType = 'view' | 'like' | 'comment' | 'share' | 'save' | 'follow' | 'dwell_time' | 'skip';

interface InteractionEvent {
  content_type: ContentType;
  content_id: string;
  interaction_type: InteractionType;
  value: number;
  metadata?: Record<string, unknown>;
}

const MAX_BATCH_SIZE = 50;
const DEBOUNCE_MS = 5000;

let pendingEvents: InteractionEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let userId: string | null = null;

function getDedupeKey(event: InteractionEvent): string {
  return `${event.content_type}:${event.content_id}:${event.interaction_type}`;
}

async function flush() {
  if (pendingEvents.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    pendingEvents = [];
    return;
  }

  const batch = pendingEvents.slice(0, MAX_BATCH_SIZE);
  pendingEvents = pendingEvents.slice(MAX_BATCH_SIZE);

  const rows = batch.map((e) => ({
    user_id: user.id,
    content_type: e.content_type,
    content_id: e.content_id,
    interaction_type: e.interaction_type,
    value: e.value,
    metadata: e.metadata ?? {},
  }));

  try {
    await (supabase as any).from('user_interactions').insert(rows);
  } catch (err) {
    console.warn('[tracker] flush error:', err);
  }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);

  if (pendingEvents.length >= MAX_BATCH_SIZE) {
    clearTimeout(flushTimer!);
    flushTimer = null;
    void flush();
  }
}

function track(event: InteractionEvent) {
  // Дедупликация через sessionStorage (не отслеживаем одинаковые view/skip дважды в сессии)
  if (event.interaction_type === 'view' || event.interaction_type === 'skip') {
    const key = `track_${getDedupeKey(event)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  }

  pendingEvents.push(event);
  scheduleFlush();
}

export const tracker = {
  trackView(contentType: ContentType, contentId: string, dwellTimeMs?: number) {
    track({
      content_type: contentType,
      content_id: contentId,
      interaction_type: 'view',
      value: 1.0,
      metadata: dwellTimeMs ? { dwell_ms: dwellTimeMs } : {},
    });
  },

  trackDwellTime(contentType: ContentType, contentId: string, dwellTimeMs: number) {
    track({
      content_type: contentType,
      content_id: contentId,
      interaction_type: 'dwell_time',
      value: dwellTimeMs / 1000, // в секундах
    });
  },

  trackLike(contentType: ContentType, contentId: string) {
    track({ content_type: contentType, content_id: contentId, interaction_type: 'like', value: 1.0 });
  },

  trackComment(contentType: ContentType, contentId: string) {
    track({ content_type: contentType, content_id: contentId, interaction_type: 'comment', value: 1.0 });
  },

  trackShare(contentType: ContentType, contentId: string) {
    track({ content_type: contentType, content_id: contentId, interaction_type: 'share', value: 1.0 });
  },

  trackSave(contentType: ContentType, contentId: string) {
    track({ content_type: contentType, content_id: contentId, interaction_type: 'save', value: 1.0 });
  },

  trackSkip(contentType: ContentType, contentId: string) {
    track({ content_type: contentType, content_id: contentId, interaction_type: 'skip', value: -1.0 });
  },

  trackFollow(profileId: string) {
    track({ content_type: 'profile', content_id: profileId, interaction_type: 'follow', value: 1.0 });
  },

  /** Принудительная запись — вызывать при уходе со страницы */
  async forceFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    await flush();
  },
};

// Запись при закрытии страницы
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void tracker.forceFlush();
    }
  });
}
