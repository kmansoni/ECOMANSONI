/**
 * @file src/types/feed/feed_decision_log_schema.ts
 * @description Схема внутреннего лога решений ранжирования для отладки и replay.
 * Используется только на бэкенде, не для клиента.
 */

export interface FeedDecisionLog {
  feed_request_id: string;
  session_id: string;
  user_id: string;
  surface: "home_feed";
  policy_version: string;
  degraded_mode?: string;
  candidate_set_id: string;
  entity_id: string;
  origins: string[];
  score_breakdown: {
    relationship: number;
    relevance: number;
    freshness: number;
    quality: number;
    trust: number;
    conversation: number;
    utility: number;
    diversity_prior: number;
    local_context: number;
    fairness_prior: number;
  };
  modifiers: {
    trust_modifier: number;
    abuse_modifier: number;
    fatigue_modifier: number;
    session_intent_modifier: number;
    policy_modifier: number;
  };
  policy_events: string[];
  blocked_by?: string[];
  final_score: number;
  selected_slot?: number;
  ts: string;
}
