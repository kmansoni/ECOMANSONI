/**
 * @file src/types/feed/feed_event_schema.ts
 * @description Канонические event-контракты ленты Mansoni Feed v1.1.
 */

export type FeedEventType =
  | "impression"
  | "media_start"
  | "media_3s_view"
  | "media_complete"
  | "like"
  | "save"
  | "share"
  | "comment_open"
  | "comment_submit"
  | "profile_open"
  | "follow_after_view"
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

export interface FeedEventBase {
  event_id: string;
  event_type: FeedEventType;
  event_schema_version: "1.1.0";
  user_id: string;
  session_id: string;
  feed_request_id: string;
  entity_id: string;
  position: number;
  client_ts: string;
  server_ts?: string;
  policy_version: string;
}

export interface FeedImpressionEvent extends FeedEventBase {
  event_type: "impression";
  visible_ms: number;
  visibility_pct: number;
}

export interface FeedInteractionEvent extends FeedEventBase {
  event_type:
    | "like"
    | "save"
    | "share"
    | "comment_open"
    | "comment_submit"
    | "profile_open"
    | "follow_after_view";
}

export interface FeedNegativeEvent extends FeedEventBase {
  event_type:
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
  subject_type?: "author" | "topic" | "business" | "post";
  subject_key?: string;
}

export type FeedEvent =
  | FeedImpressionEvent
  | FeedInteractionEvent
  | FeedNegativeEvent;

export interface FeedBatchRequest {
  session_id: string;
  feed_request_id: string;
  events: FeedEvent[];
}

export interface FeedBatchResponse {
  accepted: boolean;
  accepted_count: number;
  deduped_count: number;
}
