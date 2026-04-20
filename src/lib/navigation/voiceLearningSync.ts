import { dbLoose, supabase } from '@/lib/supabase';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import type { VoiceResolveResult } from '@/lib/navigation/voiceAddressResolver';
import type { FiasAddress } from '@/types/fias';

const STORAGE_KEY = 'nav_voice_learning_queue_v1';

type QueueItem =
  | {
      id: string;
      type: 'utterance';
      payload: {
        transcriptDraft: string;
        transcriptFinal: string;
        languageCode: string;
        source: 'voice' | 'search_text';
        noveltyScore: number;
        parsedAddress: Record<string, unknown>;
        validationStatus: 'confirmed' | 'provisional' | 'pending_review' | 'rejected';
        validationPayload: Record<string, unknown>;
        metadata: Record<string, unknown>;
      };
    }
  | {
      id: string;
      type: 'feedback';
      payload: {
        utteranceId: string | null;
        correctedTranscript: string;
        correctedAddress: Record<string, unknown>;
        feedbackType: string;
        sampleSource: string;
        validationSource: string;
        confidence: number;
        noveltyScore: number;
      };
    };

let _flushPromise: Promise<void> | null = null;
let _started = false;

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore quota issues; offline local learning still works.
  }
}

function enqueue(item: QueueItem): void {
  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function estimateNoveltyScore(transcript: string, resolved: VoiceResolveResult): number {
  const normalized = transcript.toLowerCase();
  let score = 0;

  if (/\b(к\.?|корпус|корп)\s*\d+/i.test(normalized)) score += 0.35;
  if (/\b\d+[а-яa-z-]*\b/.test(normalized)) score += 0.1;
  if (resolved.learnedResults.length === 0 && resolved.results.length <= 2) score += 0.2;
  if (resolved.usedLearning) score += 0.1;
  if (resolved.queryVariants.length >= 3) score += 0.1;
  return Math.min(score, 1);
}

function mapAddressForSync(addr: FiasAddress | null): Record<string, unknown> {
  if (!addr) return {};
  return {
    country: addr.country,
    locality: addr.city,
    road: addr.street || addr.value.split(',')[0] || addr.value,
    house_number: addr.house,
    corpus: addr.block,
    postal_code: addr.postalCode,
    lat: addr.geoLat,
    lon: addr.geoLon,
    display: addr.unrestrictedValue || addr.value,
  };
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}

export async function flushVoiceLearningQueue(): Promise<void> {
  if (_flushPromise) return _flushPromise;

  _flushPromise = (async () => {
    const settings = useNavigatorSettings.getState();
    if (!settings.voiceBackendSyncEnabled) return;
    if (!navigator.onLine) return;

    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    let queue = loadQueue();
    if (queue.length === 0) return;

    const remaining: QueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.type === 'utterance') {
          const { error } = await dbLoose.rpc('nav_record_voice_learning_event', {
            p_transcript_draft: item.payload.transcriptDraft,
            p_transcript_final: item.payload.transcriptFinal,
            p_language_code: item.payload.languageCode,
            p_accent_tag: null,
            p_source: item.payload.source,
            p_novelty_score: item.payload.noveltyScore,
            p_parsed_address: item.payload.parsedAddress,
            p_validation_status: item.payload.validationStatus,
            p_validation_payload: item.payload.validationPayload,
            p_metadata: item.payload.metadata,
          });
          if (error) throw error;
        } else {
          const { error } = await dbLoose.rpc('nav_record_voice_feedback', {
            p_utterance_id: item.payload.utteranceId,
            p_corrected_transcript: item.payload.correctedTranscript,
            p_corrected_address: item.payload.correctedAddress,
            p_feedback_type: item.payload.feedbackType,
            p_sample_source: item.payload.sampleSource,
            p_validation_source: item.payload.validationSource,
            p_confidence: item.payload.confidence,
            p_novelty_score: item.payload.noveltyScore,
          });
          if (error) throw error;
        }
      } catch {
        remaining.push(item);
      }
    }

    queue = remaining;
    saveQueue(queue);
  })().finally(() => {
    _flushPromise = null;
  });

  return _flushPromise;
}

export function startVoiceLearningSync(): () => void {
  if (_started) {
    return () => undefined;
  }
  _started = true;

  const handleOnline = () => {
    void flushVoiceLearningQueue();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void flushVoiceLearningQueue();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);
  void flushVoiceLearningQueue();

  return () => {
    _started = false;
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

export function recordVoiceSearchLearningEvent(input: {
  transcript: string;
  resolved: VoiceResolveResult;
  chosenAddress?: FiasAddress | null;
  source?: 'voice' | 'search_text';
}): string {
  const settings = useNavigatorSettings.getState();
  if (!settings.voiceLearningEnabled) return '';

  const topAddress = input.chosenAddress ?? null;
  const noveltyScore = estimateNoveltyScore(input.transcript, input.resolved);
  const utteranceId = createId('utterance');
  enqueue({
    id: utteranceId,
    type: 'utterance',
    payload: {
      transcriptDraft: input.transcript,
      transcriptFinal: input.resolved.normalizedText || input.transcript,
      languageCode: 'ru',
      source: input.source ?? 'voice',
      noveltyScore,
      parsedAddress: mapAddressForSync(topAddress),
      validationStatus: topAddress ? 'provisional' : 'pending_review',
      validationPayload: {
        usedLearning: input.resolved.usedLearning,
        learnedResults: input.resolved.learnedResults.length,
      },
      metadata: {
        query_variants: input.resolved.queryVariants,
        novelty_reasons: noveltyScore >= 0.6 ? ['local_hotspot_candidate'] : [],
        local_only: !settings.voiceAllowOnlineFallback,
      },
    },
  });
  void flushVoiceLearningQueue();
  return utteranceId;
}

export function recordVoiceSelectionFeedback(input: {
  utteranceId?: string | null;
  heardText: string;
  selectedAddress: FiasAddress;
  feedbackType?: string;
}): void {
  const settings = useNavigatorSettings.getState();
  if (!settings.voiceLearningEnabled) return;

  enqueue({
    id: createId('feedback'),
    type: 'feedback',
    payload: {
      utteranceId: isUuid(input.utteranceId) ? input.utteranceId : null,
      correctedTranscript: input.selectedAddress.unrestrictedValue || input.selectedAddress.value,
      correctedAddress: mapAddressForSync(input.selectedAddress),
      feedbackType: input.feedbackType ?? 'explicit_correction',
      sampleSource: 'user_correction',
      validationSource: 'user_selection',
      confidence: 0.99,
      noveltyScore: /\b(к\.?|корпус|корп)\s*\d+/i.test(input.heardText.toLowerCase()) ? 0.65 : 0.1,
    },
  });
  void flushVoiceLearningQueue();
}