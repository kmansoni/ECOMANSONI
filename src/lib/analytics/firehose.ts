import { getOrCreateDeviceId } from "@/lib/multiAccount/vault";
import { AnalyticsFirehoseClient } from "./firehoseClient";
import type {
  AnalyticsEventType,
  AnalyticsEventV1,
  AnalyticsObjectType,
  AnalyticsPlatform,
} from "./types";

const ANALYTICS_SESSION_KEY = "mansoni:analytics_session_id";

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateAnalyticsSessionId(): string {
  if (typeof sessionStorage === "undefined") return safeRandomUUID();
  const existing = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing && existing.trim()) return existing;
  const next = safeRandomUUID();
  try {
    sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
  } catch {
    // ignore
  }
  return next;
}

function getPlatform(): AnalyticsPlatform | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "ios";
  return "web";
}

const endpoint = (import.meta as any)?.env?.VITE_ANALYTICS_INGEST_URL ?? "";
const firehose = new AnalyticsFirehoseClient({
  endpoint,
  enabled: Boolean(endpoint),
});

export function trackAnalyticsEvent(input: {
  actorId: string;
  objectType: AnalyticsObjectType;
  objectId: string;
  ownerId: string;
  eventType: AnalyticsEventType;
  eventSubtype?: string;
  watchMs?: number;
  positionIndex?: number;
  durationMs?: number;
  props?: Record<string, unknown>;
}): void {
  if (!endpoint) return;

  const deviceId = getOrCreateDeviceId();
  const sessionId = getOrCreateAnalyticsSessionId();
  const event: AnalyticsEventV1 = {
    v: 1,
    event_id: safeRandomUUID(),
    event_ts: new Date().toISOString(),
    actor_id: input.actorId,
    device_id: deviceId,
    session_id: sessionId,
    object_type: input.objectType,
    object_id: input.objectId,
    owner_id: input.ownerId,
    event_type: input.eventType,
    event_subtype: input.eventSubtype,
    watch_ms: input.watchMs,
    position_index: input.positionIndex,
    duration_ms: input.durationMs,
    platform: getPlatform(),
    props: input.props ?? {},
  };

  firehose.track(event);
}
