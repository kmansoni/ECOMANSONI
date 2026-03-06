/**
 * @file src/types/feed/feed_cursor_spec.ts
 * @description Спецификация подписантного курсора пагинации ленты Mansoni Feed v1.1.
 *
 * Cursor = base64url(JSON payload) + "." + HMAC-SHA256(signature)
 *
 * Правила:
 * - Курсор привязан к конкретной policy_version
 * - Курсор привязан к конкретному candidate_set_id
 * - При invalidation candidate set сервер отдаёт cursor_invalidated
 * - Нельзя продолжать по старому cursor на новом candidate set
 * - Нельзя silently менять policy во время cursor-continuation
 */

export type FeedCursorMode = "normal" | "degraded";

export interface FeedCursorPayload {
  session_id: string;
  surface: "home_feed";
  policy_version: string;
  candidate_set_id: string;
  page_index: number;
  seen_watermark: string;
  generation_ts: string;
  mode: FeedCursorMode;
}

export interface EncodedFeedCursor {
  payload_b64url: string;
  signature_hex: string;
}
