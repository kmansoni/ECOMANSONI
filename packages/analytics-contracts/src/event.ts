export type AnalyticsObjectType = "story" | "reel" | "post" | "profile";

export type AnalyticsEventType =
  | "view_start"
  | "view_end"
  | "view_progress"
  | "tap_forward"
  | "tap_back"
  | "exit"
  | "like_toggle"
  | "reaction"
  | "comment_open"
  | "comment_send"
  | "share_open"
  | "share_complete"
  | "follow_click"
  | "hide"
  | "mute"
  | "report"
  | "link_click"
  | "sticker_interaction";

export type AnalyticsPlatform = "ios" | "android" | "web";

export type AnalyticsEventV1 = {
  v: 1;
  event_id: string;
  event_ts: string;
  actor_id: string;
  device_id: string;
  session_id: string;
  object_type: AnalyticsObjectType;
  object_id: string;
  owner_id: string;
  event_type: AnalyticsEventType;
  event_subtype?: string;
  watch_ms?: number;
  position_index?: number;
  duration_ms?: number;
  app_build?: string;
  platform?: AnalyticsPlatform;
  network_type?: string;
  country_code?: string;
  props?: Record<string, unknown>;
};

export type AnalyticsBatchV1 = {
  v: 1;
  events: AnalyticsEventV1[];
};
