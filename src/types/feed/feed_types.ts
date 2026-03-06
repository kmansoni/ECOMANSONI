/**
 * @file src/types/feed/feed_types.ts
 * @description Базовые доменные типы системы ленты Mansoni Feed v1.1.
 */

export type FeedSurface = "home_feed";

export type FeedSourceClass =
  | "social"
  | "discovery"
  | "creator"
  | "utility"
  | "business"
  | "sponsored";

export type FeedAuthorClass =
  | "friend"
  | "followed_creator"
  | "discovered_creator"
  | "business"
  | "local_entity";

export type FeedContentType =
  | "photo"
  | "video"
  | "carousel"
  | "text"
  | "business_card"
  | "event_card"
  | "reel_card";

export type FeedReasonCode =
  | "follow_recent"
  | "chat_affinity_recent"
  | "high_affinity"
  | "trusted_discovery"
  | "fresh"
  | "local_relevance"
  | "utility_relevance";

export type ScoreComponentName =
  | "relationship"
  | "relevance"
  | "freshness"
  | "quality"
  | "trust"
  | "conversation"
  | "utility"
  | "diversity_prior"
  | "local_context"
  | "abuse_penalty"
  | "fairness_adjustment";

export type NormalizationMethod =
  | "minmax_clamped"
  | "logistic"
  | "piecewise_decay"
  | "bucketed_lookup"
  | "zscore_then_clamp";

export type FreshnessCurveType =
  | "friend_post"
  | "creator_post"
  | "utility_card"
  | "local_event"
  | "business_update"
  | "reel_card";

export type NegativeFeedbackType =
  | "hide_post"
  | "not_interested_topic"
  | "less_from_author"
  | "mute_author"
  | "mute_topic"
  | "hide_business_content"
  | "hide_local_offers"
  | "hide_recommendations"
  | "report_spam"
  | "report_abuse";

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

export interface FeedCandidate {
  candidate_id: string;
  entity_id: string;
  author_id: string;
  source_class: FeedSourceClass;
  source_pools: string[];
  content_type: FeedContentType;
  author_class: FeedAuthorClass;
  topic_tags: string[];
  published_at: string;
  region_code?: string | null;
  language_code?: string | null;
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

export interface RankScoreBreakdown {
  relationship_score: number;
  relevance_score: number;
  freshness_score: number;
  quality_score: number;
  trust_score: number;
  conversation_score: number;
  utility_score: number;
  diversity_prior: number;
  local_context_score: number;
  fairness_prior: number;
}

export interface RankedCandidate {
  candidate: FeedCandidate;
  breakdown: RankScoreBreakdown;
  base_score: number;
  trust_modifier: number;
  abuse_modifier: number;
  fatigue_modifier: number;
  session_intent_modifier: number;
  policy_modifier: number;
  final_score: number;
}

// ---------------------------------------------------------------------------
// Feed Item (API response)
// ---------------------------------------------------------------------------

export interface FeedItemDto {
  item_id: string;
  entity_type: "post";
  entity_id: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
    trust_badges: string[];
  };
  content: {
    content_type: FeedContentType;
    caption: string | null;
    media: Array<{
      kind: "image" | "video";
      preview_url: string;
      width: number;
      height: number;
      duration_ms?: number;
    }>;
  };
  social_context: {
    reason_codes: FeedReasonCode[];
    mutual_signals: {
      liked_by_friends_count: number;
    };
  };
  viewer_state: {
    liked: boolean;
    saved: boolean;
    hidden: boolean;
    following_author: boolean;
  };
  actions: {
    can_like: boolean;
    can_comment: boolean;
    can_share: boolean;
    can_save: boolean;
    can_hide: boolean;
    can_report: boolean;
  };
  tracking: {
    impression_token: string;
  };
}

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

export interface FairnessContext {
  author_recent_exposure_percentile: number;
  author_global_size_bucket: "new" | "small" | "mid" | "large";
  category_exposure_pressure: number;
  long_tail_priority: number;
  clean_new_creator: boolean;
}

// ---------------------------------------------------------------------------
// Abuse signals
// ---------------------------------------------------------------------------

export interface FeedAbuseSignals {
  suspicious_velocity_score: number;
  engagement_entropy_score: number;
  engagement_cluster_concentration: number;
  near_duplicate_score: number;
  geo_burst_score: number;
  low_trust_engager_ratio: number;
  comment_template_similarity: number;
  save_ring_score: number;
}

// ---------------------------------------------------------------------------
// Score spec
// ---------------------------------------------------------------------------

export interface ScoreComponentSpec {
  name: ScoreComponentName;
  scorer_version: string;
  feature_version: string;
  normalization_version: string;
  min_value: 0;
  max_value: 1;
  fallback_value: number;
  description?: string;
}

export interface NormalizationSpec {
  method: NormalizationMethod;
  params: Record<string, number>;
}

export interface FreshnessSpec {
  content_curve: FreshnessCurveType;
  half_life_hours?: number;
  hard_expiry_hours?: number;
  deadline_sensitive?: boolean;
  stale_floor_penalty?: number;
}

// ---------------------------------------------------------------------------
// Client card state
// ---------------------------------------------------------------------------

export interface FeedCardState {
  itemId: string;
  impressionSent: boolean;
  visibleMs: number;
  mediaPrepared: boolean;
  liked: boolean;
  saved: boolean;
  hidden: boolean;
  lastVisibilityAt?: number;
}
