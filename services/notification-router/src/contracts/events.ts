import type {
  IncomingCallPushPayload,
  MessagePushPayload,
  SecurityPushPayload,
} from "./payloads";

export type NotificationEventType = "message" | "incoming_call" | "security";
export type NotificationEventStatus = "pending" | "processing" | "delivered" | "failed";

interface BaseNotificationEvent {
  eventId: string;
  userId: string;
  priority: number;
  ttlSeconds: number;
  collapseKey?: string;
  dedupKey?: string;
  createdAtMs: number;
  attempts: number;
  maxAttempts: number;
}

export type NotificationEvent =
  | (BaseNotificationEvent & { type: "message"; payload: MessagePushPayload })
  | (BaseNotificationEvent & { type: "incoming_call"; payload: IncomingCallPushPayload })
  | (BaseNotificationEvent & { type: "security"; payload: SecurityPushPayload });

export interface DeviceToken {
  userId: string;
  deviceId: string;
  platform: "ios" | "android" | "web";
  provider: "apns" | "fcm";
  token: string;
  isValid: boolean;
  pushEnabled: boolean;
  callPushEnabled: boolean;
  lastSeenAtMs?: number;
}

export type DeliveryStatus = "queued" | "sent" | "failed" | "invalid_token" | "dropped";

export interface DeliveryAttempt {
  eventId: string;
  deviceId: string;
  provider: "apns" | "fcm";
  status: DeliveryStatus;
  attempt: number;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}
